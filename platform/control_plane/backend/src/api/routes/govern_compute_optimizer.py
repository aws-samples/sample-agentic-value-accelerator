"""Govern Compute Optimizer — AWS Compute Optimizer right-sizing, read-through GET route.

Feeds the FinOps optimization (right-sizing savings) view with live over/under-provisioned
and idle counts plus the estimated monthly/annual savings opportunity, sourced straight from
AWS Compute Optimizer. Single region (the primary governed region, settings.GOVERN_AWS_REGION);
honest-degrades to live=false with enrollment guidance when Compute Optimizer is not enrolled
(status != 'Active') or not permitted.
"""

import logging

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_compute_optimizer_service import (
    ComputeOptimizerSummaryResponse,
    GovernComputeOptimizerService,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/compute-optimizer", tags=["govern-compute-optimizer"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_compute_optimizer", region_scope.SINGLE_REGION, prefix="/govern/compute-optimizer")

# One cached service instance per region (preserves its internal TTL cache).
_svcs: dict[str, GovernComputeOptimizerService] = {}


def _svc() -> GovernComputeOptimizerService:
    region = settings.GOVERN_AWS_REGION
    if region not in _svcs:
        _svcs[region] = GovernComputeOptimizerService(region=region)
    return _svcs[region]


@router.get("/summary", response_model=ComputeOptimizerSummaryResponse)
async def get_compute_optimizer_summary(_=Depends(require_role(Role.VIEWER))):
    """Live Compute Optimizer right-sizing summary: over/under-provisioned + idle counts,
    per-resource-type breakdown, and estimated monthly/annual savings opportunity.
    Honest-degrades when Compute Optimizer is not enrolled (status != Active) or not permitted."""
    return _svc().get_summary()
