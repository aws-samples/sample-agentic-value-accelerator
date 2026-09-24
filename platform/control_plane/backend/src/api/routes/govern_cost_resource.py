"""Govern Cost by Resource — per-RESOURCE AI spend for per-agent FinOps attribution.

Read-through GET route (no CRUD): AWS Cost Explorer resource-level data
(`ce:GetCostAndUsageWithResources`) is the source of truth. Follows the govern
slice route pattern — a lazy service singleton reading settings, RBAC-gated to
VIEWER, and honest about liveness (never fabricates spend).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_cost_resource_service import (
    GovernCostResourceService,
    ResourceCostResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/cost", tags=["govern-cost"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_cost_resource", region_scope.SINGLE_REGION, prefix="/govern/cost")

_svc: Optional[GovernCostResourceService] = None


def get_service() -> GovernCostResourceService:
    global _svc
    if _svc is None:
        _svc = GovernCostResourceService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/by-resource", response_model=ResourceCostResponse)
async def get_cost_by_resource(
    days: int = Query(
        default=14, ge=1, le=14,
        description="Trailing days (<=14, the resource-level Cost Explorer maximum lookback)",
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Per-RESOURCE Bedrock AI spend from Cost Explorer resource-level data.

    Groups UnblendedCost by RESOURCE_ID (filtered to the Bedrock footprint) over the
    trailing window, so FinOps can attribute AI cost down to individual agents/resources.
    Honest-degrades to `live=false` with a clear note when resource-level granularity
    isn't enabled in Cost Explorer (or the API is unavailable / not permitted).
    """
    return get_service().get_by_resource(days=days)
