"""Govern AWS Health service — real service/account health events for Operations.

Source of truth: the AWS Health API (`health:DescribeEvents` +
`health:DescribeEventAggregates`). This is the personalized health feed for the
account — the same events AWS surfaces on the Personal Health Dashboard: open
operational *issues*, *accountNotification* messages, and upcoming
*scheduledChange* (retirements, planned lifecycle events). It feeds the Operations
surface's availability / incident-correlation view: when an agent's availability
dips, an open AWS Health `issue` in the same service/region is the likely cause.

Design (verified live against the real account, boto3 `health`):
  - DescribeEventAggregates(aggregateField='eventTypeCategory') over a trailing
    window gives the AUTHORITATIVE counts by category (issue / accountNotification
    / scheduledChange) — one call, server-side aggregation.
  - DescribeEvents over the same window + category filter returns the individual
    events; we sort by lastUpdatedTime and surface only a handful of recent ones
    (service, region, statusCode, startTime, generic event-type code/category).

REGION (load-bearing): the AWS Health API is a GLOBAL service reachable only via
the us-east-1 endpoint (health.us-east-1.amazonaws.com), so the client is ALWAYS
built with region_name='us-east-1' regardless of the governed-resource region.
Individual events still carry their own `region` field (e.g. an event in us-east-2).

ENTITLEMENT: the Health API requires a Business or Enterprise Support plan. Without
one every call raises SubscriptionRequiredException; we honest-degrade to live=False
with a clear note rather than fabricating events.

PRIVACY: event ARNs embed the real 12-digit account id in their id tail
(…-<account>-MANAGED). We never return the ARN, and every surfaced string field is
passed through core.security_utils.mask_account_id (defense in depth) so no raw
account id can leak. No PII (no descriptions, no affected-entity identifiers).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# The AWS Health API is a global service reached only through us-east-1.
_HEALTH_REGION = "us-east-1"

# Health events barely move minute-to-minute and the API is not billed per query,
# so a short TTL collapses repeat Operations page loads without staleness. Only
# live results are cached, so a transient failure never poisons the cache.
_TTL = 300  # 5 min

# Trailing window is clamped so a huge `days` can't scan an unbounded history.
_MAX_WINDOW_DAYS = 90

# The three event-type categories the Operations view cares about.
_CATEGORIES = ["issue", "accountNotification", "scheduledChange"]

# maxResults minimum is 10 on these Health APIs; fetch a pool then cap the output.
_AGG_MAX_RESULTS = 100      # categories are few, but page defensively
_EVENTS_MAX_RESULTS = 50    # pool of recent events to sort/trim from (>= min of 10)
_MAX_EVENTS = 15            # how many recent events we actually surface

# ClientError codes that mean "the Health API isn't entitled for this account"
# (no Business/Enterprise Support) rather than a transient / permissions failure.
_SUBSCRIPTION_CODES = ("SubscriptionRequiredException",)


# ── Response models (kept in-module: this slice ships as two files only) ────────
class HealthCategoryCount(BaseModel):
    """count(*) of events for one event-type category over the window."""

    category: str = Field(..., description="issue | accountNotification | scheduledChange")
    count: int = 0


class HealthEvent(BaseModel):
    """One AWS Health event, reduced to non-PII correlation fields (no ARN, no account id)."""

    service: Optional[str] = Field(None, description="AWS service the event is about, e.g. 'ECS', 'BEDROCK'")
    region: Optional[str] = Field(None, description="Region the event applies to (may differ from the API endpoint region)")
    event_type_category: Optional[str] = Field(None, description="issue | accountNotification | scheduledChange")
    event_type_code: Optional[str] = Field(None, description="Generic AWS event-type code, e.g. 'AWS_ECS_TASK_PATCHING_RETIREMENT'")
    status_code: Optional[str] = Field(None, description="open | closed | upcoming")
    start_time: Optional[str] = Field(None, description="Event start (ISO 8601, UTC)")
    last_updated_time: Optional[str] = Field(None, description="Last update (ISO 8601, UTC)")


class HealthEventsResponse(BaseModel):
    """AWS Health service/account events for the Operations availability + incident view.

    `live` is True only when the Health API answered (entitled + reachable). Counts
    by category are authoritative (server-side aggregation); `recent_events` is a
    capped, most-recently-updated sample. Honest live=False fallback that never raises.
    """

    window_days: int
    total_events: int = Field(0, description="Total events in the window (sum of by_category counts)")
    open_issue_count: int = Field(0, description="Open events in the 'issue' category among the recent sample (incident signal)")
    by_category: List[HealthCategoryCount] = Field(default_factory=list)
    recent_events: List[HealthEvent] = Field(default_factory=list)
    live: bool = False
    source: str = Field("", description="'aws-health' | 'subscription-required' | 'unavailable-fallback'")
    note: Optional[str] = Field(None, description="Why the fallback was used, when live is False (or cache age when live)")


def _iso(v) -> Optional[str]:
    """Serialize a boto3 datetime (or leave a string as-is) to an ISO 8601 string."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def _clean(v: Optional[str]) -> Optional[str]:
    """Defense-in-depth: strip any embedded 12-digit account id from a surfaced string."""
    return mask_account_id(v) if v else v


class GovernHealthService:
    """Reads real AWS Health service/account events (global API, us-east-1 endpoint)."""

    def __init__(self, region: str = _HEALTH_REGION):
        # Health is a global service; the endpoint is always us-east-1 regardless of
        # what the caller passes. We keep the arg for interface symmetry with peers.
        self.region = _HEALTH_REGION
        self._client = None  # lazy — don't touch AWS until first query

    def _health(self):
        if self._client is None:
            self._client = boto3.client("health", region_name=self.region)
        return self._client

    # ── Public (cached) entrypoint ──────────────────────────────────────────────
    def get_events(self, days: int = 30) -> HealthEventsResponse:
        """Cached wrapper (short TTL). Clamps `days`; caches only live results so a
        transient failure or a not-entitled account never poisons the cache."""
        window = max(1, min(int(days), _MAX_WINDOW_DAYS))
        result, cached_at = get_or_load(
            f"health:events:{window}",
            _TTL,
            lambda: self._fetch_events(window),
            should_cache=lambda r: r.live,
        )
        age = time.time() - cached_at
        if getattr(result, "live", False) and age >= 2:
            stamp = f"Cached {int(age)}s ago"
            # ttl_cache hands back the object it still holds, so mutating
            # result.note would append a stamp per hit and grow the cached note
            # without bound. model_copy swaps only this top-level scalar,
            # leaving the cache entry intact.
            note = f"{result.note} · {stamp}" if result.note else stamp
            return result.model_copy(update={"note": note})
        return result

    # ── Fetch (uncached inner) ──────────────────────────────────────────────────
    def _fetch_events(self, days: int) -> HealthEventsResponse:
        frm = datetime.now(timezone.utc) - timedelta(days=days)
        health = self._health()
        try:
            # 1) Authoritative counts by category (server-side aggregation).
            by_category: List[HealthCategoryCount] = []
            next_token: Optional[str] = None
            while True:
                kwargs = dict(
                    aggregateField="eventTypeCategory",
                    filter={"startTimes": [{"from": frm}]},
                    maxResults=_AGG_MAX_RESULTS,
                )
                if next_token:
                    kwargs["nextToken"] = next_token
                agg = health.describe_event_aggregates(**kwargs)
                for a in agg.get("eventAggregates", []):
                    cat = (a.get("aggregateValue") or "").strip()
                    if cat:
                        by_category.append(HealthCategoryCount(category=cat, count=int(a.get("count", 0) or 0)))
                next_token = agg.get("nextToken")
                if not next_token:
                    break

            # 2) Recent individual events (single page pool; sort + cap output).
            ev = health.describe_events(
                filter={
                    "eventTypeCategories": _CATEGORIES,
                    "startTimes": [{"from": frm}],
                },
                maxResults=_EVENTS_MAX_RESULTS,
            )
            raw_events = ev.get("events", [])

            # Sort newest-updated first, then trim to a handful.
            raw_events.sort(key=lambda e: e.get("lastUpdatedTime") or e.get("startTime") or frm, reverse=True)
            recent_events: List[HealthEvent] = []
            open_issue_count = 0
            for e in raw_events[:_MAX_EVENTS]:
                status = (e.get("statusCode") or "").strip() or None
                category = (e.get("eventTypeCategory") or "").strip() or None
                if category == "issue" and status == "open":
                    open_issue_count += 1
                recent_events.append(HealthEvent(
                    # No ARN is surfaced; each field is still account-id-masked (defense in depth).
                    service=_clean((e.get("service") or "").strip() or None),
                    region=_clean((e.get("region") or "").strip() or None),
                    event_type_category=category,
                    event_type_code=_clean((e.get("eventTypeCode") or "").strip() or None),
                    status_code=status,
                    start_time=_iso(e.get("startTime")),
                    last_updated_time=_iso(e.get("lastUpdatedTime")),
                ))

            total_events = sum(c.count for c in by_category)
            by_category.sort(key=lambda c: c.count, reverse=True)
            note = None if total_events > 0 else (
                f"AWS Health reported no issue/accountNotification/scheduledChange events in the "
                f"last {days}d for this account. The API answered (Business/Enterprise Support is "
                "active) — there simply were no matching events in the window."
            )
            return HealthEventsResponse(
                window_days=days,
                total_events=total_events,
                open_issue_count=open_issue_count,
                by_category=by_category,
                recent_events=recent_events,
                live=True,  # the API answered; an empty-but-answered account is still live data
                source="aws-health",
                note=note,
            )
        except ClientError as e:
            err = getattr(e, "response", {}).get("Error", {}) or {}
            code = err.get("Code", "")
            if code in _SUBSCRIPTION_CODES:
                logger.info("AWS Health API requires Business/Enterprise Support: %s", code)
                return HealthEventsResponse(
                    window_days=days, live=False, source="subscription-required",
                    note=(
                        "AWS Health event data requires a Business or Enterprise Support plan "
                        "(health:DescribeEvents returned SubscriptionRequiredException). Upgrade the "
                        "support plan to surface service/account health events here."
                    ),
                )
            logger.warning("AWS Health API unavailable: %s", code)
            return HealthEventsResponse(
                window_days=days, live=False, source="unavailable-fallback",
                note="AWS Health API unavailable or health:DescribeEvents/DescribeEventAggregates not permitted.",
            )
        except (BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AWS Health API query failed: %s", e)
            return HealthEventsResponse(
                window_days=days, live=False, source="unavailable-fallback",
                note="AWS Health API unavailable or health:DescribeEvents/DescribeEventAggregates not permitted.",
            )
