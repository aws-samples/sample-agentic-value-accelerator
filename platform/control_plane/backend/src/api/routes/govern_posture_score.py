"""Govern Posture Score — API routes for governance posture scoring.

Provides endpoints to retrieve the overall governance health metric:
- GET /govern/posture-score/score — current posture score (VIEWER)
- GET /govern/posture-score/dimensions — detailed breakdown (VIEWER)
- GET /govern/posture-score/dimensions/{dimension} — single dimension detail (VIEWER)
- GET /govern/posture-score/recommendations — improvement actions (VIEWER)
- GET /govern/posture-score/history — trend data (VIEWER)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_posture_score import (
    DimensionScore,
    PostureDimension,
    PostureHistoryResponse,
    PostureRecommendationsResponse,
    PostureScore,
)
from services.govern_posture_score_service import GovernPostureScoreService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/posture-score", tags=["govern-posture-score"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_posture_score", region_scope.SINGLE_REGION, prefix="/govern/posture-score")

_svc: Optional[GovernPostureScoreService] = None


def get_service() -> GovernPostureScoreService:
    """Lazy-load the posture score service."""
    global _svc
    if _svc is None:
        _svc = GovernPostureScoreService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/score", response_model=PostureScore)
async def get_posture_score(_=Depends(require_role(Role.VIEWER))):
    """Get the current governance posture score.

    Returns the overall score (0-100), letter grade (A/B/C/D/F), dimensional
    breakdown, and trend information. Score is cached for 5 minutes.

    The score aggregates six governance dimensions:
    - Policy Coverage (25%): % of harnesses with policies
    - Kill-Switch Readiness (15%): Emergency shutoff configured
    - Audit Completeness (20%): % of runs with audit artifacts
    - Incident Response (15%): % of recorded incidents and SLA breaches that were
      responded to - moved out of OPEN, acknowledged, or resolved. Response, NOT
      timeliness: this said "% of incidents handled within SLA", which described a
      measurement this system has never been able to make. Nothing stores an
      incident-response SLA (SLATarget covers availability / latency / error_rate /
      throughput only), so "within SLA" had no target to compare against. The claim was
      already dropped from DIMENSION_CONFIG[INCIDENT_RESPONSE] and from
      _calc_incident_response; this docstring was the last copy still asserting it, and
      it is the copy that reaches callers through the OpenAPI schema.
    - Validation Coverage (15%): % of high-risk ops with panel review
    - Detection Breadth (10%): Multi-source detection active

    A dimension that could not be computed is scored `null` with an `unscored_reason`
    rather than a midpoint, and `overall_score` is renormalised over the dimensions that
    did produce one - see `measured_weight_pct` and `live_weight_pct` on the response.
    """
    return get_service().calculate_posture()


@router.get("/dimensions", response_model=list[DimensionScore])
async def get_all_dimensions(_=Depends(require_role(Role.VIEWER))):
    """Get detailed breakdown of all governance dimensions.

    Returns all six dimensions with their individual scores, findings,
    and recommendations.
    """
    posture = get_service().calculate_posture()
    return posture.dimensions


@router.get("/dimensions/{dimension}", response_model=DimensionScore)
async def get_dimension_detail(
    dimension: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get detailed information about a specific dimension.

    Args:
        dimension: Dimension name (policy_coverage, killswitch_ready,
                   audit_completeness, incident_response, validation_coverage,
                   detection_breadth)

    Returns:
        Detailed dimension score with findings and recommendations.
    """
    try:
        dim_enum = PostureDimension(dimension)
    except ValueError:
        valid_dims = [d.value for d in PostureDimension]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dimension '{dimension}'. Valid dimensions: {valid_dims}",
        )

    return get_service().get_dimension_details(dim_enum)


@router.get("/recommendations", response_model=PostureRecommendationsResponse)
async def get_recommendations(_=Depends(require_role(Role.VIEWER))):
    """Get prioritized recommendations to improve the posture score.

    Returns up to 10 prioritized actions with estimated impact on
    both individual dimensions and overall score.
    """
    return get_service().get_recommendations()


@router.get("/history", response_model=PostureHistoryResponse)
async def get_history(
    days: int = Query(default=30, ge=1, le=90, description="Number of days of history"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get posture score history for trend analysis.

    Args:
        days: Number of days of history to retrieve (1-90, default 30)

    Returns:
        Historical entries with trend analysis.
    """
    return get_service().get_history(days=days)
