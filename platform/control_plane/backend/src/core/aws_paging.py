"""Bounded, honest paging for AWS `list_*` operations, with truncation disclosed.

The sibling module `core/cloudtrail_paging` handles CloudTrail specifically, because
`LookupEvents` takes one lookup attribute per call and needs a walk per value. This module
is for the ordinary case: a `list_*` operation whose result feeds a count or a per-item
loop.

The defect this exists to stop is the same one, in its milder form. Across the Govern
services, calls like `list_agents(maxResults=100)` read ONE page and reported
`total=len(items)`. The request is legal - unlike the CloudTrail case, nothing is being
silently clamped - but there is no pagination, so the number is a hard ceiling reported as
a measurement. A fleet of 300 agents reports 100. That is invisible on a small account and
becomes wrong at exactly the moment the estate grows, which is the worst possible time for
a governance dashboard to start understating.

Two deliberate design choices:

**Paginators, not hand-rolled NextToken loops.** Every operation this module is used for
answers `client.can_paginate(op) is True` (verified at each call site). The paginator
knows each service's token field, so the same code works whether the service spells it
`nextToken`, `NextToken`, or `Marker`, and there is no token threading to get wrong.

**`MaxItems` for the bound, because that is what makes truncation detectable.** Breaking
out of a paginator loop by hand leaves `PageIterator.resume_token` as None, so a
hand-bounded walk CANNOT tell "I stopped early and more exists" from "I read everything" -
measured against botocore 1.43.10, resume_token was None in both cases. Passing `MaxItems`
lets the iterator stop itself, and then resume_token is populated only when data actually
remains. Verified, including the edge case that matters most: `MaxItems=3` against exactly
3 items yields resume_token None, so an exact count does not acquire a false caveat.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

logger = logging.getLogger(__name__)

# Default ceiling on a single bounded walk. High enough that no realistic governed estate
# hits it during a dashboard load, low enough that a runaway account cannot hang a request.
DEFAULT_MAX_ITEMS = 5000

# Wall-clock budget for one walk. Reaching it is disclosed, never swallowed.
DEFAULT_BUDGET_S = 25.0

PAGE_FAILED_MARKER = "AWS list call failed"


@dataclass(frozen=True)
class PageResult:
    """Items plus an honest account of whether they are all of them."""

    items: list
    # More items existed beyond the bound this walk applied.
    truncated: bool = False
    # The walk stopped on the wall-clock budget. Distinct from `truncated`: a timed-out
    # walk cannot even tell how much it missed.
    timed_out: bool = False
    # The call raised. An empty `items` here is an artifact of the failure, NOT a fact
    # about the account, and must never be cached or reported as a measured zero.
    failed: bool = False
    error: Optional[str] = None
    op: str = ""

    @property
    def complete(self) -> bool:
        """True when this is genuinely every item, so len(items) is an exact total."""
        return not (self.truncated or self.timed_out or self.failed)

    @property
    def note(self) -> Optional[str]:
        """Caveat to surface on the response, or None when the count is exact.

        None is load-bearing: it is the difference between "this is the total" and "this is
        a floor". Returning a caveat when the walk was complete would be its own small
        dishonesty, and an unfalsifiable one, since a reader cannot tell a reflexive
        caveat from a real one.
        """
        if self.failed:
            return f"{PAGE_FAILED_MARKER} ({self.op}): {self.error}"
        if self.timed_out:
            return (
                f"{self.op} paging stopped at its time budget after {len(self.items)} "
                "items; the count is a floor, not a total"
            )
        if self.truncated:
            return (
                f"{self.op} returned more than the {len(self.items)}-item bound applied "
                "here; the count is a floor, not a total"
            )
        return None


def paginate_bounded(
    client,
    op_name: str,
    result_key: str,
    *,
    max_items: int = DEFAULT_MAX_ITEMS,
    page_size: Optional[int] = None,
    budget_s: float = DEFAULT_BUDGET_S,
    **op_kwargs: Any,
) -> PageResult:
    """Page an AWS `list_*` operation to completion within a bound, and say if it truncated.

    Args:
        client: a boto3 client. Passed in rather than built here so the caller owns region
            selection: the wrong region does not raise, it returns another region's
            (usually empty) inventory.
        op_name: snake_case operation, e.g. "list_agents".
        result_key: the response field holding the items, e.g. "agentSummaries".
        max_items: bound on items collected. Exceeding it sets `truncated`.
        page_size: per-request page size. Omit to let the service choose; the paginator
            passes it through as the operation's own limit parameter.
        budget_s: wall-clock budget. Uses `time.monotonic`, not wall clock, so an NTP step
            cannot silently extend or expire the window.
        **op_kwargs: forwarded to the operation (e.g. gatewayIdentifier=...).

    Raises:
        ParamValidationError: propagated deliberately. It subclasses BotoCoreError, so a
            broad `except (ClientError, BotoCoreError)` would report a malformed request
            THIS code built as an AWS-side outage, and degrade honestly to a conclusion
            that is wrong for a reason nobody can see.
    """
    if not client.can_paginate(op_name):
        # Not a supported shape here. Better to say so than to silently read one page.
        raise ValueError(
            f"{op_name} is not paginable on this client; use the operation directly "
            "and disclose the bound yourself"
        )

    config: dict = {"MaxItems": max_items}
    if page_size is not None:
        config["PageSize"] = page_size

    deadline = time.monotonic() + budget_s
    items: list = []
    timed_out = False

    try:
        paginator = client.get_paginator(op_name)
        page_iterator = paginator.paginate(PaginationConfig=config, **op_kwargs)
        for page in page_iterator:
            items.extend(page.get(result_key, []))
            if time.monotonic() >= deadline:
                timed_out = True
                break
        # Only meaningful when the iterator stopped itself on MaxItems. After a manual
        # break it is None regardless of what remains, which is why `timed_out` is
        # tracked separately rather than inferred from this.
        truncated = bool(page_iterator.resume_token) and not timed_out
    except ParamValidationError:
        raise
    except (ClientError, BotoCoreError) as e:
        logger.warning("Paged %s failed after %d items: %s", op_name, len(items), e)
        return PageResult(
            items=items, failed=True, error=str(e), op=op_name
        )

    if timed_out:
        logger.warning(
            "Paged %s stopped at its %.0fs budget with %d items collected",
            op_name, budget_s, len(items),
        )
    elif truncated:
        logger.warning(
            "Paged %s hit its %d-item bound; more items exist", op_name, max_items
        )

    return PageResult(items=items, truncated=truncated, timed_out=timed_out, op=op_name)


def paginate_bounded_manual(
    client,
    op_name: str,
    result_key: str,
    *,
    token_param: str = "NextToken",
    token_field: str = "NextToken",
    max_items: int = DEFAULT_MAX_ITEMS,
    budget_s: float = DEFAULT_BUDGET_S,
    **op_kwargs: Any,
) -> PageResult:
    """Same contract as `paginate_bounded`, for operations botocore cannot paginate.

    A handful of AWS operations return a `NextToken` but have no entry in botocore's
    paginator model, so `can_paginate()` is False and `paginate_bounded` (correctly)
    refuses them. `glue:ListDataQualityRulesets` is one: verified on botocore 1.43.10,
    `can_paginate("list_data_quality_rulesets")` is False while the response shape carries
    `NextToken`. Reading its first page and counting it is the same defect as everywhere
    else, so it needs the same disclosure rather than an exemption.

    Prefer `paginate_bounded` whenever `client.can_paginate(op_name)` is True: the
    paginator knows each service's token field from the service model, and there is no
    threading to get wrong. This function exists only for the residue.

    Truncation detection here is actually MORE direct than in the paginator path. That
    path has to lean on `PageIterator.resume_token` because a manual `break` destroys the
    signal; here the token is in hand, so "more remains" is read straight off the
    response. The one subtlety preserved from `paginate_bounded`: reaching `max_items`
    only counts as truncation when items really remained beyond it, so a bound that lands
    exactly on the total emits no caveat.

    Do NOT pass the operation's own page-size parameter as `page_size`; put it in
    `op_kwargs` under its real name (`MaxResults=1000`), since without a paginator model
    there is nothing that knows what this operation calls it.

    Raises:
        ParamValidationError: propagated deliberately, for the reason given on
            `paginate_bounded` - a malformed request THIS code built must not be reported
            as an AWS-side outage.
    """
    # monotonic, not wall clock, so an NTP step cannot extend or expire the budget.
    deadline = time.monotonic() + budget_s
    items: list = []
    token: Optional[str] = None
    operation = getattr(client, op_name)

    try:
        while True:
            kwargs = dict(op_kwargs)
            if token:
                kwargs[token_param] = token
            response = operation(**kwargs)
            items.extend(response.get(result_key) or [])
            token = response.get(token_field) or None

            if len(items) >= max_items:
                # Landing ON the total is the trap: from inside the loop it looks the same
                # as truncation. The honest discriminator is that nothing remained.
                truncated = len(items) > max_items or token is not None
                del items[max_items:]
                if truncated:
                    logger.warning(
                        "Paged %s hit its %d-item bound; more items exist",
                        op_name, max_items,
                    )
                return PageResult(items=items, truncated=truncated, op=op_name)

            if not token:
                return PageResult(items=items, op=op_name)      # walked the whole list

            # Checked AFTER the completion test, so a walk that finishes exactly as the
            # budget expires is reported complete rather than acquiring a false caveat.
            if time.monotonic() >= deadline:
                logger.warning(
                    "Paged %s stopped at its %.0fs budget with %d items collected",
                    op_name, budget_s, len(items),
                )
                return PageResult(items=items, timed_out=True, op=op_name)
    except ParamValidationError:
        raise
    except (ClientError, BotoCoreError) as e:
        logger.warning("Paged %s failed after %d items: %s", op_name, len(items), e)
        return PageResult(items=items, failed=True, error=str(e), op=op_name)
