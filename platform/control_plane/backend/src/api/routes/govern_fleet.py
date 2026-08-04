"""Govern Fleet — Server-side aggregation endpoints for 10k+ agent fleet scaling.

Pre-aggregated rollups so the frontend never fetches raw agent lists at scale.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_fleet import (
    FleetExceptionsResponse,
    FleetInventoryResponse,
    FleetSegmentsResponse,
    FleetSummaryResponse,
)
from services.govern_fleet_service import GovernFleetService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/fleet", tags=["govern-fleet"])

_svc: Optional[GovernFleetService] = None


def get_service() -> GovernFleetService:
    global _svc
    if _svc is None:
        _svc = GovernFleetService(region=settings.AWS_REGION)
    return _svc


@router.get("/summary", response_model=FleetSummaryResponse)
async def get_fleet_summary(_=Depends(require_role(Role.VIEWER))):
    """Pre-aggregated fleet summary (governance, risk, scope distributions).

    Returns counts and percentages only — never raw agent lists. Use this for
    the summary-first hero display at any fleet size.
    """
    return get_service().get_summary()


@router.get("/segments", response_model=FleetSegmentsResponse)
async def get_fleet_segments(
    group_by: str = Query(
        default="businessUnit",
        regex="^(businessUnit|provider|environment)$",
        description="Grouping dimension for segment rollups",
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Segment rollups by business unit, provider, or environment.

    Used for the compliance heatmap (segment × scope level × % compliant).
    """
    return get_service().get_segments(group_by=group_by)


@router.get("/exceptions", response_model=FleetExceptionsResponse)
async def get_fleet_exceptions(
    limit: int = Query(default=100, ge=1, le=500, description="Max agents to return"),
    filter_key: Optional[str] = Query(default=None, description="Filter by business unit"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bounded exception queue — top N agents needing attention.

    Sorted by attention score (governance status + risk + scope + incidents).
    Even at 100k agents, this returns at most `limit` agents.
    """
    return get_service().get_exceptions(limit=limit, filter_key=filter_key)


@router.get("/inventory", response_model=FleetInventoryResponse)
async def get_fleet_inventory(_=Depends(require_role(Role.VIEWER))):
    """Inventory breakdown by model and provider.

    Used for the registry-lens view (what's deployed, by count and percentage).
    """
    return get_service().get_inventory()
