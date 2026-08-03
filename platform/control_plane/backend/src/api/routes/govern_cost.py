"""Govern Cost — real AWS spend for the FinOps surface, via Cost Explorer.

Read-through GET routes (no CRUD): Cost Explorer is the source of truth. Follows
the govern slice route pattern — lazy service singleton reading settings.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_cost import BudgetsResponse, CostAnomalies, CostForecast, CostModelBreakdown, CostSummary, CostTagBreakdown, CostTrend, ProviderConnectorsResponse, TagKeysResponse, UseCaseSpendResponse
from services.govern_cost_service import GovernCostService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/cost", tags=["govern-cost"])

_svc: Optional[GovernCostService] = None


def get_service() -> GovernCostService:
    global _svc
    if _svc is None:
        default_keys = [k.strip() for k in settings.GOVERN_COST_TAG_KEYS.split(",") if k.strip()]
        _svc = GovernCostService(
            region=settings.AWS_REGION,
            default_tag_keys=default_keys,
            spend_table_name=settings.FINOPS_SPEND_TABLE_NAME,
        )
    return _svc


@router.get("/summary", response_model=CostSummary)
async def get_cost_summary(
    months: int = Query(default=6, ge=1, le=12, description="Trailing months to include"),
    ai_only: bool = Query(default=False, description="Filter to the AI/ML service footprint"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Total, by-service, and by-month AWS spend from Cost Explorer.

    Returns a `live=False` fallback (never 500s) when Cost Explorer is
    unreachable, so the FinOps surface can badge the source honestly.
    """
    return get_service().get_summary(months=months, ai_only=ai_only)


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
    _=Depends(require_role(Role.VIEWER)),
):
    """AWS cost grouped by a cost-allocation tag (reads back Plan's taxonomy)."""
    return get_service().get_by_tag(key=key, months=months)


@router.get("/by-model", response_model=CostModelBreakdown)
async def get_cost_by_model(months: int = Query(default=6, ge=1, le=12, description="Trailing months to include"), _=Depends(require_role(Role.VIEWER))):
    """Bedrock spend broken out by model (from Cost Explorer USAGE_TYPE)."""
    return get_service().get_by_model(months=months)


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
