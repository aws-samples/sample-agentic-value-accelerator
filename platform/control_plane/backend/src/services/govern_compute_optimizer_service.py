"""Govern Compute Optimizer service — AWS Compute Optimizer right-sizing, read-through + cached.

Surfaces the account's real right-sizing posture straight from AWS Compute Optimizer so
the FinOps optimization view can run on live data instead of mock:

  1. GetEnrollmentStatus       — confirm Compute Optimizer is ENROLLED (status == 'Active')
                                 before trusting anything else. If not Active, honest-degrade
                                 to live=false with enrollment guidance (never fabricate).
  2. GetRecommendationSummaries — account-wide, per-resource-type aggregate: counts of
                                 Optimized / Overprovisioned / Underprovisioned / NotOptimized /
                                 Idle findings, plus the estimated monthly savings opportunity
                                 (rightsizing + idle) per resource type.

From the per-type summaries we derive top-level right-sizing counts (over/under-provisioned,
idle) and roll up the estimated monthly / annual savings opportunity. Everything is honest:
`live` is only True when Compute Optimizer enrollment status is 'Active' and the read
succeeds; otherwise we degrade to live=false with a clear note (and setup guidance).

Verified shape (boto3 compute-optimizer, live account):
  - get_enrollment_status() → {status: 'Active'|'Inactive'|'Pending'|'Failed',
        memberAccountsEnrolled, lastUpdatedTimestamp, numberOfMemberAccountsOptedIn}
  - get_recommendation_summaries() → {recommendationSummaries: [{
        recommendationResourceType: 'Ec2Instance'|'AutoScalingGroup'|'EbsVolume'|
            'LambdaFunction'|'EcsService'|'RdsDBInstance'|'RdsDBInstanceStorage'|...,
        accountId (12-digit — NEVER surfaced),
        summaries: [{name: 'Optimized'|'Overprovisioned'|'Underprovisioned'|'NotOptimized',
            value, reasonCodeSummaries?: [{name: 'MemoryOverprovisioned'|..., value}]}],
        idleSummaries?: [{name: 'Idle'|'Unattached'|'Unused', value}],
        savingsOpportunity?: {savingsOpportunityPercentage,
            estimatedMonthlySavings: {currency, value}},
        idleSavingsOpportunity?: {...}, aggregatedSavingsOpportunity?: {...},
        currentPerformanceRiskRatings?: {high, medium, low, veryLow}}]}

MANDATORY masking (core.security_utils): the summary payload carries the account's real
12-digit accountId. We never surface it — only aggregate counts and dollar figures leave
this service. `note` is masked defensively with mask_account_id as belt-and-suspenders.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.config import settings
from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_TTL = 600  # 10 min — Compute Optimizer refreshes recommendations slowly (hours/day).

# Summary-name → bucket. Compute Optimizer reports per-type states under `summaries[].name`.
# Lambda / EBS use the coarse 'NotOptimized'; compute/RDS use Over/Underprovisioned.
_OVER = "Overprovisioned"
_UNDER = "Underprovisioned"
_OPT = "Optimized"
_NOT_OPT = "NotOptimized"


# ─────────────────── Response models ───────────────────


class ResourceTypeSummary(BaseModel):
    """Per-resource-type right-sizing summary from Compute Optimizer."""

    resource_type: str = Field(..., description="e.g. Ec2Instance, LambdaFunction, EcsService, EbsVolume")
    total_analyzed: int = Field(0, description="Resources of this type Compute Optimizer analyzed")
    optimized: int = 0
    over_provisioned: int = Field(0, description="Includes Lambda MemoryOverprovisioned")
    under_provisioned: int = Field(0, description="Includes Lambda MemoryUnderprovisioned")
    not_optimized: int = Field(0, description="Coarse NotOptimized (types without over/under split, e.g. EBS)")
    idle: int = Field(0, description="Idle resources (idleSummaries)")
    estimated_monthly_savings: float = Field(0.0, description="Aggregated (rightsizing + idle) monthly savings opportunity")
    savings_percentage: float = Field(0.0, description="Savings opportunity as a % of current spend for this type")
    savings_currency: str = "USD"


class ComputeOptimizerSummaryResponse(BaseModel):
    """Live Compute Optimizer right-sizing posture for FinOps optimization."""

    live: bool
    source: str
    note: Optional[str] = None
    enrollment_status: Optional[str] = Field(None, description="Compute Optimizer enrollment status, e.g. Active")
    last_updated: Optional[str] = Field(None, description="Enrollment status last-updated timestamp (ISO)")
    total_resources_analyzed: int = Field(0, description="All resources Compute Optimizer analyzed across types")
    rightsizing_opportunities: int = Field(0, description="Actionable findings: over + under + not_optimized + idle")
    over_provisioned: int = 0
    under_provisioned: int = 0
    optimized: int = 0
    not_optimized: int = 0
    idle: int = 0
    estimated_monthly_savings: float = Field(0.0, description="Total aggregated monthly savings opportunity")
    estimated_annual_savings: float = Field(0.0, description="estimated_monthly_savings x 12")
    savings_currency: str = "USD"
    by_resource_type: List[ResourceTypeSummary] = Field(default_factory=list)
    setup_guidance: Optional[dict] = None


# ─────────────────── Helpers ───────────────────


def _iso(v) -> Optional[str]:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


def _savings(summary: dict) -> tuple[float, float, str]:
    """Best monthly savings for one resource-type summary.

    Prefer aggregatedSavingsOpportunity (rightsizing + idle, de-duplicated by Compute
    Optimizer) when present; else fall back to savingsOpportunity + idleSavingsOpportunity.
    Returns (monthly_value, percentage, currency).
    """
    agg = summary.get("aggregatedSavingsOpportunity")
    if agg:
        est = agg.get("estimatedMonthlySavings", {}) or {}
        return (
            float(est.get("value", 0.0) or 0.0),
            float(agg.get("savingsOpportunityPercentage", 0.0) or 0.0),
            est.get("currency", "USD") or "USD",
        )
    total = 0.0
    pct = 0.0
    currency = "USD"
    for key in ("savingsOpportunity", "idleSavingsOpportunity"):
        opp = summary.get(key)
        if not opp:
            continue
        est = opp.get("estimatedMonthlySavings", {}) or {}
        total += float(est.get("value", 0.0) or 0.0)
        pct = max(pct, float(opp.get("savingsOpportunityPercentage", 0.0) or 0.0))
        currency = est.get("currency", currency) or currency
    return total, pct, currency


# ─────────────────── Service ───────────────────


class GovernComputeOptimizerService:
    """AWS Compute Optimizer right-sizing — read-through, cached, honest-degrading."""

    def __init__(self, region: Optional[str] = None):
        self.region = region or settings.GOVERN_AWS_REGION

    def _client(self):
        return boto3.client("compute-optimizer", region_name=self.region)

    def get_summary(self) -> ComputeOptimizerSummaryResponse:
        result, cached_at = get_or_load(
            f"compute-optimizer:summary:{self.region}", _TTL,
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

    def _fetch_summary(self) -> ComputeOptimizerSummaryResponse:
        try:
            co = self._client()

            # 1) Confirm enrollment before trusting anything else.
            try:
                enroll = co.get_enrollment_status()
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ("AccessDeniedException", "AccessDeniedError"):
                    return self._degrade("access_denied", "Access denied to Compute Optimizer (GetEnrollmentStatus).")
                if code == "OptInRequiredException":
                    return self._degrade("not_enrolled", "Compute Optimizer is not enrolled for this account.", status="Inactive")
                raise

            status = enroll.get("status")
            last_updated = _iso(enroll.get("lastUpdatedTimestamp"))
            if status != "Active":
                return self._degrade(
                    "not_enrolled",
                    f"Compute Optimizer enrollment status is {status or 'unknown'}, not Active. "
                    "Opt in to generate right-sizing recommendations.",
                    status=status,
                    last_updated=last_updated,
                )

            # 2) Account-wide, per-resource-type recommendation summaries.
            resp = co.get_recommendation_summaries()
            summaries = resp.get("recommendationSummaries", []) or []

            by_type: list[ResourceTypeSummary] = []
            t_over = t_under = t_opt = t_not_opt = t_idle = t_analyzed = 0
            t_savings = 0.0
            currency = "USD"

            for s in summaries:
                rtype = s.get("recommendationResourceType", "Unknown")
                over = under = opt = not_opt = idle = analyzed = 0

                for item in s.get("summaries", []) or []:
                    name = item.get("name", "")
                    val = int(item.get("value", 0) or 0)
                    analyzed += val
                    if name == _OPT:
                        opt += val
                    elif name == _OVER:
                        over += val
                    elif name == _UNDER:
                        under += val
                    elif name == _NOT_OPT:
                        not_opt += val
                        # Split Lambda's coarse NotOptimized via reason codes when present.
                        for rc in item.get("reasonCodeSummaries", []) or []:
                            rc_name = rc.get("name", "")
                            rc_val = int(rc.get("value", 0) or 0)
                            if "Overprovisioned" in rc_name:
                                over += rc_val
                            elif "Underprovisioned" in rc_name:
                                under += rc_val

                for item in s.get("idleSummaries", []) or []:
                    if item.get("name") == "Idle":
                        idle += int(item.get("value", 0) or 0)

                monthly, pct, cur = _savings(s)
                currency = cur or currency

                by_type.append(ResourceTypeSummary(
                    resource_type=rtype,
                    total_analyzed=analyzed,
                    optimized=opt,
                    over_provisioned=over,
                    under_provisioned=under,
                    not_optimized=not_opt,
                    idle=idle,
                    estimated_monthly_savings=round(monthly, 2),
                    savings_percentage=round(pct, 2),
                    savings_currency=cur,
                ))

                t_over += over
                t_under += under
                t_opt += opt
                t_not_opt += not_opt
                t_idle += idle
                t_analyzed += analyzed
                t_savings += monthly

            # Surface the types with the most opportunity first.
            by_type.sort(key=lambda x: (x.estimated_monthly_savings, x.over_provisioned + x.under_provisioned), reverse=True)

            rightsizing = t_over + t_under + t_not_opt + t_idle
            monthly_total = round(t_savings, 2)

            if rightsizing == 0 and monthly_total == 0:
                note = "Compute Optimizer is Active; no right-sizing opportunities found (all analyzed resources optimized)."
            else:
                note = (
                    f"{rightsizing} right-sizing opportunity(ies) across {t_analyzed} analyzed resource(s): "
                    f"{t_over} over-, {t_under} under-provisioned, {t_idle} idle "
                    f"· ~{currency} {monthly_total:,.2f}/mo savings opportunity."
                )

            return ComputeOptimizerSummaryResponse(
                live=True,
                source="compute-optimizer",
                note=mask_account_id(note),
                enrollment_status=status,
                last_updated=last_updated,
                total_resources_analyzed=t_analyzed,
                rightsizing_opportunities=rightsizing,
                over_provisioned=t_over,
                under_provisioned=t_under,
                optimized=t_opt,
                not_optimized=t_not_opt,
                idle=t_idle,
                estimated_monthly_savings=monthly_total,
                estimated_annual_savings=round(monthly_total * 12, 2),
                savings_currency=currency,
                by_resource_type=by_type,
            )

        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("AccessDeniedException", "AccessDeniedError"):
                return self._degrade("access_denied", "Access denied to Compute Optimizer.")
            logger.warning("Compute Optimizer error: %s", e)
            return self._degrade("error", f"Compute Optimizer error: {code or 'unknown'}")
        except BotoCoreError as e:
            logger.warning("Compute Optimizer unavailable: %s", e)
            return self._degrade("unavailable", "Compute Optimizer service unavailable (network/region).")

    # ─────────────────── Honest-degrade ───────────────────

    def _degrade(
        self,
        reason: str,
        note: str,
        status: Optional[str] = None,
        last_updated: Optional[str] = None,
    ) -> ComputeOptimizerSummaryResponse:
        return ComputeOptimizerSummaryResponse(
            live=False,
            source="compute-optimizer",
            note=mask_account_id(note),
            enrollment_status=status,
            last_updated=last_updated,
            setup_guidance=self._setup_guidance(reason),
        )

    def _setup_guidance(self, reason: str) -> dict:
        base = {
            "service": "AWS Compute Optimizer",
            "docs_url": "https://docs.aws.amazon.com/compute-optimizer/latest/ug/getting-started.html",
        }
        if reason == "not_enrolled":
            return {
                **base,
                "title": "Enroll in AWS Compute Optimizer for right-sizing",
                "description": "Compute Optimizer analyzes CloudWatch utilization to recommend right-sizing for EC2, Auto Scaling groups, EBS volumes, Lambda functions, ECS on Fargate, and RDS, with estimated monthly savings.",
                "steps": [
                    "Opt in: aws compute-optimizer update-enrollment-status --status Active",
                    "Wait up to 24-48h for the first recommendations to generate",
                    "Enable enhanced infrastructure metrics for longer look-back (optional)",
                ],
                "cli_command": "aws compute-optimizer update-enrollment-status --status Active",
                "benefits": [
                    "Estimated monthly savings from over-provisioned and idle resources",
                    "Right-sizing recommendations for EC2, Lambda, ECS, RDS, EBS",
                    "Feeds FinOps cost-optimization reporting",
                ],
            }
        if reason == "access_denied":
            return {
                **base,
                "title": "IAM permissions required for Compute Optimizer",
                "steps": [
                    "Add compute-optimizer:GetEnrollmentStatus",
                    "Add compute-optimizer:GetRecommendationSummaries",
                ],
                "iam_policy": {
                    "Effect": "Allow",
                    "Action": [
                        "compute-optimizer:GetEnrollmentStatus",
                        "compute-optimizer:GetRecommendationSummaries",
                    ],
                    "Resource": "*",
                },
            }
        return {
            **base,
            "title": "Check AWS Compute Optimizer availability",
            "steps": [
                "Verify Compute Optimizer is available in this region",
                "Check network connectivity and IAM permissions",
            ],
        }
