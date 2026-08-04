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
    """Bedrock spend for one model, parsed from the CE USAGE_TYPE dimension."""

    model: str = Field(..., description="Model name, e.g. 'Claude4.5Sonnet' (or 'Guardrails')")
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
