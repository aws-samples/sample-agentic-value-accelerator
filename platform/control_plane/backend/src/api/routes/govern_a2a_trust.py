"""Govern A2A Trust — agent-to-agent delegation authorization routes.

Trust-policy + agent-identity CRUD, the differentiator POST /evaluate (autonomy
ceiling), and GET /policies/{id}/cedar (the bridge to AgentCore enforcement).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.rbac import Role, require_role
from models.govern_a2a_trust import (
    AgentIdentity,
    AgentIdentityCreate,
    DelegationDecision,
    DelegationRequest,
    TrustPolicy,
    TrustPolicyCreate,
    TrustPolicyUpdate,
)
from services.govern_audit_service import GovernAuditService
from services.govern_a2a_trust_service import GovernA2ATrustService

logger = logging.getLogger(__name__)
# Bug-bounty fix: apply router-level RBAC so unauthenticated callers cannot
# read or mutate governance records. Requires the caller's Cognito id_token to
# resolve to at least VIEWER — matches every other CP router.
router = APIRouter(prefix="/govern/a2a-trust", tags=["govern-a2a-trust"])

_svc: Optional[GovernA2ATrustService] = None


def get_service() -> GovernA2ATrustService:
    global _svc
    if _svc is None:
        audit = GovernAuditService(table_name=settings.GOVERN_AUDIT_TABLE_NAME, region=settings.AWS_REGION)
        _svc = GovernA2ATrustService(
            table_name=settings.GOVERN_A2A_TRUST_TABLE_NAME, audit_service=audit, region=settings.AWS_REGION,
        )
    return _svc


# --- Trust policies ---

@router.post("/policies", response_model=TrustPolicy, status_code=201)
async def create_policy(req: TrustPolicyCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().create_policy(req)


@router.get("/policies", response_model=List[TrustPolicy])
async def list_policies(_=Depends(require_role(Role.VIEWER))):
    return get_service().list_policies()


@router.get("/policies/{policy_id}", response_model=TrustPolicy)
async def get_policy(policy_id: str, _=Depends(require_role(Role.VIEWER))):
    p = get_service().get_policy(policy_id)
    if not p:
        raise HTTPException(status_code=404, detail="Trust policy not found")
    return p


@router.put("/policies/{policy_id}", response_model=TrustPolicy)
async def update_policy(policy_id: str, req: TrustPolicyUpdate, _=Depends(require_role(Role.OPERATOR))):
    p = get_service().update_policy(policy_id, req)
    if not p:
        raise HTTPException(status_code=404, detail="Trust policy not found")
    return p


@router.delete("/policies/{policy_id}", response_model=TrustPolicy)
async def delete_policy(policy_id: str, _=Depends(require_role(Role.OPERATOR))):
    p = get_service().delete_policy(policy_id)
    if not p:
        raise HTTPException(status_code=404, detail="Trust policy not found")
    return p


@router.get("/policies/{policy_id}/cedar")
async def export_cedar(policy_id: str, _=Depends(require_role(Role.VIEWER))):
    cedar = get_service().export_cedar(policy_id)
    if cedar is None:
        raise HTTPException(status_code=404, detail="Trust policy not found")
    return {"policy_id": policy_id, "cedar": cedar}


# --- Agent identities ---

@router.post("/identities", response_model=AgentIdentity, status_code=201)
async def upsert_identity(req: AgentIdentityCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().upsert_identity(req)


@router.get("/identities", response_model=List[AgentIdentity])
async def list_identities(_=Depends(require_role(Role.VIEWER))):
    return get_service().list_identities()


# --- The differentiator ---

@router.post("/evaluate", response_model=DelegationDecision)
async def evaluate(req: DelegationRequest, _=Depends(require_role(Role.OPERATOR))):
    return get_service().evaluate(req)
