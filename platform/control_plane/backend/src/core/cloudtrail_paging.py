"""Bounded, honest CloudTrail LookupEvents paging.

Three Govern services page CloudTrail for AI activity, and all three had the same
defect independently: they passed a MaxResults far above the API's ceiling, took the
first page, and reported it as the whole window.

Two facts make that failure mode invisible, which is why it survived so long:

  * **CloudTrail clamps MaxResults; it does not reject it.** `MaxResults=500` returns
    50 events and a NextToken. No exception, no warning, no `live=False` to propagate
    - just a smaller number under a Live badge.
  * **botocore will not catch the over-max value for you.** Its `range_check()`
    validates a parameter's `min` and never its `max`, so an out-of-range MaxResults
    serialises cleanly and reaches the wire. The SDK model is therefore *not*
    authoritative for maximums; only the service's own `ValidationException` - or
    observed clamping, as here - is.

So paging is mandatory, and paging has to be bounded: an unbounded walk of 30 days of
`InvokeModel` events on a busy account is a request that never returns. Every bound
this module applies is reported back through `LookupResult.note`, because a floor
presented without saying it is a floor reads as a total.

Callers pass the lookup attribute rather than inheriting one. `EventName` is usually
the right axis for invocations: `InvokeModel`/`Converse` are CloudTrail *data* events,
so unless data events are enabled they appear under no eventSource a caller can query,
while `EventSource=bedrock.amazonaws.com` returns only control-plane calls. Look up by
name, then re-check `EventSource` per event so a same-named event from another service
is not miscounted.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence

from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

logger = logging.getLogger(__name__)

# The API's real ceiling for LookupEvents. Enforced by clamping, not by an error.
CT_PAGE_SIZE = 50

# Bounds on a single detection pass. Reaching either is disclosed, never swallowed.
CT_MAX_PAGES = 40
CT_BUDGET_S = 40.0

# Appears in LookupResult.note when a lookup FAILED, as opposed to legitimately
# returning nothing. Callers use it as a cache predicate: a measured zero from a
# reachable CloudTrail is live data and must cache, but a zero that is an artifact of
# a failure must not - it says nothing about the account.
LOOKUP_FAILED_MARKER = "CloudTrail lookup failed"

# Bedrock model-invocation event names, shared by every caller that asks "who invoked
# a model". Kept here so the four names cannot drift between services.
BEDROCK_INVOKE_EVENT_NAMES = (
    "Converse",
    "ConverseStream",
    "InvokeModel",
    "InvokeModelWithResponseStream",
)


@dataclass(frozen=True)
class LookupResult:
    """Events plus an honest account of what was NOT read.

    `by_value` preserves the grouping so a caller can report per-source counts without
    re-deriving them; `events` is the flattened view most callers want.
    """

    by_value: Dict[str, list] = field(default_factory=dict)
    # Attribute values whose walk stopped on the page cap or the time budget.
    capped: tuple = ()
    # Attribute values whose walk stopped because the caller's target was reached.
    at_target: tuple = ()
    # Attribute values whose lookup raised. Their absence from `events` is an artifact
    # of the failure, not a fact about the account.
    failed: tuple = ()
    max_pages: int = CT_MAX_PAGES
    budget_s: float = CT_BUDGET_S

    @property
    def events(self) -> list:
        out: list = []
        for group in self.by_value.values():
            out.extend(group)
        return out

    @property
    def complete(self) -> bool:
        """True when every value was walked to the end of the window."""
        return not (self.capped or self.at_target or self.failed)

    @property
    def note(self) -> Optional[str]:
        """Caveats to surface on the response, or None when nothing was cut short.

        None is meaningful: it means the counts derived from these events are totals
        for the window, not floors.
        """
        parts: List[str] = []
        if self.capped:
            parts.append(
                f"CloudTrail paging stopped at the {self.max_pages}-page / "
                f"{int(self.budget_s)}s bound for {', '.join(sorted(self.capped))}; "
                "counts are a floor, not a total"
            )
        if self.at_target:
            parts.append(
                f"Read only the most recent events for {', '.join(sorted(self.at_target))} "
                "up to the requested limit; counts are a floor, not a total"
            )
        if self.failed:
            parts.append(f"{LOOKUP_FAILED_MARKER} for {', '.join(sorted(self.failed))}")
        return "; ".join(parts) if parts else None


def lookup_events_paged(
    client,
    *,
    attribute_key: str,
    attribute_values: Sequence[str],
    start_time: datetime,
    end_time: Optional[datetime] = None,
    target_per_value: Optional[int] = None,
    page_size: int = CT_PAGE_SIZE,
    max_pages: int = CT_MAX_PAGES,
    budget_s: float = CT_BUDGET_S,
    parallel: bool = True,
) -> LookupResult:
    """Page `cloudtrail:LookupEvents` for each attribute value, bounded and disclosed.

    Args:
        client: a boto3 CloudTrail client. Passed in rather than built here so the
            caller owns region selection - the wrong region does not raise, it just
            returns another region's (usually empty) history.
        attribute_key: e.g. "EventName" or "EventSource". LookupEvents accepts exactly
            one attribute per call, which is why values are walked separately.
        attribute_values: one paged walk per value.
        start_time / end_time: the lookup window.
        target_per_value: stop a value's walk once it has this many events. Reaching it
            is recorded in `at_target` and disclosed, because "the 200 most recent" is
            not "all of them".
        page_size: capped at CT_PAGE_SIZE - a larger value would be silently clamped by
            the service anyway, and pretending otherwise is how this bug class started.
        max_pages / budget_s: bounds on a single pass.
        parallel: walk values concurrently. One thread per value; there are never more
            than a handful.

    Raises:
        ParamValidationError: propagated deliberately. It subclasses BotoCoreError, so
            a broad `except (ClientError, BotoCoreError)` would report a *programming*
            error - a malformed parameter this code built - as an AWS-side outage, and
            degrade honestly to the wrong conclusion.
    """
    if page_size > CT_PAGE_SIZE:
        # Clamp locally and say so. Left to the service, this is invisible.
        logger.debug(
            "Requested CloudTrail page size %d exceeds the API ceiling; using %d",
            page_size, CT_PAGE_SIZE,
        )
        page_size = CT_PAGE_SIZE

    # monotonic, not wall clock: an NTP step must not be able to extend this budget or
    # expire it instantly.
    deadline = time.monotonic() + budget_s

    def _walk(value: str):
        """Return (events, capped, at_target) for one attribute value."""
        out: list = []
        token = None
        pages = 0
        while pages < max_pages and time.monotonic() < deadline:
            kwargs = {
                "LookupAttributes": [
                    {"AttributeKey": attribute_key, "AttributeValue": value}
                ],
                "StartTime": start_time,
                "MaxResults": page_size,
            }
            if end_time is not None:
                kwargs["EndTime"] = end_time
            if token:
                kwargs["NextToken"] = token
            resp = client.lookup_events(**kwargs)
            pages += 1
            out.extend(resp.get("Events", []))
            token = resp.get("NextToken")

            if target_per_value is not None and len(out) >= target_per_value:
                # Reaching the caller's limit does not by itself mean anything was hidden.
                # It hides history in exactly two cases: more events are waiting behind a
                # NextToken, or this page overshot and the slice below discards events that
                # really are in the window. If neither holds, the target simply landed at or
                # above the true total and the count is exact - reporting a "counts are a
                # floor" caveat there would be its own small dishonesty, and an unfalsifiable
                # one, since the reader cannot tell a real caveat from a reflexive one.
                hid_history = bool(token) or len(out) > target_per_value
                return out[:target_per_value], False, hid_history

            if not token:
                return out, False, False       # walked the whole window
        return out, True, False                # hit the page cap or the time budget

    by_value: Dict[str, list] = {}
    capped: List[str] = []
    at_target: List[str] = []
    failed: List[str] = []

    def _record(value: str, outcome) -> None:
        events, was_capped, hit_target = outcome
        by_value[value] = events
        if was_capped:
            capped.append(value)
        if hit_target:
            at_target.append(value)

    if parallel and len(attribute_values) > 1:
        with ThreadPoolExecutor(max_workers=len(attribute_values)) as pool:
            futures = {pool.submit(_walk, v): v for v in attribute_values}
            for fut in as_completed(futures):
                value = futures[fut]
                try:
                    _record(value, fut.result())
                except ParamValidationError:
                    raise
                except (ClientError, BotoCoreError) as e:
                    # WARNING, not debug. A lookup that fails on every request is
                    # invisible at debug level, and its emptiness is indistinguishable
                    # from "this account has no AI activity" - which is exactly how
                    # three services came to report a measured zero they never measured.
                    logger.warning(
                        "CloudTrail %s=%s lookup failed: %s", attribute_key, value, e
                    )
                    by_value[value] = []
                    failed.append(value)
    else:
        for value in attribute_values:
            try:
                _record(value, _walk(value))
            except ParamValidationError:
                raise
            except (ClientError, BotoCoreError) as e:
                logger.warning(
                    "CloudTrail %s=%s lookup failed: %s", attribute_key, value, e
                )
                by_value[value] = []
                failed.append(value)

    return LookupResult(
        by_value=by_value,
        capped=tuple(capped),
        at_target=tuple(at_target),
        failed=tuple(failed),
        max_pages=max_pages,
        budget_s=budget_s,
    )
