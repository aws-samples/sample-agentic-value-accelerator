"""Govern Validation Panel — Adversarial validation routes for harness governance.

RBAC:
    - VIEWER: Read panels and findings
    - OPERATOR: Create panels, submit findings
    - ADMIN: Finalize verdicts, delete panels
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_validation_panel import (
    ValidationPanel,
    ValidationPanelCreate,
    ValidationPanelFindingSubmit,
)
from services.govern_validation_service import GovernValidationService, PanelFinalizedError, UnknownCriterionError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/validation", tags=["govern-validation"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_validation", region_scope.CONTROL_PLANE, prefix="/govern/validation")

_svc: Optional[GovernValidationService] = None


def get_service() -> GovernValidationService:
    """Get or create the validation service singleton."""
    global _svc
    if _svc is None:
        _svc = GovernValidationService(
            table_name=settings.GOVERN_VALIDATION_PANEL_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


@router.post("/panels", response_model=ValidationPanel, status_code=201)
async def create_panel(
    req: ValidationPanelCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR))
):
    """Create a new validation panel for a target (harness action, code change, or policy change).

    Initializes with standard VVAH criteria weights:
    - Root Cause Analysis: 43% (critical)
    - Instance Coverage: 25%
    - No New Vulnerabilities: 19% (critical)
    - Best Practices: 14%

    The actor on every write in this file comes from the `x-user-email` header, or
    `"unknown"` when absent - `require_role` returns only a Role, never a principal.
    The previous literal "user" read like a real principal, so an adversarial-review
    record with no recorded reviewer looked fully attributed. Same header
    core/rbac.py:88 reads to decide the role.
    """
    return get_service().create_panel(req, created_by=x_user_email or "unknown")


@router.get("/panels", response_model=List[ValidationPanel])
async def list_panels(
    target_type: Optional[str] = Query(None, description="Filter by target type"),
    finalized_only: bool = Query(False, description="Only return finalized panels"),
    limit: int = Query(100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER))
):
    """List validation panels, optionally filtered by target type."""
    return get_service().list_panels(target_type=target_type, finalized_only=finalized_only, limit=limit)


@router.get("/panels/{panel_id}", response_model=ValidationPanel)
async def get_panel(
    panel_id: str,
    _=Depends(require_role(Role.VIEWER))
):
    """Get a validation panel by ID."""
    panel = get_service().get_panel(panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Validation panel not found")
    return panel


@router.post("/panels/{panel_id}/findings", response_model=ValidationPanel)
async def submit_finding(
    panel_id: str,
    req: ValidationPanelFindingSubmit,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR))
):
    """Submit a persona finding to a validation panel.

    Each persona (security_architect, penetration_tester, compliance_reviewer,
    cross_repo_analyzer) can submit one finding. Submitting again updates the
    existing finding.

    Cannot submit findings to finalized panels.
    """
    panel = get_service().submit_finding(
        panel_id, req, submitted_by=x_user_email or "unknown"
    )
    if not panel:
        raise HTTPException(status_code=404, detail="Validation panel not found")
    return panel


@router.post("/panels/{panel_id}/finalize", response_model=ValidationPanel)
async def finalize_panel(
    panel_id: str,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.ADMIN))
):
    """Calculate and finalize the verdict for a validation panel.

    Once finalized:
    - No further findings can be submitted
    - The weighted score and final verdict are locked
    - Critical gate results are recorded

    The verdict is determined by:
    1. All critical criteria must score >= 70 (gates)
    2. Weighted score from all criteria
    3. Persona verdict aggregation (confidence-weighted)
    """
    panel = get_service().calculate_verdict(
        panel_id, finalized_by=x_user_email or "unknown"
    )
    if not panel:
        raise HTTPException(status_code=404, detail="Validation panel not found")
    return panel


@router.put("/panels/{panel_id}/criteria/{criterion_name}", response_model=ValidationPanel)
async def update_criterion_score(
    panel_id: str,
    criterion_name: str,
    score: float = Query(..., ge=0.0, le=100.0),
    rationale: Optional[str] = Query(None, max_length=1000),
    _=Depends(require_role(Role.OPERATOR))
):
    """Manually update a criterion score before finalization.

    Useful for fine-tuning automated scores or adding manual assessment.
    Cannot modify finalized panels.
    """
    try:
        panel = get_service().update_criterion_score(panel_id, criterion_name, score, rationale)
    except PanelFinalizedError as e:
        # 409: the request is well-formed but conflicts with the panel's state. This used
        # to return 200 with the score still null, so a caller could not tell that the
        # write had been refused.
        raise HTTPException(status_code=409, detail=str(e))
    except UnknownCriterionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not panel:
        raise HTTPException(status_code=404, detail="Validation panel not found")
    return panel


@router.delete("/panels/{panel_id}", response_model=ValidationPanel)
async def delete_panel(
    panel_id: str,
    _=Depends(require_role(Role.ADMIN))
):
    """Delete a validation panel (admin only).

    A 503 here means the panel is still there. The service used to swallow a failed DynamoDB
    delete and return the panel body anyway, so this endpoint answered 200 for a delete that had
    not happened; it now raises, and that is translated rather than left to become a bare 500,
    so the response says which of the two it was.
    """
    try:
        panel = get_service().delete_panel(panel_id)
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Validation panel {panel_id} was NOT deleted - the store is unreachable: {e}",
        ) from e
    if not panel:
        raise HTTPException(status_code=404, detail="Validation panel not found")
    return panel
