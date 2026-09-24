"""Govern Cost — real AWS spend for the FinOps surface, via Cost Explorer.

Read-through GET routes (no CRUD): Cost Explorer is the source of truth. Follows
the govern slice route pattern — lazy service singleton reading settings.

Deliberately NOT multi-region, unlike the other Govern slices. Cost Explorer and
Budgets are tier-3 single-endpoint services (see core/region_config.py): one API
answers for the whole account. Running run_over_regions here would make N identical
calls to the same pinned endpoint and then sum the same money N times. Per-region
spend comes from CE's own REGION dimension instead (`/by-region`), which is
account-wide by construction and splits governed from ungoverned spend.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core import region_config
from core.config import settings
from core.rbac import Role, require_role
from models.govern_cost import (
    AgentCostResponse,
    AgentForecastResponse,
    AnomalyMonitorsResponse,
    BedrockUsageResponse,
    BudgetsResponse,
    CommitmentCoverage,
    CostAnomalies,
    CostCategoriesResponse,
    CostComparisonResponse,
    CostForecast,
    CostModelBreakdown,
    CostOperationBreakdown,
    CostRegionBreakdown,
    CostSummary,
    CostTagBreakdown,
    CostTrend,
    FinOpsDashboardSummary,
    ProviderConnectorsResponse,
    RightsizingResponse,
    RIPurchaseResponse,
    SavingsPlansPurchaseResponse,
    SavingsPlansUtilizationResponse,
    ServiceQuotasResponse,
    TagKeysResponse,
    TokenCostBreakdown,
    UsageBreakdown,
    UseCaseSpendResponse,
)
from services.govern_cost_service import GovernCostService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/cost", tags=["govern-cost"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_cost", region_scope.ACCOUNT_PINNED, prefix="/govern/cost")

_svc: Optional[GovernCostService] = None


def get_service() -> GovernCostService:
    global _svc
    if _svc is None:
        default_keys = [k.strip() for k in settings.GOVERN_COST_TAG_KEYS.split(",") if k.strip()]
        # Pinned, not governed: passing GOVERN_AWS_REGION here reads as "cost for that
        # region", which Cost Explorer cannot answer - it is one account-wide endpoint.
        # botocore currently redirects `ce` to us-east-1 on its own, so this is not a
        # behavior change; it is the region actually being talked to, stated in code
        # instead of left to a default that happens to line up.
        # The spend table gets its own region. `region` above is the Cost Explorer endpoint
        # (pinned to us-east-1); the spend store is an ordinary control-plane DynamoDB table
        # in AWS_REGION, so it resolves through table_region() like every other one. Passing
        # the CE region for both is what made /by-use-case fail with ResourceNotFoundException
        # against a table that exists.
        _svc = GovernCostService(
            region=region_config.resolve_service_region("ce", settings.GOVERN_AWS_REGION),
            default_tag_keys=default_keys,
            spend_table_name=settings.FINOPS_SPEND_TABLE_NAME,
            spend_table_region=region_config.table_region("FINOPS_SPEND"),
            # Third region, for the CloudWatch AWS/Bedrock* and Service Quotas reads. Passed
            # explicitly so the fleet queries follow GOVERN_AWS_REGION rather than inheriting
            # the Cost Explorer pin above.
            govern_region=settings.GOVERN_AWS_REGION,
        )
    return _svc


@router.get("/summary", response_model=CostSummary)
async def get_cost_summary(
    months: int = Query(default=6, ge=1, le=12, description="Trailing months to include"),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    ai_only: bool = Query(default=False, description="Filter to the AI/ML service footprint"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Total, by-service, and by-month AWS spend from Cost Explorer.

    Returns a `live=False` fallback (never 500s) when Cost Explorer is
    unreachable, so the FinOps surface can badge the source honestly.
    """
    return get_service().get_summary(months=months, months_offset=months_offset, ai_only=ai_only)


@router.get("/by-use-case", response_model=UseCaseSpendResponse)
async def get_cost_by_use_case(days: int = Query(default=30, ge=1, le=90), _=Depends(require_role(Role.VIEWER))):
    """Real per-use-case LLM spend (Build→FinOps loop) from the spend store."""
    return get_service().get_by_use_case(days=days)


@router.get("/provider-connectors", response_model=ProviderConnectorsResponse)
async def get_provider_connectors(_=Depends(require_role(Role.VIEWER))):
    """Cross-provider cost-connector status — honest connected-vs-not (AWS live, Azure/Vertex need connectors)."""
    return get_service().get_provider_connectors()


@router.get("/budgets", response_model=BudgetsResponse)
async def get_budgets(_=Depends(require_role(Role.VIEWER))):
    """Live AWS Budgets — real budget-vs-actual (honest empty when none defined)."""
    return get_service().get_budgets()


@router.get("/tag-keys", response_model=TagKeysResponse)
async def get_cost_tag_keys(_=Depends(require_role(Role.VIEWER))):
    """Cost-allocation tag keys the account offers (live-discovered, else configured)."""
    return get_service().list_tag_keys()


@router.get("/by-tag", response_model=CostTagBreakdown)
async def get_cost_by_tag(
    key: str = Query(default="business-unit", description="Tag key: business-unit | business-domain | agent | owner"),
    months: int = Query(default=6, ge=1, le=12),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """AWS cost grouped by a cost-allocation tag (reads back Plan's taxonomy)."""
    return get_service().get_by_tag(key=key, months=months, months_offset=months_offset)


@router.get("/by-model", response_model=CostModelBreakdown)
async def get_cost_by_model(
    months: int = Query(default=6, ge=1, le=12, description="Trailing months to include"),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bedrock spend broken out by model (from Cost Explorer USAGE_TYPE)."""
    return get_service().get_by_model(months=months, months_offset=months_offset)


@router.get("/trend", response_model=CostTrend)
async def get_cost_trend(days: int = Query(default=30, ge=7, le=90, description="Trailing days of daily spend"), _=Depends(require_role(Role.VIEWER))):
    """Daily unblended spend for the trailing window (30-day trend + velocity)."""
    return get_service().get_trend(days=days)


@router.get("/forecast", response_model=CostForecast)
async def get_cost_forecast(months: int = Query(default=3, ge=1, le=12, description="Forecast horizon in months"), _=Depends(require_role(Role.VIEWER))):
    """Forward AWS spend from Cost Explorer's own forecast model."""
    return get_service().get_forecast(months=months)


@router.get("/anomalies", response_model=CostAnomalies)
async def get_cost_anomalies(days: int = Query(default=60, ge=7, le=90, description="Trailing days to scan for anomalies"), _=Depends(require_role(Role.VIEWER))):
    """Real cost anomalies from AWS Cost Anomaly Detection."""
    return get_service().get_anomalies(days=days)


# ─── Enhanced Cost Explorer dimensions ───


@router.get("/by-region", response_model=CostRegionBreakdown)
async def get_cost_by_region(
    months: int = Query(default=6, ge=1, le=12),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """AWS spend by region from Cost Explorer, split governed vs ungoverned.

    Account-wide by construction (CE's REGION dimension), so this is the one Govern
    surface that already covers regions outside the governed set — and says how much
    money is out there.
    """
    return get_service().get_by_region(months=months, months_offset=months_offset)


@router.get("/by-operation", response_model=CostOperationBreakdown)
async def get_cost_by_operation(
    months: int = Query(default=6, ge=1, le=12),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bedrock cost by operation type (InvokeModel, streaming, etc.)."""
    return get_service().get_by_operation(months=months, months_offset=months_offset)


@router.get("/token-costs", response_model=TokenCostBreakdown)
async def get_token_costs(
    months: int = Query(default=6, ge=1, le=12),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bedrock cost split by input vs output tokens."""
    return get_service().get_token_costs(months=months, months_offset=months_offset)


@router.get("/agent-costs", response_model=AgentCostResponse)
async def get_agent_costs(
    months: int = Query(default=6, ge=1, le=12),
    months_offset: int = Query(
        default=0, ge=0, le=12,
        description=(
            "Shift the window back this many whole calendar months. 0 (default) ends the "
            "window at the first of NEXT month, so it includes the current partial month "
            "(months=1 is month-to-date). Use months=1 with months_offset=1 for the last "
            "COMPLETE calendar month, which was previously not expressible."
        ),
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Per-agent cost breakdown using tags and AgentCore runtime metrics."""
    return get_service().get_agent_costs(months=months, months_offset=months_offset)


@router.get("/commitment-coverage", response_model=CommitmentCoverage)
async def get_commitment_coverage(_=Depends(require_role(Role.VIEWER))):
    """Savings Plans + RI coverage for commitment planning."""
    return get_service().get_commitment_coverage()


@router.get("/usage-breakdown", response_model=UsageBreakdown)
async def get_usage_breakdown(
    months: int = Query(default=1, ge=1, le=6),
    _=Depends(require_role(Role.VIEWER)),
):
    """Detailed Bedrock usage with quantities from Cost Explorer."""
    return get_service().get_usage_breakdown(months=months)


@router.get("/anomaly-monitors", response_model=AnomalyMonitorsResponse)
async def get_anomaly_monitors(_=Depends(require_role(Role.VIEWER))):
    """List configured cost anomaly monitors."""
    return get_service().get_anomaly_monitors()


@router.get("/service-quotas", response_model=ServiceQuotasResponse)
async def get_service_quotas(
    service_code: str = Query(default="bedrock", description="Service code: bedrock, sagemaker, etc."),
    _=Depends(require_role(Role.VIEWER)),
):
    """Service quotas for Bedrock or other AI services."""
    return get_service().get_service_quotas(service_code=service_code)


@router.get("/bedrock-usage", response_model=BedrockUsageResponse)
async def get_bedrock_usage(
    days: int = Query(default=7, ge=1, le=30),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bedrock usage metrics from CloudWatch (invocations, tokens, latency)."""
    return get_service().get_bedrock_usage_metrics(days=days)


@router.get("/agentcore-costs", response_model=AgentCostResponse)
async def get_agentcore_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(require_role(Role.VIEWER)),
):
    """Per-agent cost attribution from CloudWatch AgentCore metrics + CE spend."""
    return get_service().get_agentcore_costs(days=days)


@router.get("/agent-forecast", response_model=AgentForecastResponse)
async def get_agent_forecast(
    lookback_days: int = Query(default=30, ge=7, le=90),
    forecast_months: int = Query(default=3, ge=1, le=12),
    _=Depends(require_role(Role.VIEWER)),
):
    """Per-agent cost forecast using historical trends + linear extrapolation."""
    return get_service().get_agent_forecast(lookback_days=lookback_days, forecast_months=forecast_months)


@router.get("/cost-comparison", response_model=CostComparisonResponse)
async def get_cost_comparison(
    base_months_ago: int = Query(default=1, ge=1, le=12, description="Compare to N months ago"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Cost comparison drivers - explains why costs changed month-over-month."""
    return get_service().get_cost_comparison(base_months_ago=base_months_ago)


@router.get("/rightsizing", response_model=RightsizingResponse)
async def get_rightsizing_recommendations(
    service: str = Query(default="AmazonEC2", description="Service to get recommendations for"),
    lookback: str = Query(default="FOURTEEN_DAYS", description="SEVEN_DAYS | FOURTEEN_DAYS | THIRTY_DAYS"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Rightsizing recommendations - find underutilized instances to save costs."""
    return get_service().get_rightsizing_recommendations(service=service, lookback=lookback)


@router.get("/dashboard-summary", response_model=FinOpsDashboardSummary)
async def get_dashboard_summary(
    _=Depends(require_role(Role.VIEWER)),
):
    """Fast-loading dashboard summary - key metrics in parallel for sub-second load."""
    return get_service().get_dashboard_summary()


@router.get("/service-quotas-lite", response_model=ServiceQuotasResponse)
async def get_service_quotas_lite(
    service_code: str = Query(default="bedrock"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Fast service quotas - top 10 most important quotas only (sub-second)."""
    return get_service().get_service_quotas_lite(service_code=service_code)


# ─── Savings Plans and RI Recommendations ───


@router.get("/savings-plans-recommendations", response_model=SavingsPlansPurchaseResponse)
async def get_savings_plans_recommendations(
    savings_plans_type: str = Query(default="COMPUTE_SP", description="COMPUTE_SP, EC2_INSTANCE_SP, or SAGEMAKER_SP"),
    term: str = Query(default="ONE_YEAR", description="ONE_YEAR or THREE_YEAR"),
    payment_option: str = Query(default="NO_UPFRONT", description="NO_UPFRONT, PARTIAL_UPFRONT, or ALL_UPFRONT"),
    lookback: str = Query(default="THIRTY_DAYS", description="SEVEN_DAYS, THIRTY_DAYS, or SIXTY_DAYS"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Savings Plans purchase recommendations from Cost Explorer."""
    return get_service().get_savings_plans_recommendations(
        savings_plans_type=savings_plans_type,
        term=term,
        payment_option=payment_option,
        lookback=lookback,
    )


@router.get("/savings-plans-utilization", response_model=SavingsPlansUtilizationResponse)
async def get_savings_plans_utilization(
    months: int = Query(default=1, ge=1, le=12),
    _=Depends(require_role(Role.VIEWER)),
):
    """Savings Plans utilization metrics from Cost Explorer."""
    return get_service().get_savings_plans_utilization(months=months)


@router.get("/ri-recommendations", response_model=RIPurchaseResponse)
async def get_ri_recommendations(
    service: str = Query(default="Amazon Elastic Compute Cloud - Compute", description="Service for RI recommendations"),
    term: str = Query(default="ONE_YEAR", description="ONE_YEAR or THREE_YEAR"),
    payment_option: str = Query(default="NO_UPFRONT", description="NO_UPFRONT, PARTIAL_UPFRONT, or ALL_UPFRONT"),
    lookback: str = Query(default="THIRTY_DAYS", description="SEVEN_DAYS, THIRTY_DAYS, or SIXTY_DAYS"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Reserved Instance purchase recommendations from Cost Explorer."""
    return get_service().get_ri_recommendations(
        service=service,
        term=term,
        payment_option=payment_option,
        lookback=lookback,
    )


@router.get("/cost-categories", response_model=CostCategoriesResponse)
async def get_cost_categories(
    _=Depends(require_role(Role.VIEWER)),
):
    """Cost categories defined in the account (for organizing cost allocation)."""
    return get_service().get_cost_categories()
