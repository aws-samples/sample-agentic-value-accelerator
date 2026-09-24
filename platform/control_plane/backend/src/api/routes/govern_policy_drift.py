"""Govern Policy Drift — API routes for policy-reality drift detection.

Provides endpoints to analyze and manage drift between harness policies
and actual CloudTrail activity.

All routes use RBAC: VIEWER for read operations, OPERATOR for mutations.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.rbac import Role, require_role
from models.govern_policy_drift import (
    DriftAnalysisResponse,
    DriftFindingsListResponse,
    DriftSeverity,
    DriftSummaryResponse,
    DriftType,
    PolicyDriftFinding,
    ResolveFindingRequest,
    WorstOffendersResponse,
)
from services.govern_policy_drift_service import GovernPolicyDriftService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/policy-drift", tags=["govern-policy-drift"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_policy_drift", region_scope.SINGLE_REGION, prefix="/govern/policy-drift")

_svc: Optional[GovernPolicyDriftService] = None


def get_service() -> GovernPolicyDriftService:
    global _svc
    if _svc is None:
        _svc = GovernPolicyDriftService()
    return _svc


@router.get("/analyze", response_model=DriftAnalysisResponse)
async def analyze_drift(
    hours: int = Query(24, ge=1, le=168, description="Hours of activity to analyze"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Analyze policy-reality drift.

    Compares CloudTrail AI-service activity against configured harness policies
    to detect tier violations, path violations, approval bypasses, and unknown
    harness activity.

    Args:
        hours: Number of hours of CloudTrail activity to analyze (1-168, default 24)

    Returns:
        DriftAnalysisResponse with findings, summary, and analysis metadata
    """
    return get_service().analyze_drift(hours)


@router.get("/summary", response_model=DriftSummaryResponse)
async def get_drift_summary(
    hours: int = Query(24, ge=1, le=168, description="Hours of activity to summarize"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get aggregated drift statistics.

    Returns summary counts by severity and type, compliance gap percentage,
    and worst offenders list.

    Args:
        hours: Number of hours of activity to summarize (1-168, default 24)

    Returns:
        DriftSummaryResponse with aggregated statistics
    """
    return get_service().get_drift_summary(hours)


@router.get("/findings", response_model=DriftFindingsListResponse)
async def list_findings(
    drift_type: Optional[DriftType] = Query(None, description="Filter by drift type"),
    severity: Optional[DriftSeverity] = Query(None, description="Filter by severity"),
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    limit: int = Query(100, ge=1, le=500, description="Maximum findings to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List drift findings with optional filters.

    Args:
        drift_type: Filter to specific drift type (tier_violation, path_violation, etc.)
        severity: Filter to specific severity level (critical, high, medium, low)
        resolved: Filter by resolved status (true/false/omit for all)
        limit: Maximum findings to return (1-500, default 100)

    Returns:
        DriftFindingsListResponse with filtered findings
    """
    return get_service().get_findings(drift_type, severity, resolved, limit)


@router.post("/findings/{finding_id}/resolve", response_model=PolicyDriftFinding)
async def resolve_finding(
    finding_id: str,
    request: Optional[ResolveFindingRequest] = None,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Mark a drift finding as resolved.

    Marks the finding as addressed, recording resolution timestamp and optional note.

    Args:
        finding_id: The finding ID to resolve
        request: Optional resolution details (note, resolved_by)

    Returns:
        Updated PolicyDriftFinding with resolution metadata
    """
    resolution_note = request.resolution_note if request else None
    result = get_service().resolve_finding(finding_id, resolution_note=resolution_note)

    if not result:
        raise HTTPException(status_code=404, detail=f"Finding not found: {finding_id}")

    return result


@router.get("/offenders", response_model=WorstOffendersResponse)
async def get_worst_offenders(
    hours: int = Query(24, ge=1, le=168, description="Hours of activity to analyze"),
    limit: int = Query(10, ge=1, le=50, description="Maximum offenders to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get worst offenders list.

    Returns identities/harnesses with the most drift findings, sorted by
    severity (critical first) then count.

    Args:
        hours: Number of hours of activity to analyze (1-168, default 24)
        limit: Maximum offenders to return (1-50, default 10)

    Returns:
        WorstOffendersResponse with ranked offenders list
    """
    return get_service().get_worst_offenders(hours, limit)
