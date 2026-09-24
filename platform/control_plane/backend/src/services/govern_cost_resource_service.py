"""Govern Cost by Resource — real per-RESOURCE AI spend via Cost Explorer resource-level data.

Resource-level Cost Explorer (`ce:GetCostAndUsageWithResources`) attributes AWS AI
spend down to the individual RESOURCE_ID (a Bedrock inference profile, an AgentCore
runtime, etc.) — exactly what per-agent cost attribution needs. Bedrock is the
governed AI footprint here, so we filter SERVICE in {Amazon Bedrock, Amazon Bedrock
Service} and group by RESOURCE_ID over a trailing window of at most 14 days (the
resource-level API's maximum lookback).

Honesty + safety:
  - Resource-level granularity is an account opt-in (Billing preferences -> enable
    hourly and resource-level data). When it isn't enabled the API raises, and we
    honest-degrade to live=False with a clear note rather than fabricating spend.
  - Resource IDs come back as full ARNs; we NEVER return a raw ARN / account id —
    every identifier is passed through core.security_utils.mask_arn / mask_account_id.

Cost note: `GetCostAndUsageWithResources` bills ~0.01 USD per request, so results are
cached (get_or_load, 1h TTL) and only live responses are cached, so a transient
failure never poisons the cache nor re-bills on every page load.

Shape notes (verified live, boto3 `ce.get_cost_and_usage_with_resources`):
  - ResultsByTime[]{ TimePeriod{Start,End}, Total{} (empty when grouped), Groups[] }
  - Groups[]{ Keys: [<resource ARN or id>], Metrics{ UnblendedCost{Amount,Unit} } }
  - GroupDefinitions: [{Type: DIMENSION, Key: RESOURCE_ID}]; paginated via NextPageToken.
"""

from __future__ import annotations

import logging
import time
from datetime import date, timedelta
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.config import settings
from core.security_utils import mask_account_id, mask_arn
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# GetCostAndUsageWithResources bills ~0.01 USD/request and per-resource spend barely
# moves intraday, so cache for 1h (>= the mandated 3600s) and cache only live results.
_RESOURCE_COST_TTL = 3600

# The resource-level Cost Explorer API only supports a trailing window of 14 days.
_MAX_WINDOW_DAYS = 14

# Governed AI footprint (Cost Explorer SERVICE dimension values).
_BEDROCK_SERVICE_NAMES = ["Amazon Bedrock", "Amazon Bedrock Service"]

# Safety cap on NextPageToken pagination — each page is a billable request.
_MAX_PAGES = 10

# Substrings that signal resource-level data is simply not enabled for the account
# (vs. a permissions / other failure) — drives the specific honest-degrade note.
_NOT_ENABLED_HINTS = (
    "not enabled",
    "not available",
    "enable resource",
    "resource-level",
    "resource level",
    "hourly",
    "dataunavailable",
)


class ResourceCost(BaseModel):
    """Total AI spend attributed to one AWS resource over the window."""

    resource_id: str = Field(..., description="Masked short resource identifier (ARN tail) for per-agent attribution")
    resource_arn: Optional[str] = Field(default=None, description="Full resource ARN with the account id masked (for correlation)")
    service: Optional[str] = Field(default=None, description="AWS service parsed from the ARN, e.g. 'bedrock'")
    amount: float = Field(..., description="Total UnblendedCost in USD over the window")


class ResourceCostResponse(BaseModel):
    """Per-RESOURCE Bedrock spend for the FinOps per-agent attribution surface."""

    by_resource: List[ResourceCost] = Field(default_factory=list)
    total: float = 0.0
    resource_count: int = 0
    period_start: str
    period_end: str
    window_days: int = 14
    # Honesty flags so the UI can badge the source, matching the OSS live-vs-mock convention.
    live: bool = Field(..., description="True when sourced from Cost Explorer resource-level data; False on honest-degrade")
    source: str = Field(..., description="'cost-explorer-resources' | 'resource-level-not-enabled' | 'unavailable-fallback'")
    note: Optional[str] = Field(default=None, description="Why the fallback was used, when live is False")


def _service_from_arn(raw: str) -> Optional[str]:
    """Parse the AWS service segment from an ARN (arn:partition:service:...)."""
    if raw and raw.startswith("arn:"):
        parts = raw.split(":")
        if len(parts) > 2 and parts[2]:
            return parts[2]
    return None


def _cache_note(result: ResourceCostResponse, cached_at: float) -> ResourceCostResponse:
    """Stamp an honest 'cached as of' age onto a live response."""
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    # ttl_cache hands back the object it still holds, so mutating result.note
    # would append a stamp per hit and grow the cached note without bound.
    # model_copy swaps only this top-level scalar, leaving the cache entry intact.
    note = f"{result.note} · {stamp}" if result.note else stamp
    return result.model_copy(update={"note": note})


class GovernCostResourceService:
    """Reads real per-resource AI spend from Cost Explorer resource-level data."""

    def __init__(self, region: str = settings.GOVERN_AWS_REGION):
        self.region = region
        self._client = None  # lazy — don't touch AWS until first query

    def _ce(self):
        if self._client is None:
            self._client = boto3.client("ce", region_name=self.region)
        return self._client

    def get_by_resource(self, days: int = 14) -> ResourceCostResponse:
        """Cached wrapper around the live resource-level CE fetch (1h TTL).

        `days` is clamped to the resource-level API maximum of 14. Only live
        results are cached, so the surface flips to live the moment resource-level
        granularity is enabled — without re-billing on every page load.
        """
        days = max(1, min(days, _MAX_WINDOW_DAYS))
        key = f"cost:by-resource:{self.region}:{days}"
        result, cached_at = get_or_load(
            key, _RESOURCE_COST_TTL, lambda: self._fetch_by_resource(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_by_resource(self, days: int) -> ResourceCostResponse:
        """Per-RESOURCE Bedrock spend — CE resource-level query grouped by RESOURCE_ID.

        Sums each resource's daily UnblendedCost across the window. Honest-degrades
        to live=False when resource-level granularity isn't enabled, when access is
        denied, or when there is simply no Bedrock spend in the window.
        """
        end = date.today()
        start = end - timedelta(days=days)
        start_s, end_s = start.isoformat(), end.isoformat()
        try:
            totals: dict[str, float] = {}
            next_token: Optional[str] = None
            pages = 0
            while True:
                kwargs = dict(
                    TimePeriod={"Start": start_s, "End": end_s},
                    Granularity="DAILY",
                    Metrics=["UnblendedCost"],
                    Filter={"Dimensions": {"Key": "SERVICE", "Values": _BEDROCK_SERVICE_NAMES}},
                    GroupBy=[{"Type": "DIMENSION", "Key": "RESOURCE_ID"}],
                )
                if next_token:
                    kwargs["NextPageToken"] = next_token
                resp = self._ce().get_cost_and_usage_with_resources(**kwargs)
                for period in resp.get("ResultsByTime", []):
                    # Total is empty on grouped queries — sum from the per-resource Groups.
                    for grp in period.get("Groups", []):
                        keys = grp.get("Keys") or []
                        raw = keys[0] if keys else ""
                        amt = float(grp.get("Metrics", {}).get("UnblendedCost", {}).get("Amount", 0) or 0)
                        totals[raw] = totals.get(raw, 0.0) + amt
                next_token = resp.get("NextPageToken")
                pages += 1
                if not next_token or pages >= _MAX_PAGES:
                    break

            by_resource: List[ResourceCost] = []
            for raw, amt in sorted(totals.items(), key=lambda kv: kv[1], reverse=True):
                if round(amt, 2) <= 0:
                    continue
                # Never expose a raw ARN / account id: mask_arn -> resource tail,
                # mask_account_id -> full ARN with the 12-digit account redacted.
                resource_id = (mask_arn(raw) or raw) if raw else "unattributed"
                by_resource.append(ResourceCost(
                    resource_id=resource_id,
                    resource_arn=mask_account_id(raw) if raw else None,
                    service=_service_from_arn(raw),
                    amount=round(amt, 2),
                ))

            total = round(sum(r.amount for r in by_resource), 2)
            live = len(by_resource) > 0
            return ResourceCostResponse(
                by_resource=by_resource,
                total=total,
                resource_count=len(by_resource),
                period_start=start_s,
                period_end=end_s,
                window_days=days,
                live=live,
                source="cost-explorer-resources",
                note=None if live else "No per-resource Bedrock spend recorded in the window.",
            )
        except ClientError as e:
            err = getattr(e, "response", {}).get("Error", {}) or {}
            code = err.get("Code", "")
            blob = f"{code} {err.get('Message', '')}".lower()
            if any(hint in blob for hint in _NOT_ENABLED_HINTS):
                logger.info("Resource-level cost data not enabled in Cost Explorer: %s", code)
                return ResourceCostResponse(
                    by_resource=[], period_start=start_s, period_end=end_s, window_days=days,
                    live=False, source="resource-level-not-enabled",
                    note="Resource-level cost data not enabled in Cost Explorer.",
                )
            logger.warning("Cost Explorer resource-level query unavailable: %s", code)
            return ResourceCostResponse(
                by_resource=[], period_start=start_s, period_end=end_s, window_days=days,
                live=False, source="unavailable-fallback",
                note="Cost Explorer resource-level query unavailable or ce:GetCostAndUsageWithResources not granted.",
            )
        except (BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer resource-level query failed: %s", e)
            return ResourceCostResponse(
                by_resource=[], period_start=start_s, period_end=end_s, window_days=days,
                live=False, source="unavailable-fallback",
                note="Cost Explorer resource-level query unavailable or ce:GetCostAndUsageWithResources not granted.",
            )
