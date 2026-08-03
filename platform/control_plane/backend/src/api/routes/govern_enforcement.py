"""Govern Enforcement — runtime allow/pause/deny decision point routes.

POST /evaluate is the PDP (dry_run writes nothing). GET /gate exposes the
autonomy-ladder matrix (the hero artifact). Decisions are append-only; policies
are CRUD. Honest seam: advisory locally, blocking at a live agent intercept.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.config import settings
from core.rbac import Role, require_role
from models.govern_enforcement import (
    AUTONOMY_GATE,
    EnforcementDecision,
    EnforcementMode,
    EnforcementPolicy,
    EnforcementPolicyCreate,
    EnforcementRequest,
)
from services.govern_audit_service import GovernAuditService
from services.govern_enforcement_service import GovernEnforcementService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/enforcement", tags=["govern-enforcement"])

_svc: Optional[GovernEnforcementService] = None


def get_service() -> GovernEnforcementService:
    global _svc
    if _svc is None:
        audit = GovernAuditService(table_name=settings.GOVERN_AUDIT_TABLE_NAME, region=settings.AWS_REGION)
        _svc = GovernEnforcementService(
            table_name=settings.GOVERN_ENFORCEMENT_TABLE_NAME, audit_service=audit, region=settings.AWS_REGION,
        )
    return _svc


@router.get("/gate")
async def get_gate(_=Depends(require_role(Role.VIEWER))):
    """The autonomy-ladder gate matrix: scope_level x action_type x risk_tier ->
    default disposition. The standout artifact — nobody else ships this."""
    return {"gate": AUTONOMY_GATE, "legend": {"allow": "no human needed", "pause": "route to human handoff", "deny": "not permitted at this scope"}}


@router.post("/evaluate", response_model=EnforcementDecision)
async def evaluate(req: EnforcementRequest, dry_run: bool = Query(default=False), mode: str = Query(default="advisory"), _=Depends(require_role(Role.OPERATOR))):
    try:
        m = EnforcementMode(mode)
    except ValueError:
        raise HTTPException(status_code=422, detail="mode must be 'advisory' or 'blocking'")
    return get_service().evaluate(req, mode=m, dry_run=dry_run)


@router.get("/decisions", response_model=List[EnforcementDecision])
async def list_decisions(agent_id: Optional[str] = Query(default=None), limit: int = Query(default=200, ge=1, le=1000), _=Depends(require_role(Role.VIEWER))):
    return get_service().list_decisions(agent_id=agent_id, limit=limit)


class LinkResolutionRequest(BaseModel):
    handoff_id: Optional[str] = None
    resolved_decision_id: Optional[str] = None


@router.post("/decisions/{decision_id}/link")
async def link_resolution(decision_id: str, req: LinkResolutionRequest, _=Depends(require_role(Role.OPERATOR))):
    get_service().link_resolution(decision_id, req.handoff_id, req.resolved_decision_id)
    return {"linked": decision_id, "handoff_id": req.handoff_id, "resolved_decision_id": req.resolved_decision_id}


@router.post("/policies", response_model=EnforcementPolicy, status_code=201)
async def create_policy(req: EnforcementPolicyCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().create_policy(req)


@router.get("/policies", response_model=List[EnforcementPolicy])
async def list_policies(_=Depends(require_role(Role.VIEWER))):
    return get_service().list_policies()


@router.get("/policies/{policy_id}", response_model=EnforcementPolicy)
async def get_policy(policy_id: str, _=Depends(require_role(Role.VIEWER))):
    p = get_service().get_policy(policy_id)
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    return p


@router.delete("/policies/{policy_id}", response_model=EnforcementPolicy)
async def delete_policy(policy_id: str, _=Depends(require_role(Role.OPERATOR))):
    p = get_service().delete_policy(policy_id)
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    return p
