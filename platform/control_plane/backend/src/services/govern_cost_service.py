"""Govern Cost service — reads real AWS spend from Cost Explorer.

Read-through (no DynamoDB): Cost Explorer is the source of truth. Mirrors the
Govern service convention — constructed with a region, creates its own boto3
client, and degrades gracefully: if Cost Explorer is unreachable or access is
denied (e.g. running with no credentials / `ce:GetCostAndUsage` not granted), it
returns a `live=False` fallback summary rather than raising, so the FinOps
surface still renders and can badge the data honestly.

Cost Explorer note: `ce` is a global service but boto3 requires a region; AWS
routes `ce` calls through us-east-1 regardless, which is fine here.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

import re

from core.region_config import get_governed_regions
from core.ttl_cache import get_or_load
from core.security_utils import mask_account_id, mask_budget_name
from models.govern_cost import (
    AgentCostAttribution,
    AgentCostResponse,
    AgentForecast,
    AgentForecastPoint,
    AgentForecastResponse,
    AnomalyMonitor,
    AnomalyMonitorsResponse,
    BedrockUsageMetrics,
    BedrockUsageResponse,
    CommitmentCoverage,
    CostAnomalies,
    CostAnomaly,
    CostByDay,
    CostByModel,
    CostByMonth,
    CostByOperation,
    CostByRegion,
    CostByService,
    CostByTagValue,
    CostCategoriesResponse,
    CostCategory,
    CostComparisonDriver,
    CostComparisonResponse,
    CostDriver,
    CostDriversResponse,
    CostForecast,
    CostModelBreakdown,
    CostOperationBreakdown,
    CostRegionBreakdown,
    Budget,
    BudgetsResponse,
    CostSummary,
    CostTagBreakdown,
    CostTrend,
    ProviderConnector,
    ProviderConnectorsResponse,
    QuotaUtilization,
    RICoverage,
    FinOpsDashboardSummary,
    RightsizingRecommendation,
    RightsizingResponse,
    RightsizingTarget,
    RIPurchaseRecommendation,
    RIPurchaseResponse,
    SavingsPlanCoverage,
    SavingsPlansPurchaseRecommendation,
    SavingsPlansPurchaseResponse,
    SavingsPlansUtilizationByTime,
    SavingsPlansUtilizationResponse,
    ServiceQuota,
    ServiceQuotasResponse,
    TagKeyOption,
    TagKeysResponse,
    TokenCost,
    TokenCostBreakdown,
    UsageBreakdown,
    UsageDetail,
    UseCaseSpend,
    UseCaseSpendResponse,
)

logger = logging.getLogger(__name__)

# Cost Explorer calls are ~1s each and monthly spend barely moves intraday, so a
# 15-min TTL keeps repeat page loads instant. Applied to the model-surface reads.
_COST_TTL = 900

# The governed-AI footprint used to scope FinOps/chargeback reads to AI spend
# (not the whole AWS bill). Cost Explorer SERVICE dimension values.
_AI_SERVICE_NAMES = [
    "Amazon Bedrock",
    "Amazon Bedrock Service",
    "Amazon SageMaker",
    "Amazon Comprehend",
    "Amazon Textract",
    "Amazon Kendra",
]

# ─── AgentCore compute cost ───
#
# AgentCore meters two dimensions: vCPU-hours and GB-hours. The published list
# rates below are used ONLY as RELATIVE WEIGHTS when splitting the real Cost
# Explorer "Amazon Bedrock AgentCore" service line across runtimes.
#
# Why not bill straight off the rates: measured against the same 30-day window,
# 0.27 vCPU-hr + 22.04 GB-hr priced at list came to $0.12 while the real AgentCore
# service line for that window was $0.30 — the rates cover metered compute only,
# not the rest of what the service line carries, and they drift as pricing changes.
# Using them purely as ratios pins the allocated total to the actual bill, so any
# absolute inaccuracy in the rates cancels out.
_AGENTCORE_VCPU_HOUR_RATE = 0.0464
_AGENTCORE_GB_HOUR_RATE = 0.005

# Cost Explorer SERVICE dimension value for the AgentCore line. It is a DISTINCT
# service line from "Amazon Bedrock" / "Amazon Bedrock Service", so adding it to
# Bedrock token spend does not double count.
_AGENTCORE_SERVICE_NAMES = ["Amazon Bedrock AgentCore"]

# CloudWatch metered-usage metrics in AWS/Bedrock-AgentCore, mapped to the field
# they populate on a per-agent usage record.
_AGENTCORE_USAGE_METRICS = {
    "CPUUsed-vCPUHours": "cpu_hours",
    "MemoryUsed-GBHours": "mem_hours",
}

# GetMetricData caps a call at 500 queries AND 100,800 returned datapoints. With
# daily buckets a 6-month window is ~183 points per query, so 400 queries per call
# stays inside both ceilings (400 × 183 = 73,200).
_USAGE_QUERIES_PER_CALL = 400


def _agentcore_agent_id(name_dim: str) -> str:
    """Agent id from an AWS/Bedrock-AgentCore `Name` dimension.

    The dimension is '<agent>::<qualifier>' (e.g. 'my_agent::DEFAULT'). Truncating
    at '::' yields the SAME key the invocations and CPU/Memory metric families
    share, so per-agent spend and per-agent usage join exactly rather than fuzzily.
    Masked defensively in case a `Name` ever arrives as an account-qualified ARN.
    """
    return mask_account_id(name_dim.split("::")[0]) or ""


def _new_agent_row() -> dict:
    """Blank per-agent accumulator for the AgentCore cost join."""
    return {"invocations": 0, "tagged_cost": 0.0, "cpu_hours": 0.0, "mem_hours": 0.0}


# ─── Cost Explorer USAGE_TYPE parsing (Bedrock) ───
#
# A Bedrock USAGE_TYPE is '<REGION>-<model SKU>-<metered unit>'. The metered unit
# describes WHAT was billed (token direction, cache read/write, cache TTL tier,
# cross-region routing, service tier) — never the model — so it is stripped whole
# before the model name is derived. Anchoring on the required '-tokens' /
# '-token-count' marker keeps a real SKU fragment (e.g. a '-1m' context window)
# from being mistaken for a suffix, and matching the compound form in one pass
# stops debris like '-1h' from leaking into a rendered model name.
# Callers that need the token/cache split (get_token_costs) classify it from the
# RAW usage type, so nothing is lost by dropping it here.
_USAGE_UNIT_SUFFIX_RE = re.compile(
    r"(?:-cache-(?:read|write))?"        # cache read/write
    r"(?:-(?:input|output))?"            # token direction
    r"(?:-tokens?|-token-count)"         # required metered-unit marker
    r"(?:-\d+[hm])?"                     # cache TTL tier: -1h, -5m
    r"(?:-cross-region)?"                # cross-region inference
    r"(?:-global)?"                      # global inference profile
    r"(?:-standard|-priority|-flex)?"    # service tier
    r"$"
)

# Cost Explorer writes older Bedrock SKUs as a single CamelCase run, and for
# Anthropic it puts the VERSION BEFORE THE TIER ('Claude4.5Opus') — the reverse of
# Bedrock's own model ids and catalog display names ('Claude Opus 4.5'). Split the
# run back into '<Family> <Tier> <Version>' so both parser branches emit the one
# canonical form. Only families CE actually writes as an unseparated run are
# listed, and the trailing-word anchor means already-delimited SKUs
# ('Llama3-1-70B', 'DeepSeek-R1', 'Magistral-Small-2509') are left untouched —
# blindly splitting CamelCase would mangle single-word names like 'DeepSeek'.
_CAMEL_SKU_RE = re.compile(
    r"^(Claude|Nova|Jamba|Mistral)"      # family
    r"(\d+(?:[.-]\d+)?)?"                # optional version: 4.5 / 4 / 2.0 / 1-5
    r"-?"
    r"([A-Za-z][A-Za-z0-9]*)$"           # tier / size word: Opus, Sonnet, Lite, Large
)

# Anthropic names the tier before the version ('Claude Opus 4.5'); every other
# Bedrock family names the version first ('Nova 2 Lite', 'Jamba 1.5 Large').
_VERSION_AFTER_TIER = {"Claude"}


def _canon_version(raw: str) -> str:
    """Canonicalize a SKU version fragment to the Bedrock display form.

    Model ids separate version parts with '-' while display names use '.', and a
    trailing '.0' is always dropped: '4-8' -> '4.8', '2.0' -> '2' (so CE's
    'Nova2.0Lite' lands on the catalog's 'Nova 2 Lite').
    """
    v = raw.replace("-", ".")
    return v[:-2] if v.endswith(".0") else v


def _cost_cache_note(result, cached_at: float):
    """Stamp an honest 'cached as of' age onto a live cost response."""
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


class GovernCostService:
    def __init__(self, region: str = "us-east-1", default_tag_keys: Optional[list[str]] = None,
                 spend_table_name: str = "", spend_table_region: str = "",
                 govern_region: str = ""):
        self.region = region
        # Where the GOVERNED fleet lives, for the CloudWatch (AWS/Bedrock,
        # AWS/Bedrock-AgentCore) and Service Quotas reads. Third distinct region on this
        # service, and they are genuinely three things: `region` is pinned to us-east-1 for
        # Cost Explorer, `spend_table_region` is the control-plane table's home, and this is
        # the fleet's. The fleet clients previously used `region`, which works only while
        # GOVERN_AWS_REGION happens to equal the CE pin - point the fleet at eu-west-1 and
        # every agent-cost and forecast endpoint reports zero usage while still badging live,
        # because querying CloudWatch in the wrong region succeeds and returns no datapoints.
        self.govern_region = (govern_region or "").strip() or region
        self._client = None  # lazy — don't touch AWS until first query
        # Configured fallback tag keys (from settings.GOVERN_COST_TAG_KEYS) used when
        # live discovery of activated cost-allocation tags returns nothing.
        self.default_tag_keys = default_tag_keys or ["business-unit", "business-domain", "agent", "owner"]
        # FinOps per-use-case spend store (written by spend_aggregator from LiteLLM).
        self.spend_table_name = spend_table_name
        # The spend table needs its OWN region and must not reuse `self.region`.
        # `self.region` is deliberately pinned to the Cost Explorer region (us-east-1, see
        # SERVICE_PINNED_REGIONS) because `ce` is a single-endpoint service. The spend table
        # is an ordinary control-plane DynamoDB table living in AWS_REGION (us-east-2), so
        # reusing the CE region scanned a region the table has never been in and raised
        # ResourceNotFoundException on every call - reported to the UI as "table not
        # provisioned" when it was provisioned all along, one region over.
        self.spend_table_region = (spend_table_region or "").strip() or region
        self._spend_table = None

    def get_by_use_case(self, days: int = 30) -> "UseCaseSpendResponse":
        """Cached wrapper around the FinOps spend-store scan (15 min TTL).

        Only live (populated) results are cached; the not-configured / empty state
        is returned each call so it flips to live the moment the table is provisioned.
        """
        # Keyed on the SPEND TABLE's region, not the Cost Explorer region: relocating the
        # table must invalidate this entry, and self.region never changes (it is pinned).
        key = f"cost:by-use-case:{self.spend_table_region}:{self.spend_table_name}:{days}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_by_use_case(days),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_by_use_case(self, days: int = 30) -> "UseCaseSpendResponse":
        """Real per-use-case LLM spend from the FinOps spend store (Build→FinOps loop).

        Scans the spend table, aggregates cost/tokens/requests by use_case_id over
        the trailing window, tracks each use case's top-cost model. Honest empty
        state when the table isn't provisioned or has no data yet.
        """
        if not self.spend_table_name:
            return UseCaseSpendResponse(
                by_use_case=[], window_days=days, live=False, source="not-configured",
                note="Per-use-case spend store not configured — set FINOPS_SPEND_TABLE_NAME and run the spend aggregator (LiteLLM usage).",
            )
        try:
            import boto3
            if self._spend_table is None:
                self._spend_table = boto3.resource(
                    "dynamodb", region_name=self.spend_table_region
                ).Table(self.spend_table_name)
            cutoff = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
            agg: dict[str, dict] = {}
            scan_kwargs = {}
            while True:
                resp = self._spend_table.scan(**scan_kwargs)
                for it in resp.get("Items", []):
                    if str(it.get("date", "")) < cutoff:
                        continue
                    uc = it.get("use_case_id") or "unknown"
                    b = agg.setdefault(uc, {"cost": 0.0, "in": 0, "out": 0, "req": 0, "models": {}})
                    cost = float(it.get("total_cost_usd", 0) or 0)
                    b["cost"] += cost
                    b["in"] += int(it.get("input_tokens", 0) or 0)
                    b["out"] += int(it.get("output_tokens", 0) or 0)
                    b["req"] += int(it.get("request_count", 0) or 0)
                    model = it.get("model_id") or "unknown"
                    b["models"][model] = b["models"].get(model, 0.0) + cost
                lek = resp.get("LastEvaluatedKey")
                if not lek:
                    break
                scan_kwargs["ExclusiveStartKey"] = lek

            rows = [
                UseCaseSpend(
                    use_case_id=uc,
                    total_cost_usd=round(b["cost"], 2),
                    input_tokens=b["in"], output_tokens=b["out"], request_count=b["req"],
                    top_model=max(b["models"].items(), key=lambda kv: kv[1])[0] if b["models"] else None,
                )
                for uc, b in agg.items() if round(b["cost"], 2) > 0
            ]
            rows.sort(key=lambda r: r.total_cost_usd, reverse=True)
            total = round(sum(r.total_cost_usd for r in rows), 2)
            return UseCaseSpendResponse(
                by_use_case=rows, total_cost_usd=total, window_days=days,
                live=len(rows) > 0, source="finops-spend-store",
                note=None if rows else "No per-use-case spend recorded yet — deploy a use case through the LLM gateway to populate.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            # Name the table AND the region searched. The old message asserted "table not
            # provisioned or access denied", which sent the reader looking for a missing
            # table or an IAM gap while the real cause was a correctly-provisioned table
            # being scanned in the wrong region - a diagnosis the message actively ruled out.
            logger.warning(
                "FinOps spend store unavailable: table %r in %s: %s",
                self.spend_table_name, self.spend_table_region, e,
            )
            return UseCaseSpendResponse(
                by_use_case=[], window_days=days, live=False, source="unavailable-fallback",
                note=(
                    f"FinOps spend store unreachable — table '{self.spend_table_name}' in "
                    f"{self.spend_table_region} is not provisioned there, or access is denied. "
                    "If the table exists in another region, set FINOPS_SPEND_TABLE_REGION."
                ),
            )

    def _ce(self):
        if self._client is None:
            self._client = boto3.client("ce", region_name=self.region)
        return self._client

    def get_provider_connectors(self) -> "ProviderConnectorsResponse":
        """Cross-provider cost-connector status — honest 'connected vs not'.

        AWS is connected when Cost Explorer answers a probe query; Azure and
        Google Vertex are reported as not-connected (they need their own billing
        connector wired). This is a truthful scaffold for the cross-provider
        FinOps view — it never fabricates other-cloud spend.
        """
        aws_connected = False
        aws_detail = "Cost Explorer not reachable (no credentials or ce:GetCostAndUsage denied)."
        try:
            today = date.today()
            start = (today - timedelta(days=1)).isoformat()
            self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": today.isoformat()},
                Granularity="DAILY",
                Metrics=["UnblendedCost"],
            )
            aws_connected = True
            aws_detail = "Live — spend, trend, forecast, anomalies & by-tag all sourced from Cost Explorer."
        except (BotoCoreError, ClientError) as e:
            logger.info("Provider connectors: AWS Cost Explorer probe failed: %s", e)

        connectors = [
            ProviderConnector(
                provider="aws", label="AWS (Cost Explorer)", connected=aws_connected,
                source="cost-explorer" if aws_connected else "cost-explorer-unavailable",
                detail=aws_detail,
            ),
            ProviderConnector(
                provider="azure", label="Azure (OpenAI / Foundry)", connected=False,
                source="azure-cost-management",
                detail="Needs an Azure Cost Management export connector (Consumption API) — not wired.",
            ),
            ProviderConnector(
                provider="gcp", label="Google (Vertex AI)", connected=False,
                source="gcp-billing-bigquery",
                detail="Needs a Google Cloud Billing → BigQuery export connector — not wired.",
            ),
        ]
        connected = sum(1 for c in connectors if c.connected)
        return ProviderConnectorsResponse(
            connectors=connectors,
            connected_count=connected,
            total_count=len(connectors),
            live=connected > 0,
            source="mixed",
            note="Only connected providers contribute real spend to the cross-provider view; others are illustrative until a connector is wired.",
        )

    def get_budgets(self) -> "BudgetsResponse":
        """Live AWS Budgets (budgets:DescribeBudgets) — real budget-vs-actual.

        Honest empty-state when no budgets are defined in the account.
        """
        try:
            account_id = boto3.client("sts", region_name=self.region).get_caller_identity()["Account"]
            budgets_client = boto3.client("budgets", region_name=self.region)
            raw = budgets_client.describe_budgets(AccountId=account_id).get("Budgets", [])
            out: list[Budget] = []
            for b in raw:
                limit = float(b.get("BudgetLimit", {}).get("Amount", 0) or 0)
                spend = b.get("CalculatedSpend", {}) or {}
                actual = float(spend.get("ActualSpend", {}).get("Amount", 0) or 0)
                forecast = float(spend.get("ForecastedSpend", {}).get("Amount", 0) or 0)
                # Mask budget name to avoid exposing internal org structure.
                raw_name = b.get("BudgetName", "budget")
                out.append(Budget(
                    name=mask_budget_name(raw_name) or raw_name,
                    limit=round(limit, 2),
                    actual=round(actual, 2),
                    forecast=round(forecast, 2),
                    time_unit=b.get("TimeUnit", "MONTHLY"),
                    pct_used=round((actual / limit) * 100, 1) if limit > 0 else 0.0,
                ))
            out.sort(key=lambda x: x.pct_used, reverse=True)
            return BudgetsResponse(
                budgets=out,
                total_limit=round(sum(x.limit for x in out), 2),
                total_actual=round(sum(x.actual for x in out), 2),
                live=True,
                source="aws-budgets",
                note=None if out else "No AWS Budgets defined in this account — create budgets in the Billing console to track budget-vs-actual here.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AWS Budgets unavailable: %s", e)
            return BudgetsResponse(budgets=[], live=False, source="unavailable-fallback",
                                   note="AWS Budgets unreachable or budgets:DescribeBudgets not granted.")

    def list_tag_keys(self) -> "TagKeysResponse":
        """Offer the account's cost-allocation tag keys.

        Prefer LIVE discovery (ce:ListCostAllocationTags) so the Cost-by-Tag view
        reflects what the account actually tags with — active keys first. Falls back
        to the configured default set when discovery is empty or not permitted.
        """
        try:
            resp = self._ce().list_cost_allocation_tags(MaxResults=100)
            tags = resp.get("CostAllocationTags", [])
            # user-defined keys only; mark which are active for cost allocation
            opts = [
                TagKeyOption(key=t["TagKey"], active=(t.get("Status") == "Active"))
                for t in tags
                if t.get("Type") in ("UserDefined", "CostCategory")
            ]
            # active first, then alpha
            opts.sort(key=lambda o: (not o.active, o.key.lower()))
            if opts:
                active_n = sum(1 for o in opts if o.active)
                return TagKeysResponse(
                    keys=opts, discovered=True, source="cost-explorer",
                    note=None if active_n else "No tags are activated for cost allocation yet — activate one in the payer account's Billing console.",
                )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListCostAllocationTags unavailable, using configured defaults: %s", e)
        # Fallback: configured defaults, activation status unknown.
        return TagKeysResponse(
            keys=[TagKeyOption(key=k, active=False) for k in self.default_tag_keys],
            discovered=False, source="configured-default",
            note="Showing configured tag keys — could not discover the account's activated tags.",
        )

    @staticmethod
    def _default_window(months: int, months_offset: int = 0) -> tuple[str, str]:
        """[start, end) in YYYY-MM-DD, on calendar-month boundaries.

        `months` is the window LENGTH in calendar months, counting the end month.
        `months_offset` shifts the whole window back that many months.

        With offset 0 the window always ends at the first of NEXT month, so it includes
        the current partial month:

            months=1,  offset=0  ->  2026-09-01 .. 2026-10-01   month-to-date
            months=3,  offset=0  ->  2026-07-01 .. 2026-10-01
            months=12, offset=0  ->  2025-10-01 .. 2026-10-01

        `months_offset` exists so a CLOSED prior period can be requested, which was
        previously impossible - every window ended at the first of next month, so
        "last month" could not be expressed at all:

            months=1,  offset=1  ->  2026-08-01 .. 2026-09-01   last month, complete

        Note the consequence for any figure derived from a window with offset 0: it
        covers a PARTIAL current month, so comparing it against a closed month is
        comparing unequal spans. Callers that present both must say which is which.
        """
        today = datetime.now(timezone.utc).date()
        # First of next month, then step back `months_offset` whole months.
        end = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        for _ in range(max(0, months_offset)):
            end = (end - timedelta(days=1)).replace(day=1)
        # Start is `months - 1` whole months before the window's last month.
        start_month = (end - timedelta(days=1)).replace(day=1)
        for _ in range(max(0, months - 1)):
            start_month = (start_month - timedelta(days=1)).replace(day=1)
        return start_month.isoformat(), end.isoformat()

    def get_summary(self, months: int = 6, ai_only: bool = False, months_offset: int = 0) -> CostSummary:
        """Cached wrapper around the live CE summary fetch (15 min TTL)."""
        key = f"cost:summary:{self.region}:{months}:{months_offset}:{ai_only}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_summary(months, ai_only, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_summary(self, months: int = 6, ai_only: bool = False, months_offset: int = 0) -> CostSummary:
        """Total + by-service + by-month AWS spend for the trailing window.

        ai_only: when True, filter to the AI/ML footprint (Bedrock, SageMaker,
        Comprehend, etc.) so FinOps can show the governed-AI slice of the bill.
        """
        start, end = self._default_window(months, months_offset)

        cost_filter = {"Dimensions": {"Key": "SERVICE", "Values": _AI_SERVICE_NAMES}} if ai_only else None

        try:
            ce = self._ce()
            kwargs = dict(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
            )
            if cost_filter:
                kwargs["Filter"] = cost_filter
            resp = ce.get_cost_and_usage(**kwargs)

            by_month: list[CostByMonth] = []
            service_totals: dict[str, float] = {}
            grand_total = 0.0

            for period in resp.get("ResultsByTime", []):
                month_start = period["TimePeriod"]["Start"]
                month_total = 0.0
                for grp in period.get("Groups", []):
                    svc = grp["Keys"][0]
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    service_totals[svc] = service_totals.get(svc, 0.0) + amt
                    month_total += amt
                by_month.append(CostByMonth(month=month_start, amount=round(month_total, 2)))
                grand_total += month_total

            by_service = [
                CostByService(service=svc, amount=round(amt, 2))
                for svc, amt in sorted(service_totals.items(), key=lambda kv: kv[1], reverse=True)
            ]

            return CostSummary(
                total=round(grand_total, 2),
                period_start=start,
                period_end=end,
                by_service=by_service,
                by_month=by_month,
                live=True,
                source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer unavailable, returning fallback summary: %s", e)
            return CostSummary(
                total=0.0,
                period_start=start,
                period_end=end,
                by_service=[],
                by_month=[],
                live=False,
                source="unavailable-fallback",
                note="Cost Explorer unreachable or ce:GetCostAndUsage not granted — connect an AWS account with Cost Explorer enabled.",
            )

    @staticmethod
    def _model_from_usage_type(usage_type: str) -> str:
        """Parse the canonical Bedrock model name out of a CE USAGE_TYPE.

        Two AWS formats exist in the wild, and both are normalized to the ONE
        canonical form — Bedrock's own catalog display name, '<Family> <Tier>
        <Version>' — so a single model family can never split into several
        by-model rows and so the name keys identically to a govern_models catalog
        `name` / `model_id`:
          A) 'USE1-Claude4.5Sonnet-input-tokens-cross-region-global' -> 'Claude Sonnet 4.5'
          B) 'USE1-anthropic.claude-opus-4-8-mantle-input-tokens-standard' -> 'Claude Opus 4.8'
             (dotted vendor SKU; region prefix optional; '-1h' cache variants exist)
        The metered unit ('-input-tokens', '-cache-write-input-token-count-1h', …)
        is always stripped whole, so a raw usage-type suffix can never surface as
        a model name. Real SKU distinctions are preserved: distinct versions stay
        distinct rows ('Claude Fable 5' vs 'Claude Fable 5.1'), and the cache /
        token-direction split stays available to get_token_costs, which reads it
        off the raw usage type.
        Guardrail usage types aren't a model — bucket them as 'Guardrails'.
        """
        if "Guardrail" in usage_type:
            return "Guardrails"
        # Format B: [REGION-]<vendor>.<family>-<tier>-<ver>-mantle-… (dotted SKU).
        # Anchor on '-mantle' so the region prefix and cache/-1h suffixes don't matter.
        m = re.search(r"[a-z]+\.([a-z]+)-([a-z]+)-([0-9-]+?)-mantle", usage_type)
        if m:
            fam, tier, ver = m.group(1), m.group(2), _canon_version(m.group(3))
            return f"{fam.capitalize()} {tier.capitalize()} {ver}".strip()
        # Format A: REGION-<Model>-<metered unit>
        s = re.sub(r"^[A-Z0-9]+-", "", usage_type)  # drop region prefix (USE1-, USW2-, …)
        s = _USAGE_UNIT_SUFFIX_RE.sub("", s)
        m = _CAMEL_SKU_RE.match(s)
        if m:
            fam, ver, tier = m.group(1), m.group(2), m.group(3)
            if not ver:
                return f"{fam} {tier}"                       # 'NovaPro' -> 'Nova Pro'
            ver = _canon_version(ver)
            return (f"{fam} {tier} {ver}" if fam in _VERSION_AFTER_TIER
                    else f"{fam} {ver} {tier}")
        return s or usage_type

    def get_by_model(self, months: int = 6, months_offset: int = 0) -> CostModelBreakdown:
        """Cached wrapper around the live CE by-model fetch (15 min TTL)."""
        key = f"cost:by-model:{self.region}:{months}:{months_offset}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_by_model(months, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_by_model(self, months: int = 6, months_offset: int = 0) -> CostModelBreakdown:
        """Bedrock spend broken out by model — CE grouped by USAGE_TYPE, Bedrock-filtered."""
        start, end = self._default_window(months, months_offset)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
            )
            totals: dict[str, float] = {}
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    model = self._model_from_usage_type(grp["Keys"][0])
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    totals[model] = totals.get(model, 0.0) + amt
            by_model = [
                CostByModel(model=m, amount=round(a, 2))
                for m, a in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
                if round(a, 2) > 0
            ]
            return CostModelBreakdown(
                by_model=by_model,
                total=round(sum(m.amount for m in by_model), 2),
                period_start=start,
                period_end=end,
                live=True,
                source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer by-model unavailable: %s", e)
            return CostModelBreakdown(by_model=[], period_start=start, period_end=end,
                                      live=False, source="unavailable-fallback",
                                      note="Cost Explorer unreachable or ce:GetCostAndUsage not granted.")

    def get_by_tag(self, key: str, months: int = 6, ai_only: bool = True, months_offset: int = 0) -> CostTagBreakdown:
        """AWS cost grouped by a cost-allocation tag key (CE GroupBy=TAG).

        `key` is the AWS cost-allocation tag key (from the discovered/configured
        list — see list_tag_keys). Honest empty-state: if the tag isn't activated /
        no resources carry it, CE returns only an untagged bucket — we surface that
        as note='awaiting tagged usage' rather than faking.

        ai_only (default True): scope to the governed-AI footprint (Bedrock,
        SageMaker, etc.) so chargeback attributes AI/agent spend — NOT the entire
        AWS bill (EC2/S3/RDS), which would grossly overstate AI cost.
        """
        aws_key = key
        start, end = self._default_window(months, months_offset)
        try:
            kwargs = dict(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "TAG", "Key": aws_key}],
            )
            if ai_only:
                kwargs["Filter"] = {"Dimensions": {"Key": "SERVICE", "Values": _AI_SERVICE_NAMES}}
            resp = self._ce().get_cost_and_usage(**kwargs)
            totals: dict[str, float] = {}
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    # CE returns keys like 'business-unit$Retail' — value after '$'
                    raw = grp["Keys"][0]
                    value = raw.split("$", 1)[1] if "$" in raw else raw
                    value = value or "untagged"
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    totals[value] = totals.get(value, 0.0) + amt

            untagged = round(totals.pop("untagged", 0.0), 2)
            by_value = [
                CostByTagValue(value=v, amount=round(a, 2))
                for v, a in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
                if round(a, 2) > 0
            ]
            tagged_total = round(sum(v.amount for v in by_value), 2)
            note = None
            if tagged_total == 0:
                note = (
                    f"No spend is tagged with '{aws_key}' yet. Activate the tag key in the "
                    "payer account's Billing console and stamp it on resources at deploy time "
                    "(from the Plan use case) — attribution is forward-only."
                )
            return CostTagBreakdown(
                tag_key=aws_key,
                by_value=by_value,
                tagged_total=tagged_total,
                untagged_total=untagged,
                period_start=start,
                period_end=end,
                live=True,
                source="cost-explorer",
                note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer by-tag unavailable: %s", e)
            return CostTagBreakdown(
                tag_key=aws_key, by_value=[], period_start=start, period_end=end,
                live=False, source="unavailable-fallback",
                note="Cost Explorer unreachable, or tag not activated for cost allocation.",
            )

    def get_trend(self, days: int = 30) -> CostTrend:
        """Daily unblended spend for the trailing `days` — powers the 30-day trend + velocity."""
        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=days)).isoformat()
        end = today.isoformat()
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="DAILY",
                Metrics=["UnblendedCost"],
            )
            points = [
                CostByDay(
                    date=p["TimePeriod"]["Start"],
                    amount=round(float(p["Total"]["UnblendedCost"]["Amount"]), 2),
                )
                for p in resp.get("ResultsByTime", [])
            ]
            total = round(sum(d.amount for d in points), 2)
            return CostTrend(
                days=points,
                total=total,
                avg_per_day=round(total / len(points), 2) if points else 0.0,
                live=True,
                source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer trend unavailable: %s", e)
            return CostTrend(days=[], live=False, source="unavailable-fallback",
                             note="Cost Explorer unreachable — connect an AWS account with ce:GetCostAndUsage.")

    def get_forecast(self, months: int = 3) -> CostForecast:
        """Forward spend from Cost Explorer's own model (GetCostForecast). Monthly points."""
        today = datetime.now(timezone.utc).date()
        # forecast must start no earlier than today
        start = (today + timedelta(days=1)).isoformat()
        end_month = today.replace(day=1)
        for _ in range(months):
            end_month = (end_month + timedelta(days=32)).replace(day=1)
        end = end_month.isoformat()
        try:
            resp = self._ce().get_cost_forecast(
                TimePeriod={"Start": start, "End": end},
                Metric="UNBLENDED_COST",
                Granularity="MONTHLY",
            )
            pts = [
                CostByMonth(
                    month=r["TimePeriod"]["Start"],
                    amount=round(float(r["MeanValue"]), 2),
                )
                for r in resp.get("ForecastResultsByTime", [])
            ]
            return CostForecast(
                forecast_total=round(float(resp["Total"]["Amount"]), 2),
                months=pts,
                horizon_start=start,
                horizon_end=end,
                live=True,
                source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer forecast unavailable: %s", e)
            return CostForecast(forecast_total=0.0, months=[], horizon_start=start, horizon_end=end,
                                live=False, source="unavailable-fallback",
                                note="Cost Explorer forecast unreachable or insufficient history — needs ce:GetCostForecast.")

    def get_anomalies(self, days: int = 60) -> CostAnomalies:
        """Real cost anomalies from AWS Cost Anomaly Detection (GetAnomalies)."""
        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=days)).isoformat()
        end = today.isoformat()
        try:
            resp = self._ce().get_anomalies(DateInterval={"StartDate": start, "EndDate": end})
            items = []
            for a in resp.get("Anomalies", []):
                root = (a.get("RootCauses") or [{}])[0]
                items.append(CostAnomaly(
                    start=a.get("AnomalyStartDate", "") or "",
                    end=a.get("AnomalyEndDate", "") or "",
                    service=root.get("Service"),
                    impact=round(float(a.get("Impact", {}).get("TotalImpact", 0.0)), 2),
                    score=round(float(a.get("AnomalyScore", {}).get("MaxScore", 0.0)), 2),
                ))
            # Most impactful first.
            items.sort(key=lambda x: x.impact, reverse=True)
            return CostAnomalies(anomalies=items, count=len(items), live=True, source="cost-explorer")
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer anomalies unavailable: %s", e)
            return CostAnomalies(anomalies=[], count=0, live=False, source="unavailable-fallback",
                                 note="Cost Anomaly Detection unreachable — needs ce:GetAnomalies.")

    # ─── Enhanced Cost Explorer dimensions ───

    def get_by_region(self, months: int = 6, months_offset: int = 0) -> CostRegionBreakdown:
        """Cost Explorer spend by region, split against the governed-region set."""
        # The governed set is part of the cache key, not just the CE region: the
        # governed/ungoverned split is computed from it, so a region pulled into
        # governance has to invalidate this entry rather than wait out the 15 min TTL
        # showing spend as ungoverned when it no longer is.
        scope = ",".join(get_governed_regions())
        key = f"cost:by-region:{self.region}:{scope}:{months}:{months_offset}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_by_region(months, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_by_region(self, months: int = 6, months_offset: int = 0) -> CostRegionBreakdown:
        start, end = self._default_window(months, months_offset)
        governed = get_governed_regions()
        governed_set = set(governed)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "REGION"}],
            )
            totals: dict[str, float] = {}
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    region = grp["Keys"][0] or "global"
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    totals[region] = totals.get(region, 0.0) + amt
            by_region = [
                # CE also emits non-region keys here ("global", "NoRegion") for charges
                # that aren't regional; those are correctly not governed rather than
                # coerced into a region.
                CostByRegion(region=r, amount=round(a, 2), governed=r in governed_set)
                for r, a in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
                if round(a, 2) > 0
            ]
            governed_total = round(sum(r.amount for r in by_region if r.governed), 2)
            ungoverned_total = round(sum(r.amount for r in by_region if not r.governed), 2)
            note = None
            if ungoverned_total > 0:
                ungoverned_names = ", ".join(r.region for r in by_region if not r.governed)
                note = (
                    f"${ungoverned_total:,.2f} of this spend is outside the governed "
                    f"region set ({ungoverned_names}); Govern dashboards do not cover it."
                )
            return CostRegionBreakdown(
                by_region=by_region,
                total=round(sum(r.amount for r in by_region), 2),
                governed_total=governed_total,
                ungoverned_total=ungoverned_total,
                governed_regions=governed,
                period_start=start, period_end=end,
                live=True, source="cost-explorer",
                note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer by-region unavailable: %s", e)
            return CostRegionBreakdown(by_region=[], period_start=start, period_end=end,
                                       governed_regions=governed,
                                       live=False, source="unavailable-fallback",
                                       note="Cost Explorer unreachable or ce:GetCostAndUsage not granted.")

    def get_by_operation(self, months: int = 6, months_offset: int = 0) -> CostOperationBreakdown:
        """Bedrock cost by operation type (InvokeModel, streaming, etc.)."""
        key = f"cost:by-operation:{self.region}:{months}:{months_offset}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_by_operation(months, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_by_operation(self, months: int = 6, months_offset: int = 0) -> CostOperationBreakdown:
        start, end = self._default_window(months, months_offset)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                GroupBy=[{"Type": "DIMENSION", "Key": "OPERATION"}],
            )
            totals: dict[str, float] = {}
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    op = grp["Keys"][0] or "Unknown"
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    totals[op] = totals.get(op, 0.0) + amt
            by_operation = [
                CostByOperation(operation=o, amount=round(a, 2))
                for o, a in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
                if round(a, 2) > 0
            ]
            return CostOperationBreakdown(
                by_operation=by_operation,
                total=round(sum(o.amount for o in by_operation), 2),
                period_start=start, period_end=end,
                live=True, source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer by-operation unavailable: %s", e)
            return CostOperationBreakdown(by_operation=[], period_start=start, period_end=end,
                                          live=False, source="unavailable-fallback",
                                          note="Cost Explorer unreachable or ce:GetCostAndUsage not granted.")

    def get_token_costs(self, months: int = 6, months_offset: int = 0) -> TokenCostBreakdown:
        """Bedrock cost split by input vs output tokens (parsed from USAGE_TYPE)."""
        key = f"cost:token-costs:{self.region}:{months}:{months_offset}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_token_costs(months, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    # _BEDROCK_PRICING and _estimate_tokens_from_cost were DELETED here.
    #
    # They existed to run backwards - dividing Cost Explorer dollars by a rate to
    # guess a token count - and both were unnecessary and broken:
    #
    #  1. UNNECESSARY. Real per-model token counts are measured directly from the
    #     CloudWatch AWS/Bedrock metrics (govern_models_service), so nothing needs
    #     to be inferred from spend.
    #  2. BROKEN. The key matcher stripped hyphens from the dict key but not from
    #     the model string, so `"nova-pro"` became `"novapro"` and matched neither
    #     direction of the substring test. All 11 real model names produced by
    #     `_model_from_usage_type` fell through to the `default` row, meaning every
    #     token estimate in the product used one Sonnet rate regardless of model.
    #  3. SELF-REFERENTIAL. The one UI consumer computed
    #     `$/1K = dollars / (dollars / rate * 1000) * 1000`, which reduces to the
    #     rate itself - so the "Token Economics" $/1K KPI displayed exactly
    #     $0.0150/1K output on every account, no matter what that account spent.
    #
    # `TokenCost.tokens` is now None. Forward pricing (measured tokens -> dollars)
    # lives in core/model_pricing.py.

    def _fetch_token_costs(self, months: int = 6, months_offset: int = 0) -> TokenCostBreakdown:
        start, end = self._default_window(months, months_offset)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
            )
            # Aggregate by (token_type, model): CE returns one group per (month,
            # usage_type), and input / cache-read / cache-write all fold into the
            # 'input' bucket — appending per group left the same model split across
            # multiple un-merged rows (e.g. Opus x3). Merge before rendering.
            agg: dict[tuple[str, str], dict[str, float]] = {}
            input_total = 0.0
            output_total = 0.0
            # Sub-totals of input_total, tracked separately so cache spend is a real
            # measured figure rather than something the UI has to estimate.
            fresh_input_total = 0.0
            cache_read_total = 0.0
            cache_write_total = 0.0

            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    usage_type = grp["Keys"][0]
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    if round(amt, 2) <= 0:
                        continue
                    model = self._model_from_usage_type(usage_type)
                    if "Guardrail" in usage_type:
                        continue
                    usage_lower = usage_type.lower()
                    # Cache read and cache write are SEPARATE billing dimensions in
                    # Bedrock, not flavours of input. They were previously all folded
                    # into "input", which made cache spend unrecoverable downstream -
                    # the FinOps cache panel had to estimate it from a token ratio and
                    # a hardcoded 0.9 discount instead of reading the real dollars.
                    #
                    # Cache WRITE is the one that matters commercially: it is billed
                    # ABOVE the standard input rate (1.25x on the models AWS documents
                    # a multiplier for), so hiding it inside "input" concealed the only
                    # cache dimension that can make a workload more expensive.
                    #
                    # `input_total` still includes cache dollars so the existing
                    # input-vs-output split and its consumers keep the same meaning;
                    # the new per-dimension totals are additive detail, not a
                    # redefinition. cache_read_total + cache_write_total <= input_total.
                    if "cache-read" in usage_lower:
                        token_type = "cache_read"
                        input_total += amt
                        cache_read_total += amt
                    elif "cache-write" in usage_lower:
                        token_type = "cache_write"
                        input_total += amt
                        cache_write_total += amt
                    elif "-input-token" in usage_lower:
                        token_type = "input"
                        input_total += amt
                        fresh_input_total += amt
                    elif "-output-token" in usage_lower:
                        token_type = "output"
                        output_total += amt
                    else:
                        continue

                    # Dollars only. Token counts are NOT derived from spend - see the
                    # note where _estimate_tokens_from_cost was deleted. Real counts
                    # come from CloudWatch, and a count guessed from a list price would
                    # be wrong for any account on committed or Marketplace pricing.
                    entry = agg.setdefault((token_type, model), {"amount": 0.0})
                    entry["amount"] += amt

            items = [
                # tokens=None: this endpoint reports measured DOLLARS. Token counts
                # for the same models come from the CloudWatch runtime metrics.
                TokenCost(token_type=tt, model=model, tokens=None, amount=round(v["amount"], 2))
                for (tt, model), v in agg.items()
                if round(v["amount"], 2) > 0
            ]
            items.sort(key=lambda x: x.amount, reverse=True)
            return TokenCostBreakdown(
                by_token_type=items[:20],
                input_total=round(input_total, 2),
                output_total=round(output_total, 2),
                fresh_input_total=round(fresh_input_total, 2),
                cache_read_total=round(cache_read_total, 2),
                cache_write_total=round(cache_write_total, 2),
                period_start=start, period_end=end,
                live=True, source="cost-explorer",
                note=(
                    "Measured Cost Explorer dollars. Token counts are not reported here - "
                    "they are measured directly from CloudWatch, not inferred from spend. "
                    "Cache read and cache write are reported separately and are both "
                    "included in input_total."
                ),
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer token costs unavailable: %s", e)
            return TokenCostBreakdown(by_token_type=[], period_start=start, period_end=end,
                                      live=False, source="unavailable-fallback",
                                      note="Cost Explorer unreachable or ce:GetCostAndUsage not granted.")

    # ─────────────────── AgentCore compute attribution (shared) ───────────────────

    def _fetch_agentcore_usage_hours(
        self, start: datetime, end: datetime,
    ) -> dict[str, dict[str, float]]:
        """Measured AgentCore vCPU-hours / GB-hours per agent, from CloudWatch.

        Fetched over the CALLER'S cost window (not the 30-day clamp the
        /agentcore/resource-usage route imposes), so usage and spend always describe
        the same period — no silent window mixing at any `days`/`months` value. Keyed
        by `_agentcore_agent_id`, the same key the invocations query uses.

        Buckets are daily (`Period=86400`) and summed: day-aligned buckets match the
        day-granularity cost window, and the datapoint budget stays inside
        GetMetricData's per-call cap even for a 6-month window.

        Raises on AWS failure; every caller wraps this in the honest-degrade handler.
        """
        cw = boto3.client("cloudwatch", region_name=self.govern_region)
        period = 86400
        queries: list[dict] = []
        qid_map: dict[str, tuple[str, str]] = {}  # qid -> (agent_id, usage field)

        for metric_name, field in _AGENTCORE_USAGE_METRICS.items():
            paginator = cw.get_paginator("list_metrics")
            for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric_name):
                for m in page.get("Metrics", []):
                    dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                    name_dim = dims.get("Name", "")
                    if "::" not in name_dim:
                        continue
                    qid = f"u{len(queries)}"
                    qid_map[qid] = (_agentcore_agent_id(name_dim), field)
                    queries.append({
                        "Id": qid,
                        "MetricStat": {
                            "Metric": {
                                "Namespace": "AWS/Bedrock-AgentCore",
                                "MetricName": metric_name,
                                "Dimensions": m.get("Dimensions", []),
                            },
                            "Period": period,
                            "Stat": "Sum",
                        },
                    })

        usage: dict[str, dict[str, float]] = {}
        for batch_start in range(0, len(queries), _USAGE_QUERIES_PER_CALL):
            resp = cw.get_metric_data(
                MetricDataQueries=queries[batch_start:batch_start + _USAGE_QUERIES_PER_CALL],
                StartTime=start, EndTime=end,
            )
            for r in resp.get("MetricDataResults", []):
                mapped = qid_map.get(r["Id"])
                if not mapped:
                    continue
                agent_id, field = mapped
                vals = r.get("Values", [])
                entry = usage.setdefault(agent_id, {"cpu_hours": 0.0, "mem_hours": 0.0})
                entry[field] += sum(vals) if vals else 0.0
        return usage

    def _fetch_agentcore_service_spend(self, start_str: str, end_str: str) -> float:
        """Real Cost Explorer spend on the 'Amazon Bedrock AgentCore' service line."""
        resp = self._ce().get_cost_and_usage(
            TimePeriod={"Start": start_str, "End": end_str},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            Filter={"Dimensions": {"Key": "SERVICE", "Values": _AGENTCORE_SERVICE_NAMES}},
        )
        return sum(
            float(p["Total"]["UnblendedCost"]["Amount"])
            for p in resp.get("ResultsByTime", [])
        )

    @staticmethod
    def _allocate_agentcore_compute(
        usage: dict[str, dict[str, float]], service_spend: float,
    ) -> tuple[dict[str, float], str]:
        """Split the REAL AgentCore bill across agents by their measured usage.

        Weight = cpu_hours·vCPU-rate + mem_hours·GB-rate — the list rates only make
        the two metered dimensions commensurable with each other; the resulting
        allocation total equals the actual Cost Explorer amount.

        Returns (compute cost per agent, basis):
          'allocated'     — real CE service line split pro-rata by measured usage
          'rate-estimate' — CE line unavailable/zero: list-price approximation
          'no-usage'      — nothing measured to attribute
        """
        weights = {
            agent_id: (u.get("cpu_hours", 0.0) * _AGENTCORE_VCPU_HOUR_RATE
                       + u.get("mem_hours", 0.0) * _AGENTCORE_GB_HOUR_RATE)
            for agent_id, u in usage.items()
        }
        total_weight = sum(weights.values())
        if total_weight <= 0:
            return {}, "no-usage"
        if service_spend > 0:
            return {a: service_spend * (w / total_weight) for a, w in weights.items()}, "allocated"
        return dict(weights), "rate-estimate"

    @staticmethod
    def _agentcore_compute_note(compute_by_agent: dict[str, float], basis: str) -> Optional[str]:
        """Plain-language provenance for the compute column — never claims per-agent billing."""
        total = sum(compute_by_agent.values())
        if basis == "allocated":
            return (
                f"${total:.2f} AgentCore compute taken from the Cost Explorer "
                f"'Amazon Bedrock AgentCore' service line and allocated across "
                f"{len(compute_by_agent)} runtime(s) pro-rata to measured vCPU-hours/"
                f"GB-hours — an allocation, not per-runtime billing"
            )
        if basis == "rate-estimate":
            return (
                f"${total:.2f} AgentCore compute ESTIMATED from measured vCPU-hours/"
                f"GB-hours at list prices (${_AGENTCORE_VCPU_HOUR_RATE}/vCPU-hour, "
                f"${_AGENTCORE_GB_HOUR_RATE}/GB-hour); the Cost Explorer AgentCore "
                f"service line was unavailable, so treat this as a list-price "
                f"approximation, not measured billing"
            )
        return None

    def get_agent_costs(self, months: int = 6, agentcore_metrics: dict | None = None, months_offset: int = 0) -> AgentCostResponse:
        """Per-agent cost attribution using tags + AgentCore runtime metrics.

        When `agentcore_metrics` is omitted the AgentCore usage side is fetched
        internally (15 min TTL) — previously the compute column was structurally
        $0 here because the only route caller never passed it.
        """
        if agentcore_metrics is not None:
            return self._fetch_agent_costs(months, agentcore_metrics)
        key = f"cost:agent-costs:{self.region}:{months}:{months_offset}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_agent_costs(months, None, months_offset),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_agent_costs(self, months: int = 6, agentcore_metrics: dict | None = None, months_offset: int = 0) -> AgentCostResponse:
        """Live fetch behind get_agent_costs.

        Combines:
        1. Cost Explorer by 'agent' tag (Bedrock spend attributed to each agent)
        2. AgentCore CloudWatch usage (vCPU-hours / GB-hours) + the real Cost
           Explorer AgentCore service line, allocated pro-rata, for compute cost

        `agentcore_metrics`, when supplied, is a pre-merged dict from
        get_agent_metrics + get_resource_usage: {agent_id: {invocations, cpu_hours, mem_hours}}.
        """
        start, end = self._default_window(months, months_offset)
        by_agent: dict[str, AgentCostAttribution] = {}

        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                GroupBy=[{"Type": "TAG", "Key": "agent"}],
            )
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    raw = grp["Keys"][0]
                    agent_tag = raw.split("$", 1)[1] if "$" in raw else raw
                    if not agent_tag or agent_tag == "untagged":
                        continue
                    amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    if agent_tag not in by_agent:
                        by_agent[agent_tag] = AgentCostAttribution(
                            agent_id=agent_tag, cost_allocation_tag="agent",
                        )
                    by_agent[agent_tag].bedrock_cost += amt
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost Explorer agent costs unavailable: %s", e)

        # AgentCore compute. Previously this whole block was dead on the route path
        # (the only caller never passed `agentcore_metrics`), so compute_cost was
        # structurally 0.0. Now the usage side is fetched here when not supplied, and
        # the real Cost Explorer AgentCore service line is allocated across it.
        usage: dict[str, dict[str, float]] = {}
        compute_basis = "no-usage"
        compute_note: Optional[str] = None
        if agentcore_metrics is not None:
            usage = {
                agent_id: {
                    "cpu_hours": float(m.get("cpu_hours", 0) or 0),
                    "mem_hours": float(m.get("mem_hours", 0) or 0),
                }
                for agent_id, m in agentcore_metrics.items()
            }
            for agent_id, m in agentcore_metrics.items():
                if agent_id not in by_agent:
                    by_agent[agent_id] = AgentCostAttribution(agent_id=agent_id, agent_name=agent_id)
                by_agent[agent_id].invocations = m.get("invocations", 0)
        else:
            try:
                cw_start = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
                cw_end = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
                usage = self._fetch_agentcore_usage_hours(cw_start, cw_end)
            except (ClientError, BotoCoreError, KeyError, ValueError) as e:
                logger.warning("AgentCore usage hours unavailable: %s", e)
                compute_note = (
                    "AgentCore compute unavailable (CloudWatch AWS/Bedrock-AgentCore "
                    "usage metrics unreachable) — compute cost shown as $0."
                )

        if usage:
            try:
                service_spend = self._fetch_agentcore_service_spend(start, end)
            except (ClientError, BotoCoreError, KeyError, ValueError) as e:
                logger.warning("AgentCore service-line spend unavailable: %s", e)
                service_spend = 0.0
            compute_by_agent, compute_basis = self._allocate_agentcore_compute(usage, service_spend)
            compute_note = self._agentcore_compute_note(compute_by_agent, compute_basis)
            for agent_id, cost in compute_by_agent.items():
                if agent_id not in by_agent:
                    by_agent[agent_id] = AgentCostAttribution(agent_id=agent_id, agent_name=agent_id)
                by_agent[agent_id].compute_cost = round(cost, 4)

        for a in by_agent.values():
            a.bedrock_cost = round(a.bedrock_cost, 2)
            a.total_cost = round(a.bedrock_cost + a.compute_cost, 2)
            if a.invocations > 0:
                a.cost_per_invocation = round(a.total_cost / a.invocations, 4)

        agents = sorted(by_agent.values(), key=lambda x: x.total_cost, reverse=True)
        total_bedrock = round(sum(a.bedrock_cost for a in agents), 2)
        total_compute = round(sum(a.compute_cost for a in agents), 4)

        notes = []
        if total_bedrock == 0:
            notes.append(
                "No Bedrock spend tagged with 'agent' in this window, so the Bedrock "
                "column is $0 — tag Bedrock resources with the agent name for per-agent "
                "token attribution"
            )
        if compute_note:
            notes.append(compute_note)

        source = "cost-explorer"
        if compute_basis == "allocated":
            source = "cost-explorer+cloudwatch-agentcore"
        elif compute_basis == "rate-estimate":
            source = "cost-explorer+cloudwatch-agentcore-estimate"

        return AgentCostResponse(
            by_agent=agents,
            total_bedrock=total_bedrock,
            total_compute=total_compute,
            total=round(total_bedrock + total_compute, 2),
            period_start=start, period_end=end,
            live=len(agents) > 0,
            source=source,
            note=". ".join(notes) if notes else None,
        )

    def get_commitment_coverage(self, months: int = 1) -> CommitmentCoverage:
        """Savings Plans + RI coverage for commitment planning."""
        today = datetime.now(timezone.utc).date()
        start = (today.replace(day=1)).isoformat()
        end = today.isoformat()

        sp_coverage = None
        ri_coverage = None

        try:
            sp_resp = self._ce().get_savings_plans_coverage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
            )
            coverages = sp_resp.get("SavingsPlansCoverages", [])
            if coverages:
                cov = coverages[0].get("Coverage", {})
                attrs = cov.get("CoveragePercentage", "0") or "0"
                sp_covered = float(cov.get("SpendCoveredBySavingsPlans", 0) or 0)
                on_demand = float(cov.get("OnDemandCost", 0) or 0)
                sp_coverage = SavingsPlanCoverage(
                    coverage_pct=round(float(attrs), 1),
                    sp_covered_cost=round(sp_covered, 2),
                    on_demand_cost=round(on_demand, 2),
                    total_cost=round(sp_covered + on_demand, 2),
                )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Savings Plans coverage unavailable: %s", e)

        try:
            ri_resp = self._ce().get_reservation_utilization(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
            )
            utils = ri_resp.get("UtilizationsByTime", [])
            if utils:
                total = utils[0].get("Total", {})
                pct = float(total.get("UtilizationPercentage", 0) or 0)
                used = float(total.get("TotalActualHours", 0) or 0)
                avail = float(total.get("TotalAmortizedHours", 0) or 0)
                ri_coverage = RICoverage(
                    utilization_pct=round(pct, 1),
                    used_hours=round(used, 2),
                    total_hours=round(avail, 2),
                )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("RI utilization unavailable: %s", e)

        live = sp_coverage is not None or ri_coverage is not None
        return CommitmentCoverage(
            savings_plans=sp_coverage,
            reserved_instances=ri_coverage,
            period_start=start, period_end=end,
            live=live, source="cost-explorer" if live else "unavailable-fallback",
            note=None if live else "Savings Plans/RI coverage unavailable — needs ce:GetSavingsPlansCoverage and ce:GetReservationUtilization.",
        )

    # ─── Additional Cost Explorer APIs ───

    def get_usage_breakdown(self, months: int = 1) -> UsageBreakdown:
        """Detailed usage with quantities from Cost Explorer."""
        start, end = self._default_window(months)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost", "UsageQuantity"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
            )
            items: list[UsageDetail] = []
            total = 0.0
            for period in resp.get("ResultsByTime", []):
                for grp in period.get("Groups", []):
                    usage_type = grp["Keys"][0]
                    cost = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                    usage = float(grp["Metrics"]["UsageQuantity"]["Amount"])
                    if cost < 0.01:
                        continue
                    region = usage_type.split("-")[0] if "-" in usage_type else "global"
                    items.append(UsageDetail(
                        usage_type=usage_type,
                        region=region,
                        cost=round(cost, 2),
                        usage_quantity=round(usage, 2),
                    ))
                    total += cost
            items.sort(key=lambda x: x.cost, reverse=True)
            return UsageBreakdown(
                by_usage=items[:30],
                total_cost=round(total, 2),
                period_start=start, period_end=end,
                live=True, source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Usage breakdown unavailable: %s", e)
            return UsageBreakdown(by_usage=[], period_start=start, period_end=end,
                                  live=False, source="unavailable-fallback",
                                  note="Cost Explorer unreachable.")

    def get_anomaly_monitors(self) -> AnomalyMonitorsResponse:
        """List configured cost anomaly monitors."""
        try:
            resp = self._ce().get_anomaly_monitors()
            monitors = [
                AnomalyMonitor(
                    monitor_arn=mask_account_id(m.get("MonitorArn", "")),
                    monitor_name=m.get("MonitorName", ""),
                    monitor_type=m.get("MonitorType", ""),
                    monitor_dimension=m.get("MonitorDimension"),
                    creation_date=m.get("CreationDate"),
                )
                for m in resp.get("AnomalyMonitors", [])
            ]
            return AnomalyMonitorsResponse(
                monitors=monitors,
                total=len(monitors),
                live=True, source="cost-explorer",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Anomaly monitors unavailable: %s", e)
            return AnomalyMonitorsResponse(monitors=[], live=False, source="unavailable-fallback",
                                           note="ce:GetAnomalyMonitors not granted.")

    def get_service_quotas(self, service_code: str = "bedrock") -> ServiceQuotasResponse:
        """Service quotas for Bedrock or other AI services (10 min cache)."""
        key = f"service_quotas:{service_code}:{self.region}"
        result, cached_at = get_or_load(
            key, 600,  # 10 min TTL - quotas rarely change
            lambda: self._fetch_service_quotas(service_code),
            should_cache=lambda r: r.live,
        )
        return result

    def _fetch_service_quotas(self, service_code: str = "bedrock") -> ServiceQuotasResponse:
        """Fetch service quotas from AWS Service Quotas API."""
        try:
            sq = boto3.client("service-quotas", region_name=self.govern_region)
            paginator = sq.get_paginator("list_service_quotas")
            quotas: list[ServiceQuota] = []
            for page in paginator.paginate(ServiceCode=service_code):
                for q in page.get("Quotas", []):
                    usage_metric = q.get("UsageMetric", {})
                    quotas.append(ServiceQuota(
                        quota_code=q.get("QuotaCode", ""),
                        quota_name=q.get("QuotaName", ""),
                        value=float(q.get("Value", 0)),
                        unit=q.get("Unit"),
                        adjustable=bool(q.get("Adjustable")),
                        global_quota=bool(q.get("GlobalQuota")),
                        usage_metric_namespace=usage_metric.get("MetricNamespace"),
                        usage_metric_name=usage_metric.get("MetricName"),
                    ))

            adjustable = sum(1 for q in quotas if q.adjustable)
            service_name = "Amazon Bedrock" if service_code == "bedrock" else service_code

            return ServiceQuotasResponse(
                service_code=service_code,
                service_name=service_name,
                quotas=quotas[:100],
                total_quotas=len(quotas),
                adjustable_quotas=adjustable,
                live=True, source="service-quotas",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Service quotas unavailable for %s: %s", service_code, e)
            return ServiceQuotasResponse(
                service_code=service_code, service_name=service_code,
                quotas=[], live=False, source="unavailable-fallback",
                note=f"service-quotas:ListServiceQuotas for {service_code} not available.",
            )

    # Important Bedrock quota codes to fetch for lite view (actual codes from account)
    _BEDROCK_KEY_QUOTAS = [
        "L-0AD9BBE8",  # Cross-region model inference tokens per minute for Claude Opus 4.6
        "L-CB5B847D",  # Global cross-region requests per minute for Claude Sonnet 4.6
        "L-186C5310",  # Cross-region requests per minute for Claude Haiku 4.5
        "L-2767B9A9",  # Records per batch inference job for Claude Opus 4.5
        "L-5B274E24",  # On-demand model inference requests per minute for Mistral Large 3
    ]

    def get_service_quotas_lite(self, service_code: str = "bedrock") -> ServiceQuotasResponse:
        """Fast service quotas - just the key quotas without pagination (sub-second)."""
        key = f"service_quotas_lite:{service_code}:{self.region}"
        result, cached_at = get_or_load(
            key, 300,
            lambda: self._fetch_service_quotas_lite(service_code),
            should_cache=lambda r: r.live,
        )
        return result

    def _fetch_service_quotas_lite(self, service_code: str = "bedrock") -> ServiceQuotasResponse:
        """Fetch only key quotas by code - much faster than full pagination."""
        try:
            sq = boto3.client("service-quotas", region_name=self.govern_region)
            quotas: list[ServiceQuota] = []

            # Get specific important quotas by code
            for quota_code in self._BEDROCK_KEY_QUOTAS:
                try:
                    resp = sq.get_service_quota(ServiceCode=service_code, QuotaCode=quota_code)
                    q = resp.get("Quota", {})
                    if q:
                        usage_metric = q.get("UsageMetric", {})
                        quotas.append(ServiceQuota(
                            quota_code=q.get("QuotaCode", ""),
                            quota_name=q.get("QuotaName", ""),
                            value=float(q.get("Value", 0)),
                            unit=q.get("Unit"),
                            adjustable=bool(q.get("Adjustable")),
                            global_quota=bool(q.get("GlobalQuota")),
                            usage_metric_namespace=usage_metric.get("MetricNamespace"),
                            usage_metric_name=usage_metric.get("MetricName"),
                        ))
                except (ClientError, BotoCoreError):
                    pass  # Quota not found or not applicable

            service_name = "Amazon Bedrock" if service_code == "bedrock" else service_code
            return ServiceQuotasResponse(
                service_code=service_code,
                service_name=service_name,
                quotas=quotas,
                total_quotas=len(quotas),
                adjustable_quotas=sum(1 for q in quotas if q.adjustable),
                live=True, source="service-quotas-lite",
                note="Top quotas only - use /service-quotas for full list.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Service quotas lite unavailable for %s: %s", service_code, e)
            return ServiceQuotasResponse(
                service_code=service_code, service_name=service_code,
                quotas=[], live=False, source="unavailable-fallback",
                note=f"service-quotas for {service_code} not available.",
            )

    def get_agentcore_costs(self, days: int = 30) -> AgentCostResponse:
        """Cached wrapper around AgentCore costs fetch (5 min TTL)."""
        key = f"cost:agentcore:{self.govern_region}:{days}"
        result, cached_at = get_or_load(
            key, 300, lambda: self._fetch_agentcore_costs(days),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_agentcore_costs(self, days: int = 30) -> AgentCostResponse:
        """Per-agent cost attribution from CloudWatch AgentCore metrics + cost allocation tags.

        Combines multiple data sources IN PARALLEL:
        1. CloudWatch AWS/Bedrock-AgentCore: invocations per agent runtime (batch via get_metric_data)
        2. Cost Explorer Bedrock total: for proportional attribution
        3. CloudWatch AWS/Bedrock-AgentCore: measured vCPU-hours / GB-hours per runtime
        4. Cost Explorer 'Amazon Bedrock AgentCore' service line: the real compute bill,
           allocated across (3) pro-rata. (1)-(2) cover token spend, (3)-(4) cover compute;
           the two Cost Explorer service lines are disjoint, so nothing is double counted.
        All fetched concurrently via ThreadPoolExecutor.
        """
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        start_str = start.strftime("%Y-%m-%d")
        end_str = end.strftime("%Y-%m-%d")

        try:
            cw = boto3.client("cloudwatch", region_name=self.govern_region)

            def fetch_cloudwatch_metrics():
                """Fetch all agent invocations via batch get_metric_data."""
                resp = cw.list_metrics(
                    Namespace="AWS/Bedrock-AgentCore",
                    MetricName="Invocations",
                    Dimensions=[{"Name": "Operation", "Value": "InvokeAgentRuntime"}],
                )
                metric_queries = []
                agent_id_map = {}
                for i, m in enumerate(resp.get("Metrics", [])):
                    dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                    name_dim = dims.get("Name", "")
                    if not name_dim or "::" not in name_dim:
                        continue
                    agent_name = _agentcore_agent_id(name_dim)
                    query_id = f"m{i}"
                    agent_id_map[query_id] = agent_name
                    metric_queries.append({
                        "Id": query_id,
                        "MetricStat": {
                            "Metric": {
                                "Namespace": "AWS/Bedrock-AgentCore",
                                "MetricName": "Invocations",
                                "Dimensions": m.get("Dimensions", []),
                            },
                            "Period": 86400 * days,
                            "Stat": "Sum",
                        },
                    })
                agent_data: dict[str, dict] = {}
                if metric_queries:
                    for batch_start in range(0, len(metric_queries), 500):
                        batch = metric_queries[batch_start:batch_start + 500]
                        data_resp = cw.get_metric_data(
                            MetricDataQueries=batch,
                            StartTime=start,
                            EndTime=end,
                        )
                        for result in data_resp.get("MetricDataResults", []):
                            query_id = result["Id"]
                            agent_name = agent_id_map.get(query_id)
                            if not agent_name:
                                continue
                            values = result.get("Values", [])
                            invocations = int(sum(values)) if values else 0
                            if agent_name not in agent_data:
                                agent_data[agent_name] = _new_agent_row()
                            agent_data[agent_name]["invocations"] += invocations
                return agent_data

            def fetch_agentcore_usage():
                """Measured vCPU-hours / GB-hours per runtime over the SAME window."""
                try:
                    return self._fetch_agentcore_usage_hours(start, end)
                except (ClientError, BotoCoreError, KeyError, ValueError) as e:
                    logger.warning("AgentCore usage hours unavailable: %s", e)
                    return None

            def fetch_agentcore_service_cost():
                """Real 'Amazon Bedrock AgentCore' Cost Explorer service line."""
                try:
                    return self._fetch_agentcore_service_spend(start_str, end_str)
                except (ClientError, BotoCoreError, KeyError, ValueError) as e:
                    logger.warning("AgentCore service-line spend unavailable: %s", e)
                    return 0.0

            def fetch_bedrock_cost():
                """Fetch total Bedrock cost from Cost Explorer."""
                cost_resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": start_str, "End": end_str},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
                )
                return sum(
                    float(p["Total"]["UnblendedCost"]["Amount"])
                    for p in cost_resp.get("ResultsByTime", [])
                )

            # Execute CloudWatch and Cost Explorer calls in parallel
            with ThreadPoolExecutor(max_workers=4) as executor:
                cw_future = executor.submit(fetch_cloudwatch_metrics)
                ce_future = executor.submit(fetch_bedrock_cost)
                usage_future = executor.submit(fetch_agentcore_usage)
                compute_ce_future = executor.submit(fetch_agentcore_service_cost)
                agent_data = cw_future.result()
                total_bedrock = ce_future.result()
                usage = usage_future.result()
                agentcore_service_spend = compute_ce_future.result()

            # Tag-based attribution skipped for now (tags need 24h to propagate to Cost Explorer)
            tagged_spend: dict[str, float] = {}
            tag_source_used = None

            total_inv = sum(a["invocations"] for a in agent_data.values())
            cost_per_inv = total_bedrock / total_inv if total_inv > 0 else 0

            # Merge tagged costs into agent_data
            tagged_total = sum(tagged_spend.values())
            for tag_value, cost in tagged_spend.items():
                agent_key = tag_value.replace("_", "-").lower()
                for agent_name in agent_data:
                    if agent_key in agent_name.lower() or agent_name.lower() in agent_key:
                        agent_data[agent_name]["tagged_cost"] = cost
                        break
                else:
                    if tag_value not in agent_data:
                        agent_data[tag_value] = {**_new_agent_row(), "tagged_cost": cost}

            # ─── Compute cost ───
            # Join the measured CloudWatch usage onto the invocation rows on the SAME
            # AWS/Bedrock-AgentCore `Name` key both metric families carry (truncated at
            # '::'), then split the real Cost Explorer AgentCore service line across it.
            # The old code read data["cpu_hours"]/["mem_hours"], which no writer ever
            # set, so compute_cost was arithmetically pinned to 0.0.
            usage_unavailable = usage is None
            for agent_name, u in (usage or {}).items():
                row = agent_data.setdefault(agent_name, _new_agent_row())
                row["cpu_hours"] = u.get("cpu_hours", 0.0)
                row["mem_hours"] = u.get("mem_hours", 0.0)

            compute_by_agent, compute_basis = self._allocate_agentcore_compute(
                {n: d for n, d in agent_data.items() if d["cpu_hours"] or d["mem_hours"]},
                agentcore_service_spend,
            )

            agents: list[AgentCostAttribution] = []
            total_compute = 0.0
            for name, data in agent_data.items():
                inv = data["invocations"]
                tagged_cost = data.get("tagged_cost", 0.0)

                if tagged_cost > 0:
                    bedrock_cost = tagged_cost
                    cost_source = "tagged"
                else:
                    bedrock_cost = inv * cost_per_inv
                    cost_source = "proportional"

                compute_cost = compute_by_agent.get(name, 0.0)
                total_cost = compute_cost + bedrock_cost
                total_compute += compute_cost

                agents.append(AgentCostAttribution(
                    agent_id=name,
                    agent_name=name,
                    bedrock_cost=round(bedrock_cost, 2),
                    compute_cost=round(compute_cost, 4),
                    total_cost=round(total_cost, 2),
                    invocations=inv,
                    cost_per_invocation=round(total_cost / inv, 4) if inv > 0 else 0,
                    cost_allocation_tag=tag_source_used if tagged_cost > 0 else None,
                ))

            agents.sort(key=lambda x: x.total_cost, reverse=True)

            note_parts = []
            if tagged_total > 0:
                note_parts.append(f"${tagged_total:.2f} attributed via {tag_source_used} tag")
            if total_inv > 0:
                untagged = total_bedrock - tagged_total
                if untagged > 0:
                    note_parts.append(f"${untagged:.2f} proportionally allocated ({total_inv} invocations, ${cost_per_inv:.4f}/inv)")
            else:
                note_parts.append("No AgentCore invocations in this period")
            compute_note = self._agentcore_compute_note(compute_by_agent, compute_basis)
            if compute_note:
                note_parts.append(compute_note)
            elif usage_unavailable:
                note_parts.append(
                    "AgentCore compute unavailable (CloudWatch AWS/Bedrock-AgentCore "
                    "CPU/Memory usage metrics unreachable) — compute cost shown as $0"
                )
            else:
                note_parts.append(
                    "No AgentCore vCPU-hour/GB-hour usage measured in this period, "
                    "so no compute cost is attributed"
                )
            note = ". ".join(note_parts) if note_parts else "No AgentCore invocations in this period."

            source = "cloudwatch+cost-explorer"
            if compute_basis == "rate-estimate":
                source += "+compute-rate-estimate"
            if tag_source_used:
                source += f"+{tag_source_used}"

            return AgentCostResponse(
                by_agent=agents,
                total_bedrock=round(total_bedrock, 2),
                total_compute=round(total_compute, 4),
                total=round(total_bedrock + total_compute, 2),
                period_start=start_str,
                period_end=end_str,
                live=len(agents) > 0,
                source=source,
                note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AgentCore costs unavailable: %s", e)
            return AgentCostResponse(
                by_agent=[],
                period_start=start.strftime("%Y-%m-%d"),
                period_end=end.strftime("%Y-%m-%d"),
                live=False,
                source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore metrics not available.",
            )

    def get_bedrock_usage_metrics(self, days: int = 7) -> BedrockUsageResponse:
        """Bedrock usage metrics from CloudWatch (invocations, tokens, latency)."""
        try:
            cw = boto3.client("cloudwatch", region_name=self.govern_region)
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)

            resp = cw.list_metrics(Namespace="AWS/Bedrock", MetricName="Invocations")
            metrics_list = resp.get("Metrics", [])

            by_model: dict[str, BedrockUsageMetrics] = {}
            total_inv = 0
            total_in = 0
            total_out = 0

            for m in metrics_list:
                dims = m.get("Dimensions", [])
                model_id = next((d["Value"] for d in dims if d["Name"] == "ModelId"), None)
                if not model_id:
                    continue

                if model_id not in by_model:
                    by_model[model_id] = BedrockUsageMetrics(model_id=model_id)

                inv_resp = cw.get_metric_statistics(
                    Namespace="AWS/Bedrock",
                    MetricName="Invocations",
                    Dimensions=dims,
                    StartTime=start,
                    EndTime=end,
                    Period=86400 * days,
                    Statistics=["Sum"],
                )
                if inv_resp.get("Datapoints"):
                    val = int(inv_resp["Datapoints"][0].get("Sum", 0))
                    by_model[model_id].invocations += val
                    total_inv += val

            for metric_name, field, total_ref in [
                ("InputTokenCount", "input_tokens", "total_in"),
                ("OutputTokenCount", "output_tokens", "total_out"),
            ]:
                resp = cw.list_metrics(Namespace="AWS/Bedrock", MetricName=metric_name)
                for m in resp.get("Metrics", []):
                    dims = m.get("Dimensions", [])
                    model_id = next((d["Value"] for d in dims if d["Name"] == "ModelId"), None)
                    if not model_id or model_id not in by_model:
                        continue
                    stat_resp = cw.get_metric_statistics(
                        Namespace="AWS/Bedrock",
                        MetricName=metric_name,
                        Dimensions=dims,
                        StartTime=start,
                        EndTime=end,
                        Period=86400 * days,
                        Statistics=["Sum"],
                    )
                    if stat_resp.get("Datapoints"):
                        val = int(stat_resp["Datapoints"][0].get("Sum", 0))
                        setattr(by_model[model_id], field, val)
                        if field == "input_tokens":
                            total_in += val
                        else:
                            total_out += val

            models = sorted(by_model.values(), key=lambda x: x.invocations, reverse=True)
            return BedrockUsageResponse(
                by_model=models[:20],
                total_invocations=total_inv,
                total_input_tokens=total_in,
                total_output_tokens=total_out,
                window_days=days,
                live=True, source="cloudwatch",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Bedrock usage metrics unavailable: %s", e)
            return BedrockUsageResponse(
                by_model=[], window_days=days,
                live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock metrics not available.",
            )

    def get_agent_forecast(self, lookback_days: int = 30, forecast_months: int = 3) -> AgentForecastResponse:
        """Cached wrapper around agent forecast fetch (5 min TTL)."""
        key = f"cost:agent-forecast:{self.govern_region}:{lookback_days}:{forecast_months}"
        result, cached_at = get_or_load(
            key, 300, lambda: self._fetch_agent_forecast(lookback_days, forecast_months),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_agent_forecast(self, lookback_days: int = 30, forecast_months: int = 3) -> AgentForecastResponse:
        """Per-agent cost forecast using historical CloudWatch metrics + trend extrapolation.

        Builds forecast by:
        1. Getting weekly invocation history from AWS/Bedrock-AgentCore (batch via get_metric_data)
        2. Computing week-over-week trend (linear regression)
        3. Extrapolating invocations forward by forecast_months
        4. Applying current cost-per-invocation to get predicted spend
        """
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=lookback_days)
        start_str = start.strftime("%Y-%m-%d")
        end_str = end.strftime("%Y-%m-%d")

        try:
            cw = boto3.client("cloudwatch", region_name=self.govern_region)

            resp = cw.list_metrics(
                Namespace="AWS/Bedrock-AgentCore",
                MetricName="Invocations",
                Dimensions=[{"Name": "Operation", "Value": "InvokeAgentRuntime"}],
            )

            # Build batch query for weekly data
            metric_queries = []
            agent_id_map = {}
            for i, m in enumerate(resp.get("Metrics", [])):
                dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                name_dim = dims.get("Name", "")
                if not name_dim or "::" not in name_dim:
                    continue
                agent_name = name_dim.split("::")[0]
                query_id = f"m{i}"
                agent_id_map[query_id] = agent_name
                metric_queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/Bedrock-AgentCore",
                            "MetricName": "Invocations",
                            "Dimensions": m.get("Dimensions", []),
                        },
                        "Period": 604800,  # Weekly
                        "Stat": "Sum",
                    },
                })

            agent_history: dict[str, list[dict]] = {}
            if metric_queries:
                for batch_start in range(0, len(metric_queries), 500):
                    batch = metric_queries[batch_start:batch_start + 500]
                    data_resp = cw.get_metric_data(
                        MetricDataQueries=batch,
                        StartTime=start,
                        EndTime=end,
                    )
                    for result in data_resp.get("MetricDataResults", []):
                        query_id = result["Id"]
                        agent_name = agent_id_map.get(query_id)
                        if not agent_name:
                            continue
                        timestamps = result.get("Timestamps", [])
                        values = result.get("Values", [])
                        if agent_name not in agent_history:
                            agent_history[agent_name] = []
                        for ts, val in sorted(zip(timestamps, values), key=lambda x: x[0]):
                            agent_history[agent_name].append({
                                "week": ts,
                                "invocations": int(val),
                            })

            cost_resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start_str, "End": end_str},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service"]}},
            )
            total_bedrock = sum(
                float(p["Total"]["UnblendedCost"]["Amount"])
                for p in cost_resp.get("ResultsByTime", [])
            )

            total_inv = sum(sum(w["invocations"] for w in weeks) for weeks in agent_history.values())
            global_cost_per_inv = total_bedrock / total_inv if total_inv > 0 else 0

            forecasts: list[AgentForecast] = []
            total_historical = 0.0
            total_forecast = 0.0

            for agent_name, weeks in agent_history.items():
                hist_inv = sum(w["invocations"] for w in weeks)
                hist_cost = hist_inv * global_cost_per_inv
                total_historical += hist_cost

                if len(weeks) >= 2:
                    x = list(range(len(weeks)))
                    y = [w["invocations"] for w in weeks]
                    n = len(x)
                    sum_x = sum(x)
                    sum_y = sum(y)
                    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
                    sum_x2 = sum(xi * xi for xi in x)
                    denom = n * sum_x2 - sum_x * sum_x
                    if denom != 0:
                        slope = (n * sum_xy - sum_x * sum_y) / denom
                        intercept = (sum_y - slope * sum_x) / n
                    else:
                        slope = 0
                        intercept = sum_y / n if n > 0 else 0

                    avg_weekly = sum_y / n if n > 0 else 0
                    trend_pct = (slope / avg_weekly * 100) if avg_weekly > 0 else 0
                    if trend_pct > 10:
                        trend = "growing"
                    elif trend_pct < -10:
                        trend = "declining"
                    else:
                        trend = "stable"
                else:
                    avg_weekly = weeks[0]["invocations"] if weeks else 0
                    slope = 0
                    intercept = avg_weekly
                    trend = "stable"
                    trend_pct = 0

                forecast_points: list[AgentForecastPoint] = []
                forecast_inv_total = 0
                forecast_cost_total = 0.0

                base_week = len(weeks)
                for month_offset in range(forecast_months):
                    month_start = (end + timedelta(days=month_offset * 30)).replace(day=1)
                    weeks_in_month = 4

                    month_inv = 0
                    for w in range(weeks_in_month):
                        week_idx = base_week + (month_offset * 4) + w
                        predicted = max(0, int(intercept + slope * week_idx))
                        month_inv += predicted

                    month_cost = month_inv * global_cost_per_inv
                    variance = 0.2 if trend == "stable" else 0.3

                    forecast_points.append(AgentForecastPoint(
                        month=month_start.strftime("%Y-%m-%d"),
                        predicted_invocations=month_inv,
                        predicted_cost=round(month_cost, 2),
                        confidence_low=round(month_cost * (1 - variance), 2),
                        confidence_high=round(month_cost * (1 + variance), 2),
                    ))
                    forecast_inv_total += month_inv
                    forecast_cost_total += month_cost

                total_forecast += forecast_cost_total

                forecasts.append(AgentForecast(
                    agent_id=agent_name,
                    agent_name=agent_name,
                    historical_invocations=hist_inv,
                    historical_cost=round(hist_cost, 2),
                    avg_cost_per_invocation=round(global_cost_per_inv, 4),
                    trend=trend,
                    trend_pct=round(trend_pct, 1),
                    forecast=forecast_points,
                    forecast_total_invocations=forecast_inv_total,
                    forecast_total_cost=round(forecast_cost_total, 2),
                ))

            forecasts.sort(key=lambda x: x.forecast_total_cost, reverse=True)

            return AgentForecastResponse(
                by_agent=forecasts,
                total_historical_cost=round(total_historical, 2),
                total_forecast_cost=round(total_forecast, 2),
                forecast_months=forecast_months,
                lookback_days=lookback_days,
                period_start=start_str,
                period_end=end_str,
                live=len(forecasts) > 0,
                source="cloudwatch+cost-explorer+linear-regression",
                note=f"Forecast based on {lookback_days}-day history, {total_inv} invocations, ${global_cost_per_inv:.4f}/inv avg." if forecasts else "No AgentCore history for forecasting.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Agent forecast unavailable: %s", e)
            return AgentForecastResponse(
                by_agent=[],
                forecast_months=forecast_months,
                lookback_days=lookback_days,
                period_start=start.strftime("%Y-%m-%d"),
                period_end=end.strftime("%Y-%m-%d"),
                live=False,
                source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore metrics not available for forecasting.",
            )

    # ─── Cost Comparison Drivers ───

    def get_cost_comparison(self, base_months_ago: int = 1) -> CostComparisonResponse:
        """Get cost comparison drivers between current and previous period.

        Uses CE GetCostAndUsage with GroupBy to identify what drove cost changes.
        Compares current month-to-date vs same period last month (or base_months_ago).
        """
        cache_key = f"cost_comparison_{base_months_ago}"
        result, cached_at = get_or_load(
            cache_key,
            300,
            lambda: self._fetch_cost_comparison(base_months_ago),
            # Only a measured comparison is cached. _fetch_cost_comparison catches a CE
            # failure and returns live=False with an empty driver list; caching that
            # would pin the card to "no drivers" for the whole TTL even after CE
            # recovers, with no request able to refresh it. A measured empty result
            # (live=True, nothing changed) is still cached.
            should_cache=lambda r: r.live,
        )
        return result

    def _fetch_cost_comparison(self, base_months_ago: int = 1) -> CostComparisonResponse:
        try:
            today = datetime.now(timezone.utc).date()
            day_of_month = today.day

            # Comparison period: same day range in previous month
            comp_end = today
            comp_start = today.replace(day=1)

            # Base period: same day range N months ago
            base_end_month = (today.replace(day=1) - timedelta(days=base_months_ago * 28)).replace(day=1)
            base_start = base_end_month
            # Clamp the day to the base month's length — replace(day=day_of_month) would
            # raise ValueError on month-end days when the base month is shorter (e.g.
            # comparing the 31st against a 30-day or February base month).
            base_month_last_day = ((base_end_month.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).day
            base_end = base_end_month.replace(day=min(day_of_month, base_month_last_day))

            base_start_str = base_start.strftime("%Y-%m-%d")
            base_end_str = (base_end + timedelta(days=1)).strftime("%Y-%m-%d")
            comp_start_str = comp_start.strftime("%Y-%m-%d")
            comp_end_str = (comp_end + timedelta(days=1)).strftime("%Y-%m-%d")

            drivers: list[CostComparisonDriver] = []
            # Full SERVICE-partition totals (every service, including unchanged ones) —
            # the base/comparison denominators must not be limited to the filtered
            # drivers below, or total_difference_pct is overstated.
            service_base_total = 0.0
            service_comp_total = 0.0

            # Fetch both periods grouped by SERVICE
            for group_dim in ["SERVICE", "REGION", "USAGE_TYPE"]:
                base_resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": base_start_str, "End": base_end_str},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    GroupBy=[{"Type": "DIMENSION", "Key": group_dim}],
                )
                comp_resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": comp_start_str, "End": comp_end_str},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    GroupBy=[{"Type": "DIMENSION", "Key": group_dim}],
                )

                base_by_key: dict[str, float] = {}
                comp_by_key: dict[str, float] = {}

                for period in base_resp.get("ResultsByTime", []):
                    for grp in period.get("Groups", []):
                        key = grp["Keys"][0]
                        amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                        base_by_key[key] = base_by_key.get(key, 0) + amt

                for period in comp_resp.get("ResultsByTime", []):
                    for grp in period.get("Groups", []):
                        key = grp["Keys"][0]
                        amt = float(grp["Metrics"]["UnblendedCost"]["Amount"])
                        comp_by_key[key] = comp_by_key.get(key, 0) + amt

                # Capture the full partition totals before the abs(diff) driver filter.
                if group_dim == "SERVICE":
                    service_base_total = sum(base_by_key.values())
                    service_comp_total = sum(comp_by_key.values())

                all_keys = set(base_by_key.keys()) | set(comp_by_key.keys())
                for key in all_keys:
                    base_cost = base_by_key.get(key, 0)
                    comp_cost = comp_by_key.get(key, 0)
                    diff = comp_cost - base_cost
                    if abs(diff) < 0.01:
                        continue
                    pct_diff = (diff / base_cost * 100) if base_cost > 0 else (100 if comp_cost > 0 else 0)

                    drivers.append(CostComparisonDriver(
                        driver_type=group_dim,
                        driver_value=key,
                        base_cost=round(base_cost, 2),
                        comparison_cost=round(comp_cost, 2),
                        absolute_difference=round(diff, 2),
                        percentage_difference=round(pct_diff, 1),
                        contribution_pct=0,  # calculated below, against GROSS movement
                        # A line item that appeared or vanished is a different event from
                        # one that merely moved, and it is the pair of them that explains
                        # a change. Thresholded at a cent so rounding noise is not read as
                        # a service starting or stopping.
                        change_kind=(
                            "new" if base_cost < 0.01 and comp_cost >= 0.01
                            else "stopped" if comp_cost < 0.01 and base_cost >= 0.01
                            else "increase" if diff > 0
                            else "decrease"
                        ),
                    ))

            # Calculate totals and contribution percentages. Use the full SERVICE
            # partition totals (all services) as the base/comparison denominators so
            # unchanged services are included and contribution_pct is measured against
            # the true net change rather than the filtered-driver subtotal.
            base_total = service_base_total
            comp_total = service_comp_total
            total_diff = comp_total - base_total

            # Gross movement, computed over the SERVICE partition only. The drivers list
            # deliberately mixes SERVICE, REGION and USAGE_TYPE groupings of the SAME
            # dollars, so summing across all of them would trebly count every change.
            svc = [d for d in drivers if d.driver_type == "SERVICE"]
            gross_increase = sum(d.absolute_difference for d in svc if d.absolute_difference > 0)
            gross_decrease = sum(d.absolute_difference for d in svc if d.absolute_difference < 0)

            # Share of GROSS movement, not of the net change.
            #
            # Dividing by the net produced values over 100% - up to 1817% on this
            # account - whenever increases and decreases offset: a $672 mover in a month
            # whose NET change is $37 came out as "1817% of the change". Net is simply the
            # wrong denominator for a share. Gross movement is what the driver is a share
            # OF, and it also makes the offsetting visible instead of hiding it.
            # Contribution is computed WITHIN each driver_type partition.
            #
            # SERVICE, REGION and USAGE_TYPE are three groupings of the SAME dollars at
            # different granularities, so a share has to be of its own partition's gross.
            # Dividing every driver by the SERVICE gross left a REGION driver of $672 over
            # a service gross of $254 reading 264% - the same over-100% nonsense, just
            # with a different wrong denominator.
            by_type_gross: dict[str, float] = {}
            for d in drivers:
                by_type_gross[d.driver_type] = by_type_gross.get(d.driver_type, 0.0) + abs(d.absolute_difference)
            for d in drivers:
                g = by_type_gross.get(d.driver_type, 0.0)
                d.contribution_pct = round((abs(d.absolute_difference) / g) * 100, 1) if g > 0 else 0.0

            # Sort by absolute impact, but keep every `new` and `stopped` row ahead of
            # ordinary movers of the same size. Those two kinds are what explain a change
            # (something started, something else ended), and a flat top-50 by magnitude
            # was dropping them: the response reported stopped_count=2 while the truncated
            # list contained none of them, so a reader could not see what the count meant.
            _KIND_RANK = {"new": 0, "stopped": 0, "increase": 1, "decrease": 1}
            drivers.sort(key=lambda x: (_KIND_RANK.get(x.change_kind, 1), -abs(x.absolute_difference)))

            return CostComparisonResponse(
                drivers=drivers[:50],  # Top 50 drivers
                base_period_start=base_start_str,
                base_period_end=base_end.strftime("%Y-%m-%d"),
                comparison_period_start=comp_start_str,
                comparison_period_end=comp_end.strftime("%Y-%m-%d"),
                base_total=round(base_total, 2),
                comparison_total=round(comp_total, 2),
                total_difference=round(total_diff, 2),
                total_difference_pct=round((total_diff / base_total * 100) if base_total > 0 else 0, 1),
                gross_increase=round(gross_increase, 2),
                gross_decrease=round(gross_decrease, 2),
                # Counts cover the SERVICE partition in full, including rows the top-50
                # truncation drops, so they are the true totals rather than a count of
                # what happens to be listed. The note says so; without that a reader
                # comparing the count to the visible rows finds them inconsistent.
                increase_count=sum(1 for d in svc if d.change_kind == "increase"),
                decrease_count=sum(1 for d in svc if d.change_kind == "decrease"),
                new_count=sum(1 for d in svc if d.change_kind == "new"),
                stopped_count=sum(1 for d in svc if d.change_kind == "stopped"),
                live=True,
                source="cost-explorer",
                note=(
                    f"Comparing {comp_start_str} to {comp_end.strftime('%Y-%m-%d')} vs the same "
                    f"day range {base_months_ago} month(s) earlier, so the two periods cover an "
                    f"equal number of days. Counts describe every service-level change; the "
                    f"driver list is capped at 50 rows, newly-started and stopped items first. "
                    f"contribution_pct is a share of gross movement within each driver_type, "
                    f"not of the net change."
                ),
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost comparison unavailable: %s", e)
            today = datetime.now(timezone.utc).date()
            return CostComparisonResponse(
                drivers=[],
                base_period_start=today.strftime("%Y-%m-%d"),
                base_period_end=today.strftime("%Y-%m-%d"),
                comparison_period_start=today.strftime("%Y-%m-%d"),
                comparison_period_end=today.strftime("%Y-%m-%d"),
                live=False,
                source="unavailable-fallback",
                note="ce:GetCostAndUsage not available for cost comparison.",
            )

    # ─── Rightsizing Recommendations ───

    def get_rightsizing_recommendations(
        self, service: str = "AmazonEC2", lookback: str = "FOURTEEN_DAYS"
    ) -> RightsizingResponse:
        """Get rightsizing recommendations from Cost Explorer.

        Uses ce:GetRightsizingRecommendation to find under/overutilized instances.
        """
        cache_key = f"rightsizing_{service}_{lookback}"
        result, cached_at = get_or_load(
            cache_key,
            600,  # 10 min cache - recommendations don't change often
            lambda: self._fetch_rightsizing(service, lookback),
            # A CE failure returns live=False with no recommendations; without this
            # predicate that fallback was cached for the full 10 minutes, so one
            # transient error hid every recommendation until the TTL expired. A
            # measured "nothing to rightsize" (live=True, empty) still caches.
            should_cache=lambda r: r.live,
        )
        return result

    def _fetch_rightsizing(
        self, service: str = "AmazonEC2", lookback: str = "FOURTEEN_DAYS"
    ) -> RightsizingResponse:
        try:
            resp = self._ce().get_rightsizing_recommendation(
                Service=service,
                Configuration={
                    "RecommendationTarget": "SAME_INSTANCE_FAMILY",
                    "BenefitsConsidered": True,
                },
            )

            recommendations: list[RightsizingRecommendation] = []
            total_savings = 0.0

            for rec in resp.get("RightsizingRecommendations", []):
                current = rec.get("CurrentInstance", {})
                instance_id = current.get("ResourceId", "unknown")
                instance_type = current.get("InstanceType", "unknown")

                # Try to get instance name from tags
                instance_name = None
                for tag in current.get("Tags", []):
                    if tag.get("Key") == "Name":
                        instance_name = tag.get("Value")
                        break

                current_cost = float(current.get("MonthlyCost", "0") or "0")
                account_id = rec.get("AccountId", "unknown")
                rec_type = rec.get("RightsizingType", "Modify")
                finding = rec.get("FindingReasonCodes", [])
                finding_reason = finding[0] if finding else None

                target_obj = None
                modify_rec = rec.get("ModifyRecommendationDetail", {})
                target_options = modify_rec.get("TargetInstances", [])

                if target_options:
                    best = target_options[0]
                    est_savings = float(best.get("EstimatedMonthlySavings", "0") or "0")
                    est_cost = float(best.get("EstimatedMonthlyCost", "0") or "0")
                    target_obj = RightsizingTarget(
                        instance_type=best.get("InstanceType", "unknown"),
                        platform=best.get("PlatformDifferences", [None])[0] if best.get("PlatformDifferences") else None,
                        region=best.get("Region"),
                        estimated_monthly_cost=round(est_cost, 2),
                        estimated_monthly_savings=round(est_savings, 2),
                        estimated_savings_pct=round((est_savings / current_cost * 100) if current_cost > 0 else 0, 1),
                    )
                    total_savings += est_savings
                elif rec_type == "Terminate":
                    # Termination recommendation - full cost savings
                    target_obj = RightsizingTarget(
                        instance_type="terminate",
                        estimated_monthly_cost=0,
                        estimated_monthly_savings=round(current_cost, 2),
                        estimated_savings_pct=100,
                    )
                    total_savings += current_cost

                recommendations.append(RightsizingRecommendation(
                    account_id=account_id,
                    instance_id=instance_id,
                    instance_name=instance_name,
                    instance_type=instance_type,
                    recommendation_type=rec_type,
                    finding_reason=finding_reason,
                    current_monthly_cost=round(current_cost, 2),
                    target=target_obj,
                ))

            # Sort by potential savings
            recommendations.sort(
                key=lambda x: x.target.estimated_monthly_savings if x.target else 0,
                reverse=True,
            )

            return RightsizingResponse(
                recommendations=recommendations,
                total_recommendations=len(recommendations),
                total_estimated_savings=round(total_savings, 2),
                lookback_period=lookback,
                live=True,
                source="cost-explorer",
                note=f"{len(recommendations)} rightsizing recommendations found, ${total_savings:.2f}/mo potential savings." if recommendations else "No rightsizing recommendations - instances are right-sized.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Rightsizing recommendations unavailable: %s", e)
            return RightsizingResponse(
                recommendations=[],
                lookback_period=lookback,
                live=False,
                source="unavailable-fallback",
                note="ce:GetRightsizingRecommendation not available or no EC2 instances.",
            )

    # ─── Dashboard Summary (fast load) ───

    def get_dashboard_summary(self) -> FinOpsDashboardSummary:
        """Fast-loading dashboard summary - single parallel fetch of key metrics.

        Fetches MTD spend, budget health, and anomaly count in parallel for
        sub-second dashboard load. Detailed data loads lazily afterward.
        """
        key = f"dashboard_summary:{self.region}"
        result, cached_at = get_or_load(
            key, 120,  # 2 min TTL for dashboard
            lambda: self._fetch_dashboard_summary(),
            should_cache=lambda r: r.live,
        )
        # ttl_cache hands back the object it still holds, so assigning cached_at
        # would write through to the cache entry. model_copy swaps only this
        # top-level scalar, leaving the cache entry intact.
        return result.model_copy(
            update={"cached_at": datetime.fromtimestamp(cached_at, tz=timezone.utc).isoformat()}
        )

    def _fetch_dashboard_summary(self) -> FinOpsDashboardSummary:
        """Parallel fetch of dashboard summary metrics."""
        today = datetime.now(timezone.utc).date()
        mtd_start = today.replace(day=1)
        last_month_end = mtd_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)

        results = {}

        def fetch_mtd_spend():
            try:
                resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": mtd_start.strftime("%Y-%m-%d"), "End": (today + timedelta(days=1)).strftime("%Y-%m-%d")},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                )
                return sum(float(p["Total"]["UnblendedCost"]["Amount"]) for p in resp.get("ResultsByTime", []))
            except Exception:
                return 0.0

        def fetch_last_month_spend():
            try:
                resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": last_month_start.strftime("%Y-%m-%d"), "End": mtd_start.strftime("%Y-%m-%d")},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                )
                return sum(float(p["Total"]["UnblendedCost"]["Amount"]) for p in resp.get("ResultsByTime", []))
            except Exception:
                return 0.0

        def fetch_ai_mtd():
            try:
                resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": mtd_start.strftime("%Y-%m-%d"), "End": (today + timedelta(days=1)).strftime("%Y-%m-%d")},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service", "Amazon SageMaker"]}},
                )
                return sum(float(p["Total"]["UnblendedCost"]["Amount"]) for p in resp.get("ResultsByTime", []))
            except Exception:
                return 0.0

        def fetch_ai_last_month():
            try:
                resp = self._ce().get_cost_and_usage(
                    TimePeriod={"Start": last_month_start.strftime("%Y-%m-%d"), "End": mtd_start.strftime("%Y-%m-%d")},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock", "Amazon Bedrock Service", "Amazon SageMaker"]}},
                )
                return sum(float(p["Total"]["UnblendedCost"]["Amount"]) for p in resp.get("ResultsByTime", []))
            except Exception:
                return 0.0

        def fetch_budgets():
            try:
                account_id = boto3.client("sts", region_name=self.region).get_caller_identity()["Account"]
                budgets_client = boto3.client("budgets", region_name=self.region)
                raw = budgets_client.describe_budgets(AccountId=account_id).get("Budgets", [])
                over_80 = 0
                over_100 = 0
                for b in raw:
                    limit = float(b.get("BudgetLimit", {}).get("Amount", 0) or 0)
                    actual = float(b.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", 0) or 0)
                    if limit > 0:
                        pct = (actual / limit) * 100
                        if pct >= 100:
                            over_100 += 1
                        elif pct >= 80:
                            over_80 += 1
                return {"count": len(raw), "over_80": over_80, "over_100": over_100}
            except Exception:
                return {"count": 0, "over_80": 0, "over_100": 0}

        def fetch_anomalies():
            try:
                anomaly_start = (today - timedelta(days=30)).strftime("%Y-%m-%d")
                resp = self._ce().get_anomalies(
                    DateInterval={"StartDate": anomaly_start, "EndDate": today.strftime("%Y-%m-%d")},
                    MaxResults=100,
                )
                return len(resp.get("Anomalies", []))
            except Exception:
                return 0

        def fetch_agent_costs():
            try:
                agent_data = self._fetch_agentcore_costs(days=30)
                if agent_data.live:
                    return {"count": len(agent_data.by_agent), "total": agent_data.total}
                return {"count": 0, "total": 0.0}
            except Exception:
                return {"count": 0, "total": 0.0}

        # Run all fetches in parallel
        with ThreadPoolExecutor(max_workers=7) as executor:
            futures = {
                "mtd": executor.submit(fetch_mtd_spend),
                "last_month": executor.submit(fetch_last_month_spend),
                "ai_mtd": executor.submit(fetch_ai_mtd),
                "ai_last_month": executor.submit(fetch_ai_last_month),
                "budgets": executor.submit(fetch_budgets),
                "anomalies": executor.submit(fetch_anomalies),
                "agents": executor.submit(fetch_agent_costs),
            }
            for key, future in futures.items():
                try:
                    results[key] = future.result(timeout=10)
                except Exception:
                    if key == "budgets":
                        results[key] = {"count": 0, "over_80": 0, "over_100": 0}
                    elif key == "agents":
                        results[key] = {"count": 0, "total": 0.0}
                    else:
                        results[key] = 0

        mtd = results.get("mtd", 0)
        last_month = results.get("last_month", 0)
        budgets = results.get("budgets", {})
        agents = results.get("agents", {"count": 0, "total": 0.0})

        # Calculate MoM change (pro-rated for partial month)
        days_in_month = (mtd_start.replace(month=mtd_start.month % 12 + 1, day=1) - timedelta(days=1)).day
        day_of_month = today.day
        if last_month > 0 and day_of_month > 0:
            projected_full_month = mtd * (days_in_month / day_of_month)
            mtd_change_pct = ((projected_full_month - last_month) / last_month) * 100
        else:
            mtd_change_pct = 0

        return FinOpsDashboardSummary(
            total_mtd=round(mtd, 2),
            total_last_month=round(last_month, 2),
            mtd_change_pct=round(mtd_change_pct, 1),
            ai_mtd=round(results.get("ai_mtd", 0), 2),
            ai_last_month=round(results.get("ai_last_month", 0), 2),
            budget_count=budgets.get("count", 0),
            budgets_over_80_pct=budgets.get("over_80", 0),
            budgets_over_100_pct=budgets.get("over_100", 0),
            anomaly_count_30d=results.get("anomalies", 0),
            agent_count=agents.get("count", 0),
            agent_total_cost_30d=round(agents.get("total", 0.0), 2),
            live=True,
            source="cost-explorer+budgets+agentcore",
        )

    # ─── Savings Plans Purchase Recommendations ───

    def get_savings_plans_recommendations(
        self, savings_plans_type: str = "COMPUTE_SP", term: str = "ONE_YEAR",
        payment_option: str = "NO_UPFRONT", lookback: str = "THIRTY_DAYS"
    ) -> SavingsPlansPurchaseResponse:
        """Get Savings Plans purchase recommendations from Cost Explorer (10 min cache)."""
        key = f"sp_recommendations:{savings_plans_type}:{term}:{payment_option}:{lookback}"
        result, cached_at = get_or_load(
            key, 600,  # 10 min TTL
            lambda: self._fetch_savings_plans_recommendations(savings_plans_type, term, payment_option, lookback),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_savings_plans_recommendations(
        self, savings_plans_type: str, term: str, payment_option: str, lookback: str
    ) -> SavingsPlansPurchaseResponse:
        """Fetch Savings Plans purchase recommendations from Cost Explorer."""
        try:
            resp = self._ce().get_savings_plans_purchase_recommendation(
                SavingsPlansType=savings_plans_type,
                TermInYears=term,
                PaymentOption=payment_option,
                LookbackPeriodInDays=lookback,
            )

            recommendations: list[SavingsPlansPurchaseRecommendation] = []
            total_savings = 0.0

            metadata = resp.get("Metadata", {})
            rec_details = resp.get("SavingsPlansPurchaseRecommendationDetails", [])

            for detail in rec_details:
                est_savings = float(detail.get("EstimatedMonthlySavingsAmount", 0) or 0)
                est_savings_pct = float(detail.get("EstimatedSavingsPercentage", 0) or 0)
                hourly = float(detail.get("HourlyCommitmentToPurchase", 0) or 0)
                upfront = float(detail.get("UpfrontCost", 0) or 0)
                on_demand = float(detail.get("CurrentAverageHourlyOnDemandSpend", 0) or 0) * 730  # ~monthly

                recommendations.append(SavingsPlansPurchaseRecommendation(
                    savings_plans_type=savings_plans_type,
                    term_in_years=term,
                    payment_option=payment_option,
                    hourly_commitment=round(hourly, 4),
                    estimated_monthly_savings=round(est_savings, 2),
                    estimated_savings_percentage=round(est_savings_pct, 1),
                    upfront_cost=round(upfront, 2),
                    on_demand_cost_equivalent=round(on_demand, 2),
                    current_on_demand_spend=round(
                        float(detail.get("CurrentAverageHourlyOnDemandSpend", 0) or 0) * 730, 2
                    ),
                ))
                total_savings += est_savings

            # Sort by savings potential
            recommendations.sort(key=lambda x: x.estimated_monthly_savings, reverse=True)

            return SavingsPlansPurchaseResponse(
                recommendations=recommendations,
                total_estimated_monthly_savings=round(total_savings, 2),
                lookback_period=lookback,
                live=True,
                source="cost-explorer",
                note=f"{len(recommendations)} Savings Plans recommendations found for {savings_plans_type}." if recommendations else "No Savings Plans recommendations - current usage may already be optimized.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Savings Plans recommendations unavailable: %s", e)
            return SavingsPlansPurchaseResponse(
                recommendations=[],
                lookback_period=lookback,
                live=False,
                source="unavailable-fallback",
                note="ce:GetSavingsPlansPurchaseRecommendation not available or no eligible usage.",
            )

    # ─── Savings Plans Utilization ───

    def get_savings_plans_utilization(self, months: int = 1) -> SavingsPlansUtilizationResponse:
        """Get Savings Plans utilization from Cost Explorer (5 min cache)."""
        key = f"sp_utilization:{self.region}:{months}"
        result, cached_at = get_or_load(
            key, 300,  # 5 min TTL
            lambda: self._fetch_savings_plans_utilization(months),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_savings_plans_utilization(self, months: int = 1) -> SavingsPlansUtilizationResponse:
        """Fetch Savings Plans utilization from Cost Explorer."""
        start, end = self._default_window(months)
        try:
            resp = self._ce().get_savings_plans_utilization(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
            )

            by_time: list[SavingsPlansUtilizationByTime] = []
            total_used = 0.0
            total_unused = 0.0
            total_savings = 0.0

            for period in resp.get("SavingsPlansUtilizationsByTime", []):
                time_period = period.get("TimePeriod", {}).get("Start", "")
                util = period.get("Utilization", {})
                amort = period.get("AmortizedCommitment", {})
                savings = period.get("Savings", {})

                used = float(amort.get("UsedCommitment", 0) or 0)
                unused = float(amort.get("TotalCommitment", 0) or 0) - used
                total_commit = float(amort.get("TotalCommitment", 0) or 0)
                util_pct = float(util.get("UtilizationPercentage", 0) or 0)
                net_savings = float(savings.get("NetSavings", 0) or 0)

                by_time.append(SavingsPlansUtilizationByTime(
                    time_period=time_period,
                    utilization_pct=round(util_pct, 1),
                    used_commitment=round(used, 2),
                    unused_commitment=round(unused, 2),
                    savings=round(net_savings, 2),
                    total_commitment=round(total_commit, 2),
                ))
                total_used += used
                total_unused += unused
                total_savings += net_savings

            # Calculate overall utilization
            overall_total = total_used + total_unused
            overall_util = (total_used / overall_total * 100) if overall_total > 0 else 0

            return SavingsPlansUtilizationResponse(
                by_time=by_time,
                overall_utilization_pct=round(overall_util, 1),
                total_used=round(total_used, 2),
                total_unused=round(total_unused, 2),
                total_savings=round(total_savings, 2),
                period_start=start,
                period_end=end,
                live=True,
                source="cost-explorer",
                note=f"Savings Plans utilization: {overall_util:.1f}% over {len(by_time)} month(s)." if by_time else "No Savings Plans utilization data - no active Savings Plans.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Savings Plans utilization unavailable: %s", e)
            return SavingsPlansUtilizationResponse(
                by_time=[],
                period_start=start,
                period_end=end,
                live=False,
                source="unavailable-fallback",
                note="ce:GetSavingsPlansUtilization not available or no Savings Plans active.",
            )

    # ─── RI Purchase Recommendations ───

    def get_ri_recommendations(
        self, service: str = "Amazon Elastic Compute Cloud - Compute",
        term: str = "ONE_YEAR", payment_option: str = "NO_UPFRONT",
        lookback: str = "THIRTY_DAYS"
    ) -> RIPurchaseResponse:
        """Get Reserved Instance purchase recommendations from Cost Explorer (10 min cache)."""
        key = f"ri_recommendations:{service}:{term}:{payment_option}:{lookback}"
        result, cached_at = get_or_load(
            key, 600,  # 10 min TTL
            lambda: self._fetch_ri_recommendations(service, term, payment_option, lookback),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_ri_recommendations(
        self, service: str, term: str, payment_option: str, lookback: str
    ) -> RIPurchaseResponse:
        """Fetch Reserved Instance purchase recommendations from Cost Explorer."""
        try:
            resp = self._ce().get_reservation_purchase_recommendation(
                Service=service,
                TermInYears=term,
                PaymentOption=payment_option,
                LookbackPeriodInDays=lookback,
            )

            recommendations: list[RIPurchaseRecommendation] = []
            total_savings = 0.0

            for rec in resp.get("Recommendations", []):
                for detail in rec.get("RecommendationDetails", []):
                    instance_details = detail.get("InstanceDetails", {})
                    ec2_details = instance_details.get("EC2InstanceDetails", {})
                    rds_details = instance_details.get("RDSInstanceDetails", {})

                    # Extract details based on service type
                    if ec2_details:
                        instance_type = ec2_details.get("InstanceType", "unknown")
                        region = ec2_details.get("Region", "unknown")
                        platform = ec2_details.get("Platform", "Linux/UNIX")
                        scope = "Region" if ec2_details.get("CurrentGeneration") else "Availability Zone"
                    elif rds_details:
                        instance_type = rds_details.get("InstanceType", "unknown")
                        region = rds_details.get("Region", "unknown")
                        platform = rds_details.get("DatabaseEngine", "unknown")
                        scope = "Region"
                    else:
                        instance_type = "unknown"
                        region = "unknown"
                        platform = "unknown"
                        scope = "Region"

                    qty = int(detail.get("RecommendedNumberOfInstancesToPurchase", "1") or "1")
                    upfront = float(detail.get("UpfrontCost", "0") or "0")
                    recurring = float(detail.get("RecurringStandardMonthlyCost", "0") or "0")
                    est_savings = float(detail.get("EstimatedMonthlySavingsAmount", "0") or "0")
                    est_savings_pct = float(detail.get("EstimatedMonthlySavingsPercentage", "0") or "0")
                    current_on_demand = float(detail.get("AverageNormalizedUnitsUsedPerHour", "0") or "0") * 730
                    avg_util = float(detail.get("AverageUtilization", "0") or "0")

                    recommendations.append(RIPurchaseRecommendation(
                        instance_type=instance_type,
                        region=region,
                        platform=platform,
                        scope=scope,
                        recommended_quantity=qty,
                        term_in_years=term,
                        payment_option=payment_option,
                        upfront_cost=round(upfront, 2),
                        recurring_monthly_cost=round(recurring, 2),
                        estimated_monthly_savings=round(est_savings, 2),
                        estimated_savings_percentage=round(est_savings_pct, 1),
                        current_monthly_on_demand=round(current_on_demand, 2),
                        average_utilization=round(avg_util, 1),
                    ))
                    total_savings += est_savings

            # Sort by savings potential
            recommendations.sort(key=lambda x: x.estimated_monthly_savings, reverse=True)

            return RIPurchaseResponse(
                recommendations=recommendations,
                total_estimated_monthly_savings=round(total_savings, 2),
                service=service,
                lookback_period=lookback,
                live=True,
                source="cost-explorer",
                note=f"{len(recommendations)} RI recommendations found, ${total_savings:.2f}/mo potential savings." if recommendations else "No RI recommendations - current usage may not benefit from RIs.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("RI recommendations unavailable: %s", e)
            return RIPurchaseResponse(
                recommendations=[],
                service=service,
                lookback_period=lookback,
                live=False,
                source="unavailable-fallback",
                note="ce:GetReservationPurchaseRecommendation not available or no eligible usage.",
            )

    # ─── Cost Categories ───

    def get_cost_categories(self) -> CostCategoriesResponse:
        """Get Cost Categories from Cost Explorer (10 min cache)."""
        key = f"cost_categories:{self.region}"
        result, cached_at = get_or_load(
            key, 600,  # 10 min TTL
            lambda: self._fetch_cost_categories(),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_cost_categories(self) -> CostCategoriesResponse:
        """Fetch Cost Categories from Cost Explorer."""
        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=30)).isoformat()
        end = today.isoformat()

        try:
            # First, get the list of cost category names
            resp = self._ce().get_cost_categories(
                TimePeriod={"Start": start, "End": end},
            )

            category_names = resp.get("CostCategoryNames", [])
            categories: list[CostCategory] = []

            # For each category, try to get its definition
            for name in category_names:
                try:
                    desc_resp = self._ce().describe_cost_category_definition(
                        CostCategoryArn=f"arn:aws:ce:::{name}",  # This is a placeholder; real ARN needed
                    )
                    defn = desc_resp.get("CostCategory", {})
                    rules = defn.get("Rules", [])
                    values = defn.get("CostCategoryValues", [])
                    default_val = defn.get("DefaultValue")

                    categories.append(CostCategory(
                        name=name,
                        cost_category_arn=defn.get("CostCategoryArn"),
                        effective_start=defn.get("EffectiveStart"),
                        effective_end=defn.get("EffectiveEnd"),
                        rules_count=len(rules),
                        values=values,
                        default_value=default_val,
                    ))
                except (ClientError, BotoCoreError):
                    # If we can't get the definition, just add the name
                    categories.append(CostCategory(
                        name=name,
                        rules_count=0,
                        values=[],
                    ))

            return CostCategoriesResponse(
                categories=categories,
                total=len(categories),
                live=True,
                source="cost-explorer",
                note=f"{len(categories)} cost categories found." if categories else "No cost categories defined - create categories in the Billing console to organize costs.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Cost categories unavailable: %s", e)
            return CostCategoriesResponse(
                categories=[],
                live=False,
                source="unavailable-fallback",
                note="ce:GetCostCategories not available or no cost categories defined.",
            )
