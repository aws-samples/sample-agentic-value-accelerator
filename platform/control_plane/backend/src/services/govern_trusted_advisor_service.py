"""Govern Trusted Advisor service — AWS Trusted Advisor checks, read-through + cached.

Surfaces the account's real cost / security / fault-tolerance / performance /
service-limit posture straight from AWS Trusted Advisor so the Govern Risk /
FinOps / Operations views can run on live data instead of mock:

  1. DescribeTrustedAdvisorChecks(language='en') — the full check catalog
     (id, name, category, description). This is the set of checks the account's
     support plan exposes (Business/Enterprise expose the full ~600+ set).
  2. DescribeTrustedAdvisorCheckSummaries(checkIds=[...]) — the current result of
     every check: status (ok | warning | error | not_available), whether it has
     flagged resources, a resourcesSummary count, and (for cost checks) an
     estimatedMonthlySavings.

We aggregate those into two rollups the UI wants: by CATEGORY (cost_optimizing,
security, fault_tolerance, performance, service_limits, operational_excellence)
and by STATUS (ok / warning / error / not_available), plus a small list of the
top flagged checks (check names + category/status/flagged-resource count only —
never the flagged resource identifiers themselves).

IMPORTANT — region: the AWS Support API is a global service reachable ONLY through
the us-east-1 endpoint. We therefore ALWAYS build the client with
region_name='us-east-1', regardless of settings.GOVERN_AWS_REGION.

Everything is honest: `live` is only True when the Support API answers and the
read succeeds. On a Basic support plan the API raises SubscriptionRequiredException
(Trusted Advisor's full check set / programmatic access needs Business or
Enterprise Support) — we honest-degrade to live=False with a clear note and
setup guidance, and never fabricate.

Verified shape (boto3 support, us-east-1 live — 639 checks on this account):
  - describe_trusted_advisor_checks(language='en') → {'checks': [{
        id, name, description, category, metadata:[...]}]}
      category ∈ {cost_optimizing, security, fault_tolerance, performance,
                  service_limits, operational_excellence}
  - describe_trusted_advisor_check_summaries(checkIds=[...]) → {'summaries': [{
        checkId, status ('ok'|'warning'|'error'|'not_available'),
        hasFlaggedResources, timestamp,
        resourcesSummary:{resourcesProcessed, resourcesFlagged,
                          resourcesIgnored, resourcesSuppressed},
        categorySpecificSummary:{costOptimizing:{estimatedMonthlySavings,
                          estimatedPercentMonthlySavings}}}]}

MANDATORY masking (core.security_utils): check catalog names/descriptions are
static AWS content, but we defensively run any surfaced string through
mask_account_id so an account id can never leak, and we deliberately never surface
the flagged resource identifiers, the account id, or raw ARNs.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# The AWS Support API is global but only reachable via the us-east-1 endpoint.
_SUPPORT_REGION = "us-east-1"
_TTL = 600  # 10 min — Trusted Advisor refreshes checks slowly (hours); short TTL collapses page loads.
_TOP_FLAGGED = 8  # how many top flagged checks (by resources flagged) to surface

# Canonical Trusted Advisor categories → human labels. We always emit all six so
# the UI has a stable set of pillars even when a category has zero checks; any
# unexpected category returned by AWS is still included dynamically.
_CATEGORY_LABELS = {
    "cost_optimizing": "Cost Optimizing",
    "security": "Security",
    "fault_tolerance": "Fault Tolerance",
    "performance": "Performance",
    "service_limits": "Service Limits",
    "operational_excellence": "Operational Excellence",
}
_STATUSES = ("ok", "warning", "error", "not_available")


# ─────────────────── Response models ───────────────────


class CategoryRollup(BaseModel):
    """Per-category rollup of check statuses + flagged resources."""

    category: str = Field(..., description="cost_optimizing | security | fault_tolerance | performance | service_limits | operational_excellence")
    label: str = Field(..., description="Human-readable category label")
    total_checks: int = 0
    ok: int = 0
    warning: int = 0
    error: int = 0
    not_available: int = Field(0, description="Checks with no current result (need a resource or a refresh)")
    flagged_resources: int = Field(0, description="Sum of resourcesFlagged across this category's checks")


class StatusRollup(BaseModel):
    """Count of checks in one status band."""

    status: str = Field(..., description="ok | warning | error | not_available")
    count: int = 0


class TopFlaggedCheck(BaseModel):
    """A single flagged check — name + light context only, never resource ids."""

    name: str
    category: str
    status: str = Field(..., description="warning | error")
    resources_flagged: int = 0


class TrustedAdvisorSummaryResponse(BaseModel):
    """Live AWS Trusted Advisor posture for Govern Risk / FinOps / Operations."""

    live: bool
    source: str
    note: Optional[str] = None
    total_checks: int = Field(0, description="Checks exposed by the account's support plan")
    checks_evaluated: int = Field(0, description="Checks with a returned summary")
    ok: int = 0
    warning: int = 0
    error: int = 0
    not_available: int = 0
    flagged_checks: int = Field(0, description="Checks currently flagging one or more resources")
    total_flagged_resources: int = Field(0, description="Sum of resourcesFlagged across all checks")
    estimated_monthly_savings: float = Field(0.0, description="Sum of cost-optimizing estimatedMonthlySavings (USD)")
    by_category: List[CategoryRollup] = Field(default_factory=list)
    by_status: List[StatusRollup] = Field(default_factory=list)
    top_flagged_checks: List[TopFlaggedCheck] = Field(default_factory=list)
    setup_guidance: Optional[dict] = None


# ─────────────────── Service ───────────────────


class GovernTrustedAdvisorService:
    """AWS Trusted Advisor checks — read-through, cached, honest-degrading."""

    def __init__(self, region: Optional[str] = None):
        # Support API is only reachable via us-east-1; ignore any passed region.
        self.region = _SUPPORT_REGION

    def _client(self):
        return boto3.client("support", region_name=self.region)

    def get_summary(self) -> TrustedAdvisorSummaryResponse:
        result, cached_at = get_or_load(
            "trusted-advisor:summary", _TTL,
            self._fetch_summary, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    # ─────────────────── Fetch ───────────────────

    def _fetch_summary(self) -> TrustedAdvisorSummaryResponse:
        try:
            support = self._client()

            # 1) Full check catalog (id → name/category).
            checks_resp = support.describe_trusted_advisor_checks(language="en")
            checks = checks_resp.get("checks", []) or []
            if not checks:
                return self._degrade(
                    "no_checks",
                    "Trusted Advisor returned no checks for this account.",
                )

            check_name: dict[str, str] = {}
            check_category: dict[str, str] = {}
            for c in checks:
                cid = c.get("id")
                if not cid:
                    continue
                check_name[cid] = mask_account_id(c.get("name")) or c.get("name", "")
                check_category[cid] = c.get("category", "unknown")

            # 2) Current result of every check. The API accepts the full id list
            #    in one call (verified with 639 ids); chunk defensively anyway.
            all_ids = list(check_name.keys())
            summaries = self._summaries(support, all_ids)

            # 3) Aggregate.
            cat_rollup: dict[str, dict] = defaultdict(
                lambda: {"total": 0, "ok": 0, "warning": 0, "error": 0,
                         "not_available": 0, "flagged": 0}
            )
            status_counts = {s: 0 for s in _STATUSES}
            flagged_checks = 0
            total_flagged_resources = 0
            estimated_savings = 0.0
            flagged: list[TopFlaggedCheck] = []

            for s in summaries:
                cid = s.get("checkId")
                status = s.get("status", "not_available")
                if status not in status_counts:
                    status_counts[status] = 0
                status_counts[status] += 1

                category = check_category.get(cid, "unknown")
                cr = cat_rollup[category]
                cr["total"] += 1
                cr[status] = cr.get(status, 0) + 1

                res_summary = s.get("resourcesSummary", {}) or {}
                res_flagged = int(res_summary.get("resourcesFlagged", 0) or 0)
                cr["flagged"] += res_flagged
                total_flagged_resources += res_flagged

                cost = (s.get("categorySpecificSummary", {}) or {}).get("costOptimizing", {}) or {}
                estimated_savings += float(cost.get("estimatedMonthlySavings", 0) or 0)

                if s.get("hasFlaggedResources"):
                    flagged_checks += 1
                    flagged.append(TopFlaggedCheck(
                        name=check_name.get(cid, cid or "unknown"),
                        category=category,
                        status=status,
                        resources_flagged=res_flagged,
                    ))

            # by_category — canonical categories first, then any extras, all included.
            ordered_cats = list(_CATEGORY_LABELS.keys())
            for extra in cat_rollup:
                if extra not in ordered_cats:
                    ordered_cats.append(extra)
            by_category = [
                CategoryRollup(
                    category=cat,
                    label=_CATEGORY_LABELS.get(cat, cat.replace("_", " ").title()),
                    total_checks=cat_rollup[cat]["total"],
                    ok=cat_rollup[cat]["ok"],
                    warning=cat_rollup[cat]["warning"],
                    error=cat_rollup[cat]["error"],
                    not_available=cat_rollup[cat]["not_available"],
                    flagged_resources=cat_rollup[cat]["flagged"],
                )
                for cat in ordered_cats
                if cat in cat_rollup or cat in _CATEGORY_LABELS
            ]

            by_status = [
                StatusRollup(status=st, count=status_counts.get(st, 0))
                for st in _STATUSES
            ]

            flagged.sort(key=lambda f: f.resources_flagged, reverse=True)
            top_flagged = flagged[:_TOP_FLAGGED]

            ok = status_counts.get("ok", 0)
            warning = status_counts.get("warning", 0)
            error = status_counts.get("error", 0)
            not_available = status_counts.get("not_available", 0)

            note = (
                f"{len(checks)} Trusted Advisor checks: {ok} ok, {warning} warning, "
                f"{error} error, {not_available} not-available; {flagged_checks} check(s) "
                f"flagging {total_flagged_resources} resource(s)"
            )
            if estimated_savings > 0:
                note += f"; ${estimated_savings:,.0f}/mo potential savings"
            note += "."

            return TrustedAdvisorSummaryResponse(
                live=True,
                source="support:trusted-advisor",
                note=note,
                total_checks=len(checks),
                checks_evaluated=len(summaries),
                ok=ok,
                warning=warning,
                error=error,
                not_available=not_available,
                flagged_checks=flagged_checks,
                total_flagged_resources=total_flagged_resources,
                estimated_monthly_savings=round(estimated_savings, 2),
                by_category=by_category,
                by_status=by_status,
                top_flagged_checks=top_flagged,
            )

        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "SubscriptionRequiredException":
                return self._degrade(
                    "subscription_required",
                    "AWS Trusted Advisor programmatic access requires a Business or "
                    "Enterprise Support plan. This account is on Basic/Developer Support.",
                )
            if code in ("AccessDeniedException", "AccessDenied", "UnauthorizedAccess"):
                return self._degrade("access_denied", "Access denied to the AWS Support (Trusted Advisor) API.")
            logger.warning("Trusted Advisor error: %s", code)
            return self._degrade("error", f"Trusted Advisor error: {code or 'unknown'}")
        except BotoCoreError as e:
            logger.warning("Trusted Advisor unavailable: %s", type(e))
            return self._degrade("unavailable", "AWS Support (Trusted Advisor) unavailable (network/region).")

    # ─────────────────── Per-call helpers (never raise) ───────────────────

    def _summaries(self, support, check_ids: list[str]) -> list[dict]:
        """DescribeTrustedAdvisorCheckSummaries for all ids (chunked defensively)."""
        out: list[dict] = []
        chunk = 100
        for i in range(0, len(check_ids), chunk):
            batch = check_ids[i:i + chunk]
            resp = support.describe_trusted_advisor_check_summaries(checkIds=batch)
            out.extend(resp.get("summaries", []) or [])
        return out

    # ─────────────────── Honest-degrade ───────────────────

    def _degrade(self, reason: str, note: str) -> TrustedAdvisorSummaryResponse:
        return TrustedAdvisorSummaryResponse(
            live=False,
            source="support:trusted-advisor",
            note=note,
            setup_guidance=self._setup_guidance(reason),
        )

    def _setup_guidance(self, reason: str) -> dict:
        base = {
            "service": "AWS Trusted Advisor",
            "docs_url": "https://docs.aws.amazon.com/awssupport/latest/user/trusted-advisor.html",
        }
        if reason == "subscription_required":
            return {
                **base,
                "title": "Business or Enterprise Support required for Trusted Advisor API",
                "description": "Programmatic access to the full Trusted Advisor check set (cost, "
                               "security, fault tolerance, performance, service limits) requires a "
                               "Business or Enterprise Support plan.",
                "steps": [
                    "Open the AWS Support Center and change the account's support plan",
                    "Select Business or Enterprise Support",
                    "Re-run this view once the plan is active (checks refresh within minutes)",
                ],
                "console_url": "https://console.aws.amazon.com/support/plans/home",
                "benefits": [
                    "Full ~600+ Trusted Advisor check set",
                    "Cost-optimization savings estimates",
                    "Programmatic (API) access for governance dashboards",
                ],
            }
        if reason == "access_denied":
            return {
                **base,
                "title": "IAM permissions required for Trusted Advisor",
                "steps": [
                    "Add support:DescribeTrustedAdvisorChecks",
                    "Add support:DescribeTrustedAdvisorCheckSummaries",
                ],
                "iam_policy": {
                    "Effect": "Allow",
                    "Action": [
                        "support:DescribeTrustedAdvisorChecks",
                        "support:DescribeTrustedAdvisorCheckSummaries",
                    ],
                    "Resource": "*",
                },
            }
        return {
            **base,
            "title": "Check AWS Trusted Advisor availability",
            "steps": [
                "Verify the account has Business or Enterprise Support",
                "Verify IAM permissions for the support: Trusted Advisor actions",
                "The Support API is only reachable via the us-east-1 endpoint",
            ],
        }
