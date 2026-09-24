"""Govern X-Ray - distributed tracing for agent observability."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_xray import (
    ServiceGraphResponse,
    TraceDetail,
    TraceSummaryResponse,
)
from services.govern_xray_service import GovernXRayService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/xray", tags=["govern-xray"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_xray", region_scope.SINGLE_REGION, prefix="/govern/xray")

_svc: Optional[GovernXRayService] = None


def get_service() -> GovernXRayService:
    global _svc
    if _svc is None:
        _svc = GovernXRayService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/traces", response_model=TraceSummaryResponse)
async def get_trace_summaries(
    hours: int = Query(1, ge=1, le=24, description="Hours of trace history to fetch"),
    filter_expression: Optional[str] = Query(
        None, description="X-Ray filter expression"
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get recent trace summaries for agent invocations."""
    return get_service().get_trace_summaries(hours=hours, filter_expression=filter_expression)


@router.get("/service-graph", response_model=ServiceGraphResponse)
async def get_service_graph(
    hours: int = Query(1, ge=1, le=24, description="Hours of data for service graph"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get the service graph showing agent dependencies."""
    return get_service().get_service_graph(hours=hours)


@router.get("/traces/detail", response_model=List[TraceDetail])
async def get_trace_details(
    trace_ids: str = Query(..., description="Comma-separated trace IDs"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get detailed trace information for specific trace IDs."""
    ids = [tid.strip() for tid in trace_ids.split(",") if tid.strip()]
    return get_service().get_trace_details(ids)
