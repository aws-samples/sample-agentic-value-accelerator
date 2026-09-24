"""Govern Cost — real AWS spend for the FinOps surface, via Cost Explorer.

Unlike the DynamoDB-backed CRUD slices, this is a READ-THROUGH view: AWS Cost
Explorer (`ce:GetCostAndUsage`) is the source of truth, so there is no table and
no create/update — the service queries the account's actual bill and shapes it
for the Govern FinOps dashboard.

Complements `spend_aggregator` (which tracks per-use-case LLM token spend from
LiteLLM). This slice is the AWS *infrastructure* bill: total, by-service, and
by-month, optionally filtered to the Bedrock/AI footprint via cost-allocation
tags. Shapes mirror the frontend FinOps mock so it is a drop-in replacement.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CostByService(BaseModel):
    service: str = Field(..., description="AWS service name, e.g. 'Amazon Bedrock'")
    amount: float = Field(..., description="Unblended cost in USD for the period")


class CostByMonth(BaseModel):
    month: str = Field(..., description="Period start, YYYY-MM-DD")
    amount: float = Field(..., description="Unblended cost in USD for that month")


class CostByModel(BaseModel):
    """Bedrock spend for one model, parsed from the CE USAGE_TYPE dimension.

    `model` is normalized to Bedrock's catalog display name regardless of which
    USAGE_TYPE format AWS emitted, so it keys against a govern_models catalog
    `name`/`model_id` — see GovernCostService._model_from_usage_type.
    """

    model: str = Field(..., description="Canonical model name, e.g. 'Claude Sonnet 4.5' (or 'Guardrails')")
    amount: float = Field(..., description="Unblended Bedrock cost in USD over the window")


class CostModelBreakdown(BaseModel):
    """Bedrock cost broken out by model (CE grouped by USAGE_TYPE, filtered to Bedrock)."""

    by_model: List[CostByModel] = Field(default_factory=list)
    total: float = 0.0
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class CostSummary(BaseModel):
    """The AWS spend view for the FinOps surface, for a requested window."""

    total: float = Field(..., description="Total unblended cost across the window (USD)")
    currency: str = "USD"
    period_start: str
    period_end: str
    by_service: List[CostByService] = Field(default_factory=list)
    by_month: List[CostByMonth] = Field(default_factory=list)
    # Honesty flags so the UI can badge the source, matching the OSS live-vs-mock convention.
    live: bool = Field(..., description="True when sourced from Cost Explorer; False when the fallback baseline was used")
    source: str = Field(..., description="'cost-explorer' | 'unavailable-fallback'")
    note: Optional[str] = Field(default=None, description="Why the fallback was used, when live is False")


class UseCaseSpend(BaseModel):
    """Real per-use-case LLM token spend, from the FinOps spend store (LiteLLM
    usage aggregated by spend_aggregator). Closes the Build→FinOps loop: a
    deployed use case → its actual model spend."""

    use_case_id: str
    total_cost_usd: float
    input_tokens: int = 0
    output_tokens: int = 0
    request_count: int = 0
    top_model: Optional[str] = Field(default=None, description="Highest-cost model for this use case")


class UseCaseSpendResponse(BaseModel):
    by_use_case: List[UseCaseSpend] = Field(default_factory=list)
    total_cost_usd: float = 0.0
    window_days: int = 30
    live: bool
    source: str
    note: Optional[str] = None


class Budget(BaseModel):
    name: str
    limit: float = Field(..., description="Budgeted amount (USD) for the period")
    actual: float = Field(..., description="Actual spend so far this period (USD)")
    forecast: float = Field(0.0, description="AWS-forecasted spend for the period (USD), if provided")
    time_unit: str = Field("MONTHLY", description="Budget period: MONTHLY/QUARTERLY/ANNUALLY")
    pct_used: float = Field(..., description="actual / limit * 100")


class BudgetsResponse(BaseModel):
    """Live AWS Budgets (budgets:DescribeBudgets) — real budget-vs-actual."""

    budgets: List[Budget] = Field(default_factory=list)
    total_limit: float = 0.0
    total_actual: float = 0.0
    live: bool
    source: str
    note: Optional[str] = None


class TagKeyOption(BaseModel):
    key: str = Field(..., description="Cost-allocation tag key")
    active: bool = Field(..., description="True if activated for cost allocation (CE can group by it)")


class TagKeysResponse(BaseModel):
    """The tag keys the Cost-by-Tag view can offer for this account."""

    keys: List[TagKeyOption] = Field(default_factory=list)
    # Whether the keys were discovered live from the account vs the configured default set.
    discovered: bool = Field(..., description="True when read live from ce:ListCostAllocationTags")
    source: str
    note: Optional[str] = None


class CostByTagValue(BaseModel):
    value: str = Field(..., description="Tag value, e.g. a business unit or agent name ('untagged' bucket if blank)")
    amount: float = Field(..., description="Unblended cost in USD attributed to this tag value")


class CostTagBreakdown(BaseModel):
    """AWS cost grouped by a cost-allocation tag key (CE GroupBy=TAG).

    Reads back the taxonomy Plan defines (business_unit / business_domain / owner)
    and Build stamps on resources at deploy time. Forward-only: only spend accrued
    after the tag was activated + applied appears here.
    """

    tag_key: str
    by_value: List[CostByTagValue] = Field(default_factory=list)
    tagged_total: float = Field(0.0, description="Cost carrying a non-empty value for this tag")
    untagged_total: float = Field(0.0, description="Cost with no value for this tag")
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class CostByDay(BaseModel):
    date: str = Field(..., description="Day, YYYY-MM-DD")
    amount: float = Field(..., description="Unblended cost in USD for that day")


class CostTrend(BaseModel):
    """Daily spend for the trailing N days — powers the 30-day trend + velocity."""

    days: List[CostByDay] = Field(default_factory=list)
    total: float = 0.0
    avg_per_day: float = 0.0
    live: bool
    source: str
    note: Optional[str] = None


class CostForecast(BaseModel):
    """Forward AWS spend from Cost Explorer's own forecast model (GetCostForecast)."""

    forecast_total: float = Field(..., description="Predicted unblended cost over the horizon (USD)")
    months: List[CostByMonth] = Field(default_factory=list, description="Per-month forecast points")
    horizon_start: str
    horizon_end: str
    live: bool
    source: str
    note: Optional[str] = None


class CostAnomaly(BaseModel):
    start: str
    end: str
    service: Optional[str] = None
    impact: float = Field(..., description="Total actual spend impact in USD")
    score: float = Field(..., description="Anomaly max score (0-1+, higher = more anomalous)")


class CostAnomalies(BaseModel):
    """Real cost anomalies from AWS Cost Anomaly Detection (GetAnomalies)."""

    anomalies: List[CostAnomaly] = Field(default_factory=list)
    count: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class ProviderConnector(BaseModel):
    """One cloud/model provider's cost-connector status for the cross-provider view.

    AWS is live via Cost Explorer; other providers (Azure, Google Vertex) need
    their own billing connector wired before their spend can appear. This is an
    honest scaffold — it reports what IS connected vs what WOULD need a connector,
    rather than fabricating multi-cloud spend.
    """

    provider: str = Field(..., description="Provider key: aws | azure | gcp")
    label: str = Field(..., description="Display name, e.g. 'AWS (Cost Explorer)'")
    connected: bool = Field(..., description="True when a live cost feed is wired for this provider")
    source: str = Field(..., description="'cost-explorer' when live, else the connector that WOULD provide it")
    detail: str = Field(..., description="Human-readable status / what's needed to connect")


class ProviderConnectorsResponse(BaseModel):
    """Cross-provider cost-connector inventory — honest 'connected vs not' status."""

    connectors: List[ProviderConnector] = Field(default_factory=list)
    connected_count: int = 0
    total_count: int = 0
    live: bool = Field(..., description="True when at least one provider feed is live")
    source: str
    note: Optional[str] = None


# ─── Enhanced Cost Explorer dimensions ───


class CostByRegion(BaseModel):
    region: str = Field(..., description="AWS region, e.g. 'us-east-1'")
    amount: float = Field(..., description="Unblended cost in USD for the period")
    governed: bool = Field(
        False,
        description=(
            "Whether this region is in AVA's governed-region set. Spend outside that "
            "set is real spend that none of the Govern dashboards are watching."
        ),
    )


class CostRegionBreakdown(BaseModel):
    """Cost Explorer spend by region — account-wide, not per-region-endpoint.

    Cost Explorer is a single-endpoint (pinned) service: there is one CE API that
    answers for the whole account, and the region breakdown comes from CE's own REGION
    dimension. So unlike the fanned-out Govern routes this is NOT an aggregate over the
    governed set and carries no RegionProvenance - it already covers every region the
    account spent in, governed or not. `governed_total` / `ungoverned_total` split it
    against the governed set so the gap is visible instead of implied.
    """

    by_region: List[CostByRegion] = Field(default_factory=list)
    total: float = 0.0
    governed_total: float = Field(
        0.0,
        description="Portion of `total` spent in governed regions",
    )
    ungoverned_total: float = Field(
        0.0,
        description=(
            "Portion of `total` spent in regions outside the governed set, including "
            "global/no-region charges. Non-zero means Govern is not seeing all AI spend."
        ),
    )
    governed_regions: List[str] = Field(
        default_factory=list,
        description="The governed-region set this split was computed against",
    )
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class CostByOperation(BaseModel):
    operation: str = Field(..., description="CE OPERATION, e.g. 'InvokeModel', 'InvokeModelWithResponseStream'")
    amount: float = Field(..., description="Unblended cost in USD")


class CostOperationBreakdown(BaseModel):
    """Bedrock cost by operation type."""

    by_operation: List[CostByOperation] = Field(default_factory=list)
    total: float = 0.0
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class TokenCost(BaseModel):
    """Bedrock spend for one (token_type, model) pair.

    `amount` is a measured Cost Explorer dollar figure. `tokens` is **always None**:
    it used to hold a count back-derived as `dollars / list_rate * 1000`, which was
    removed because the counts are measured directly from CloudWatch and because
    the derivation was both broken (its key matcher never matched, so every model
    used one Sonnet rate) and circular (the one consumer divided dollars by it to
    "compute" a $/1K that was arithmetically just the rate again).

    The field is kept rather than dropped so existing clients do not break; they
    must treat None as "not reported here" and read token counts from the
    CloudWatch runtime metrics instead.
    """

    token_type: str = Field(..., description="'input' | 'output' | 'cache_read' | 'cache_write'")
    model: str
    tokens: Optional[int] = Field(
        None,
        description=(
            "Always None. Token counts are measured from CloudWatch, never inferred "
            "from spend. Render as 'not reported', never as 0."
        ),
    )
    amount: float


class TokenCostBreakdown(BaseModel):
    """Bedrock cost split by input vs output tokens, with cache dimensions broken out.

    Bedrock bills four token dimensions, not two: fresh input, cache write, cache read
    and output. Cache read and cache write used to be folded into `input_total`, which
    made cache spend unrecoverable downstream - the FinOps cache panel had to estimate
    it from a token ratio and a hardcoded discount instead of reading real dollars.

    `input_total` still includes both cache dimensions so existing consumers of the
    input-vs-output split keep their meaning. The three sub-totals are additive detail:

        fresh_input_total + cache_read_total + cache_write_total == input_total
    """

    by_token_type: List[TokenCost] = Field(default_factory=list)
    input_total: float = Field(0.0, description="All input-side spend, cache dimensions included")
    output_total: float = 0.0
    fresh_input_total: float = Field(
        0.0, description="Input tokens billed at the standard rate (no cache involvement)"
    )
    cache_read_total: float = Field(
        0.0, description="Cache-read spend. Billed at a steep discount to the input rate."
    )
    cache_write_total: float = Field(
        0.0,
        description=(
            "Cache-write spend. Billed ABOVE the standard input rate on the models AWS "
            "publishes a multiplier for, so this is the cache dimension that can make a "
            "workload more expensive rather than cheaper."
        ),
    )
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class AgentCostAttribution(BaseModel):
    """Per-agent cost attribution combining inference profiles, tags, and runtime metrics."""

    agent_id: str
    agent_name: Optional[str] = None
    bedrock_cost: float = Field(0.0, description="Bedrock token spend via inference profile or tag")
    compute_cost: float = Field(
        0.0,
        description=(
            "AgentCore compute spend. Normally the real Cost Explorer 'Amazon Bedrock "
            "AgentCore' service line allocated pro-rata across runtimes by measured "
            "CPU/Memory hours, so the per-agent figures sum to the actual bill. Falls "
            "back to a list-rate estimate from CPU/Memory hours only when the service "
            "line is unavailable; the response note states which basis was used."
        ),
    )
    total_cost: float = 0.0
    invocations: int = 0
    cost_per_invocation: float = 0.0
    inference_profile: Optional[str] = None
    cost_allocation_tag: Optional[str] = None


class AgentCostResponse(BaseModel):
    """Per-agent cost breakdown for chargeback and unit economics."""

    by_agent: List[AgentCostAttribution] = Field(default_factory=list)
    total_bedrock: float = 0.0
    total_compute: float = 0.0
    total: float = 0.0
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class AgentForecastPoint(BaseModel):
    """Single forecast data point for an agent."""

    month: str = Field(..., description="Month start date YYYY-MM-DD")
    predicted_invocations: int = 0
    predicted_cost: float = 0.0
    confidence_low: float = 0.0
    confidence_high: float = 0.0


class AgentForecast(BaseModel):
    """Per-agent cost forecast based on historical trends."""

    agent_id: str
    agent_name: Optional[str] = None
    historical_invocations: int = Field(0, description="Total invocations in lookback period")
    historical_cost: float = Field(0.0, description="Total cost in lookback period")
    avg_cost_per_invocation: float = 0.0
    trend: str = Field("stable", description="growing | declining | stable")
    trend_pct: float = Field(0.0, description="Week-over-week growth rate as percentage")
    forecast: List[AgentForecastPoint] = Field(default_factory=list)
    forecast_total_invocations: int = 0
    forecast_total_cost: float = 0.0


class AgentForecastResponse(BaseModel):
    """Aggregated agent cost forecasts."""

    by_agent: List[AgentForecast] = Field(default_factory=list)
    total_historical_cost: float = 0.0
    total_forecast_cost: float = 0.0
    forecast_months: int = 3
    lookback_days: int = 30
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class SavingsPlanCoverage(BaseModel):
    """Savings Plans coverage metrics."""

    coverage_pct: float = Field(0.0, description="Percentage of eligible spend covered by Savings Plans")
    on_demand_cost: float = 0.0
    sp_covered_cost: float = 0.0
    total_cost: float = 0.0


class RICoverage(BaseModel):
    """Reserved Instance utilization."""

    utilization_pct: float = Field(0.0, description="RI utilization percentage")
    used_hours: float = 0.0
    total_hours: float = 0.0


class CommitmentCoverage(BaseModel):
    """Combined Savings Plans + RI coverage for commitment planning."""

    savings_plans: Optional[SavingsPlanCoverage] = None
    reserved_instances: Optional[RICoverage] = None
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


# ─── Usage-level detail and quotas ───


class UsageDetail(BaseModel):
    """Detailed usage record from Cost Explorer."""

    usage_type: str
    region: str
    cost: float
    usage_quantity: float
    unit: Optional[str] = None


class UsageBreakdown(BaseModel):
    """Detailed usage breakdown with quantities and costs."""

    by_usage: List[UsageDetail] = Field(default_factory=list)
    total_cost: float = 0.0
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


class ServiceQuota(BaseModel):
    """A single service quota."""

    quota_code: str
    quota_name: str
    value: float
    unit: Optional[str] = None
    adjustable: bool = False
    global_quota: bool = False
    usage_metric_namespace: Optional[str] = None
    usage_metric_name: Optional[str] = None


class QuotaUtilization(BaseModel):
    """Quota with current utilization."""

    quota_code: str
    quota_name: str
    limit: float
    current_usage: float = 0.0
    utilization_pct: float = 0.0
    unit: Optional[str] = None


class ServiceQuotasResponse(BaseModel):
    """Service quotas with utilization data."""

    service_code: str
    service_name: str
    quotas: List[ServiceQuota] = Field(default_factory=list)
    utilization: List[QuotaUtilization] = Field(default_factory=list)
    total_quotas: int = 0
    adjustable_quotas: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class CostDriver(BaseModel):
    """Cost comparison driver between two periods."""

    driver_name: str
    driver_type: str
    base_amount: float
    comparison_amount: float
    difference: float
    difference_pct: float


class CostDriversResponse(BaseModel):
    """Cost drivers explaining month-over-month changes."""

    drivers: List[CostDriver] = Field(default_factory=list)
    base_period: str
    comparison_period: str
    total_base: float = 0.0
    total_comparison: float = 0.0
    live: bool
    source: str
    note: Optional[str] = None


class AnomalyMonitor(BaseModel):
    """Cost anomaly monitor configuration."""

    monitor_arn: str
    monitor_name: str
    monitor_type: str
    monitor_dimension: Optional[str] = None
    creation_date: Optional[str] = None


class AnomalyMonitorsResponse(BaseModel):
    """List of configured anomaly monitors."""

    monitors: List[AnomalyMonitor] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class BedrockUsageMetrics(BaseModel):
    """Bedrock usage metrics from CloudWatch."""

    # `model_id` is an AI model identifier (a Bedrock modelId) - meaningful domain
    # vocabulary, not a pydantic internal. Pydantic reserves the `model_` prefix, so
    # the namespace guard is disabled deliberately; renaming the field would break
    # the API contract the frontend reads.
    model_config = {"protected_namespaces": ()}

    model_id: str
    invocations: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    latency_avg_ms: float = 0.0
    throttles: int = 0
    errors: int = 0


class BedrockUsageResponse(BaseModel):
    """Comprehensive Bedrock usage metrics."""

    by_model: List[BedrockUsageMetrics] = Field(default_factory=list)
    total_invocations: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


# ─── Cost Comparison Drivers ───


class CostComparisonDriver(BaseModel):
    """Single driver explaining cost change between periods."""

    driver_type: str = Field(..., description="SERVICE | REGION | USAGE_TYPE | LINKED_ACCOUNT")
    driver_value: str = Field(..., description="e.g. 'Amazon Bedrock' or 'us-east-1'")
    base_cost: float = Field(0.0, description="Cost in base period")
    comparison_cost: float = Field(0.0, description="Cost in comparison period")
    absolute_difference: float = Field(0.0, description="comparison - base")
    percentage_difference: float = Field(0.0, description="Change as percentage")
    contribution_pct: float = Field(
        0.0,
        description=(
            "Share of GROSS movement this driver accounts for, 0-100. Previously divided "
            "by the NET change, which produced values over 100% - up to 1817% on real data - "
            "whenever increases and decreases offset each other. Net is the wrong "
            "denominator for a share: a $672 mover in a month whose net change is $37 "
            "accounts for a large slice of what moved, not 18x the change."
        ),
    )
    change_kind: str = Field(
        "increase",
        description=(
            "One of: new (absent in the base period, present now), stopped (present in "
            "the base period, absent now), increase, decrease. "
            "Distinguishing new/stopped from increase/decrease is what turns a list of "
            "percentages into an explanation: a 'new' line item and a 'stopped' one of "
            "similar size usually means a workload moved, not that spend grew."
        ),
    )


class CostComparisonResponse(BaseModel):
    """Month-over-month cost comparison drivers from CE."""

    drivers: List[CostComparisonDriver] = Field(default_factory=list)
    base_period_start: str
    base_period_end: str
    comparison_period_start: str
    comparison_period_end: str
    base_total: float = 0.0
    comparison_total: float = 0.0
    total_difference: float = 0.0
    total_difference_pct: float = 0.0

    # Gross movement, which the net figure hides.
    #
    # On real data this account moved +$1,679 up and -$1,547 down for a net change of
    # +$37. Reporting only the net says "costs were flat"; reporting the gross says
    # "a lot moved and it happened to cancel", which is the actionable reading and the
    # thing a reviewer needs to see.
    gross_increase: float = Field(0.0, description="Sum of all increases, always >= 0")
    gross_decrease: float = Field(0.0, description="Sum of all decreases, always <= 0")
    increase_count: int = 0
    decrease_count: int = 0
    new_count: int = Field(0, description="Line items present now and absent in the base period")
    stopped_count: int = Field(0, description="Line items present in the base period and absent now")
    live: bool
    source: str
    note: Optional[str] = None


# ─── Rightsizing Recommendations ───


class RightsizingTarget(BaseModel):
    """Target instance recommendation for rightsizing."""

    instance_type: str
    platform: Optional[str] = None
    region: Optional[str] = None
    estimated_monthly_cost: float = 0.0
    estimated_monthly_savings: float = 0.0
    estimated_savings_pct: float = 0.0


class RightsizingRecommendation(BaseModel):
    """Single rightsizing recommendation."""

    account_id: str
    instance_id: str
    instance_name: Optional[str] = None
    instance_type: str
    recommendation_type: str = Field(..., description="Modify | Terminate")
    finding_reason: Optional[str] = Field(None, description="UNDERUTILIZED | OVERUTILIZED etc")
    current_monthly_cost: float = 0.0
    target: Optional[RightsizingTarget] = None
    savings_currency: str = "USD"


class RightsizingResponse(BaseModel):
    """Rightsizing recommendations from Cost Explorer."""

    recommendations: List[RightsizingRecommendation] = Field(default_factory=list)
    total_recommendations: int = 0
    total_estimated_savings: float = 0.0
    lookback_period: str = Field("FOURTEEN_DAYS", description="SEVEN_DAYS | FOURTEEN_DAYS | THIRTY_DAYS")
    live: bool
    source: str
    note: Optional[str] = None


# ─── Dashboard Summary (fast load) ───


class FinOpsDashboardSummary(BaseModel):
    """Quick-load summary for FinOps dashboard - fetches only critical metrics fast."""

    # Spend summary
    total_mtd: float = Field(0.0, description="Month-to-date total spend")
    total_last_month: float = Field(0.0, description="Last full month total spend")
    mtd_change_pct: float = Field(0.0, description="MoM change percentage")

    # AI spend
    ai_mtd: float = Field(0.0, description="AI/ML services MTD spend")
    ai_last_month: float = Field(0.0, description="AI/ML services last month")

    # Budget health
    budget_count: int = 0
    budgets_over_80_pct: int = Field(0, description="Budgets >80% utilized")
    budgets_over_100_pct: int = Field(0, description="Budgets exceeded")

    # Anomalies
    anomaly_count_30d: int = Field(0, description="Cost anomalies in last 30 days")

    # Agent costs (if AgentCore active)
    agent_count: int = 0
    agent_total_cost_30d: float = 0.0

    live: bool
    source: str
    cached_at: Optional[str] = None
    note: Optional[str] = None


# ─── Savings Plans Purchase Recommendations ───


class SavingsPlansPurchaseRecommendation(BaseModel):
    """Single Savings Plans purchase recommendation from Cost Explorer."""

    savings_plans_type: str = Field(..., description="Compute, EC2Instance, SageMaker")
    term_in_years: str = Field(..., description="ONE_YEAR or THREE_YEAR")
    payment_option: str = Field(..., description="NO_UPFRONT, PARTIAL_UPFRONT, ALL_UPFRONT")
    hourly_commitment: float = Field(0.0, description="Recommended hourly commitment in USD")
    estimated_monthly_savings: float = Field(0.0, description="Estimated monthly savings in USD")
    estimated_savings_percentage: float = Field(0.0, description="Estimated savings as percentage")
    upfront_cost: float = Field(0.0, description="Upfront payment required (if applicable)")
    on_demand_cost_equivalent: float = Field(0.0, description="Equivalent on-demand cost")
    current_on_demand_spend: float = Field(0.0, description="Current on-demand spend in lookback period")


class SavingsPlansPurchaseResponse(BaseModel):
    """Savings Plans purchase recommendations from Cost Explorer."""

    recommendations: List[SavingsPlansPurchaseRecommendation] = Field(default_factory=list)
    total_estimated_monthly_savings: float = Field(0.0, description="Total potential monthly savings")
    lookback_period: str = Field("THIRTY_DAYS", description="Lookback period used for recommendations")
    live: bool
    source: str
    note: Optional[str] = None


# ─── Savings Plans Utilization ───


class SavingsPlansUtilizationByTime(BaseModel):
    """Savings Plans utilization for a single time period."""

    time_period: str = Field(..., description="Start date of the period, YYYY-MM-DD")
    utilization_pct: float = Field(0.0, description="Percentage of commitment utilized")
    used_commitment: float = Field(0.0, description="Amount of commitment used (USD)")
    unused_commitment: float = Field(0.0, description="Amount of commitment unused (USD)")
    savings: float = Field(0.0, description="Net savings from Savings Plans (USD)")
    total_commitment: float = Field(0.0, description="Total commitment amount (USD)")


class SavingsPlansUtilizationResponse(BaseModel):
    """Savings Plans utilization from Cost Explorer."""

    by_time: List[SavingsPlansUtilizationByTime] = Field(default_factory=list)
    overall_utilization_pct: float = Field(0.0, description="Overall utilization percentage")
    total_used: float = Field(0.0, description="Total commitment used across period")
    total_unused: float = Field(0.0, description="Total commitment unused across period")
    total_savings: float = Field(0.0, description="Total net savings")
    period_start: str
    period_end: str
    live: bool
    source: str
    note: Optional[str] = None


# ─── RI Purchase Recommendations ───


class RIPurchaseRecommendation(BaseModel):
    """Single Reserved Instance purchase recommendation from Cost Explorer."""

    instance_type: str = Field(..., description="Recommended instance type, e.g. 'm5.large'")
    region: str = Field(..., description="AWS region for the RI")
    platform: str = Field("Linux/UNIX", description="OS platform")
    scope: str = Field("Region", description="RI scope: Region or Availability Zone")
    recommended_quantity: int = Field(1, description="Number of RIs recommended")
    term_in_years: str = Field("ONE_YEAR", description="ONE_YEAR or THREE_YEAR")
    payment_option: str = Field("NO_UPFRONT", description="Payment option")
    upfront_cost: float = Field(0.0, description="Upfront payment required")
    recurring_monthly_cost: float = Field(0.0, description="Monthly recurring cost")
    estimated_monthly_savings: float = Field(0.0, description="Estimated monthly savings")
    estimated_savings_percentage: float = Field(0.0, description="Estimated savings as percentage")
    current_monthly_on_demand: float = Field(0.0, description="Current on-demand monthly spend")
    average_utilization: float = Field(0.0, description="Expected RI utilization percentage")


class RIPurchaseResponse(BaseModel):
    """Reserved Instance purchase recommendations from Cost Explorer."""

    recommendations: List[RIPurchaseRecommendation] = Field(default_factory=list)
    total_estimated_monthly_savings: float = Field(0.0, description="Total potential monthly savings")
    service: str = Field("Amazon Elastic Compute Cloud - Compute", description="Service for recommendations")
    lookback_period: str = Field("THIRTY_DAYS", description="Lookback period used")
    live: bool
    source: str
    note: Optional[str] = None


# ─── Cost Categories ───


class CostCategoryRule(BaseModel):
    """Single rule within a cost category definition."""

    rule_type: str = Field("REGULAR", description="REGULAR, INHERITED_VALUE, or DEFAULT")
    value: Optional[str] = Field(None, description="Category value assigned by this rule")
    match_dimensions: Optional[dict] = Field(None, description="Dimension match criteria")


class CostCategory(BaseModel):
    """AWS Cost Category definition."""

    name: str = Field(..., description="Cost category name")
    cost_category_arn: Optional[str] = Field(None, description="ARN of the cost category")
    effective_start: Optional[str] = Field(None, description="When category became effective, YYYY-MM-DD")
    effective_end: Optional[str] = Field(None, description="When category expired (if applicable)")
    rules_count: int = Field(0, description="Number of rules in this category")
    values: List[str] = Field(default_factory=list, description="Possible values for this category")
    default_value: Optional[str] = Field(None, description="Default value when no rule matches")


class CostCategoriesResponse(BaseModel):
    """Cost categories from Cost Explorer."""

    categories: List[CostCategory] = Field(default_factory=list)
    total: int = Field(0, description="Total number of cost categories")
    live: bool
    source: str
    note: Optional[str] = None
