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
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

import re

from core.ttl_cache import get_or_load
from core.security_utils import mask_budget_name
from models.govern_cost import (
    CostAnomalies,
    CostAnomaly,
    CostByDay,
    CostByModel,
    CostByMonth,
    CostByService,
    CostByTagValue,
    CostForecast,
    CostModelBreakdown,
    Budget,
    BudgetsResponse,
    CostSummary,
    CostTagBreakdown,
    CostTrend,
    ProviderConnector,
    ProviderConnectorsResponse,
    TagKeyOption,
    TagKeysResponse,
    UseCaseSpend,
    UseCaseSpendResponse,
)

logger = logging.getLogger(__name__)

# Cost Explorer calls are ~1s each and monthly spend barely moves intraday, so a
# 15-min TTL keeps repeat page loads instant. Applied to the model-surface reads.
_COST_TTL = 900


def _cost_cache_note(result, cached_at: float):
    """Stamp an honest 'cached as of' age onto a live cost response."""
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    result.note = f"{result.note} · {stamp}" if result.note else stamp
    return result


class GovernCostService:
    def __init__(self, region: str = "us-east-1", default_tag_keys: Optional[list[str]] = None,
                 spend_table_name: str = ""):
        self.region = region
        self._client = None  # lazy — don't touch AWS until first query
        # Configured fallback tag keys (from settings.GOVERN_COST_TAG_KEYS) used when
        # live discovery of activated cost-allocation tags returns nothing.
        self.default_tag_keys = default_tag_keys or ["business-unit", "business-domain", "agent", "owner"]
        # FinOps per-use-case spend store (written by spend_aggregator from LiteLLM).
        self.spend_table_name = spend_table_name
        self._spend_table = None

    def get_by_use_case(self, days: int = 30) -> "UseCaseSpendResponse":
        """Cached wrapper around the FinOps spend-store scan (15 min TTL).

        Only live (populated) results are cached; the not-configured / empty state
        is returned each call so it flips to live the moment the table is provisioned.
        """
        key = f"cost:by-use-case:{self.region}:{self.spend_table_name}:{days}"
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
                self._spend_table = boto3.resource("dynamodb", region_name=self.region).Table(self.spend_table_name)
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
            logger.warning("FinOps spend store unavailable: %s", e)
            return UseCaseSpendResponse(
                by_use_case=[], window_days=days, live=False, source="unavailable-fallback",
                note="FinOps spend store unreachable — table not provisioned or access denied.",
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
    def _default_window(months: int) -> tuple[str, str]:
        """[start, end) covering the last `months` whole+current months, YYYY-MM-DD."""
        today = datetime.now(timezone.utc).date()
        end = (today.replace(day=1) + timedelta(days=32)).replace(day=1)  # first of next month
        start_month = today.replace(day=1)
        for _ in range(max(0, months - 1)):
            start_month = (start_month - timedelta(days=1)).replace(day=1)
        return start_month.isoformat(), end.isoformat()

    def get_summary(self, months: int = 6, ai_only: bool = False) -> CostSummary:
        """Cached wrapper around the live CE summary fetch (15 min TTL)."""
        key = f"cost:summary:{self.region}:{months}:{ai_only}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_summary(months, ai_only),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_summary(self, months: int = 6, ai_only: bool = False) -> CostSummary:
        """Total + by-service + by-month AWS spend for the trailing window.

        ai_only: when True, filter to the AI/ML footprint (Bedrock, SageMaker,
        Comprehend, etc.) so FinOps can show the governed-AI slice of the bill.
        """
        start, end = self._default_window(months)

        AI_SERVICES = [
            "Amazon Bedrock",
            "Amazon SageMaker",
            "Amazon Comprehend",
            "Amazon Textract",
            "Amazon Kendra",
        ]
        cost_filter = {"Dimensions": {"Key": "SERVICE", "Values": AI_SERVICES}} if ai_only else None

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
        """Parse the Bedrock model name out of a CE USAGE_TYPE.

        Two AWS formats exist in the wild:
          A) 'USE1-Claude4.5Sonnet-input-tokens-cross-region-global' -> 'Claude4.5Sonnet'
          B) 'USE1-anthropic.claude-opus-4-8-mantle-input-tokens-standard' -> 'Claude Opus 4.8'
             (dotted vendor SKU; region prefix optional; '-1h' cache variants exist)
        Guardrail usage types aren't a model — bucket them as 'Guardrails'.
        """
        if "Guardrail" in usage_type:
            return "Guardrails"
        # Format B: [REGION-]<vendor>.<family>-<tier>-<ver>-mantle-… (dotted SKU).
        # Anchor on '-mantle' so the region prefix and cache/-1h suffixes don't matter.
        m = re.search(r"[a-z]+\.([a-z]+)-([a-z]+)-([0-9-]+?)-mantle", usage_type)
        if m:
            fam, tier, ver = m.group(1), m.group(2), m.group(3).replace("-", ".")
            return f"{fam.capitalize()} {tier.capitalize()} {ver}".strip()
        # Format A: REGION-<Model>-<token-kind>
        s = re.sub(r"^[A-Z0-9]+-", "", usage_type)  # drop region prefix (USE1-, USW2-, …)
        s = re.sub(r"-cross-region-global$", "", s)
        s = re.sub(r"-(input|output)-tokens$", "", s)
        s = re.sub(r"-cache-(read|write)-input-token-count$", "", s)
        return s or usage_type

    def get_by_model(self, months: int = 6) -> CostModelBreakdown:
        """Cached wrapper around the live CE by-model fetch (15 min TTL)."""
        key = f"cost:by-model:{self.region}:{months}"
        result, cached_at = get_or_load(
            key, _COST_TTL, lambda: self._fetch_by_model(months),
            should_cache=lambda r: r.live,
        )
        return _cost_cache_note(result, cached_at)

    def _fetch_by_model(self, months: int = 6) -> CostModelBreakdown:
        """Bedrock spend broken out by model — CE grouped by USAGE_TYPE, Bedrock-filtered."""
        start, end = self._default_window(months)
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

    def get_by_tag(self, key: str, months: int = 6) -> CostTagBreakdown:
        """AWS cost grouped by a cost-allocation tag key (CE GroupBy=TAG).

        `key` is the AWS cost-allocation tag key (from the discovered/configured
        list — see list_tag_keys). Honest empty-state: if the tag isn't activated /
        no resources carry it, CE returns only an untagged bucket — we surface that
        as note='awaiting tagged usage' rather than faking.
        """
        aws_key = key
        start, end = self._default_window(months)
        try:
            resp = self._ce().get_cost_and_usage(
                TimePeriod={"Start": start, "End": end},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "TAG", "Key": aws_key}],
            )
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
