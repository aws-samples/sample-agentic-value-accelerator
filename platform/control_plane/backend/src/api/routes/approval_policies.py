"""Approval Policies — HITL rule store.

Each policy declares "when someone tries `<action_pattern>` on
`<resource_pattern>`, require sign-off from `<required_role>` (× quorum)
within `<sla_hours>`". Policies are authored under Secure; the live queue
of requests they produce lives under Operate.

v1 scope:
  * DDB-backed CRUD (single-table, pk=policy_id).
  * Simple glob-style matcher (`*` wildcards) — not Cedar. Reserved for
    future when we integrate with Cedar Policy.
  * No enforcement wiring yet: existing routes (deploy, delete) do NOT
    consult these policies. UI carries an explicit "demo-only" banner.
"""

from __future__ import annotations

import fnmatch
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/approval-policies", tags=["approval-policies"])

_ddb = None


def _table():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.APPROVAL_POLICIES_TABLE_NAME
        )
    return _ddb


AVA_ROLES = ["ADMIN", "OPERATOR"]  # VIEWER can't approve anything

# Kinds of resources a policy can match. Kept small on purpose — the
# resource_pattern below narrows within a kind (e.g. kind=application,
# pattern=agent-safety). Adding a new kind here means the enforcement
# call-site knows to construct `{kind}:{id}` for its own resources.
RESOURCE_KINDS = ["application", "harness", "memory", "mcp", "a2a", "identity", "*"]

# Coarse action verbs. Enforcement code turns its own operation into one of
# these when checking a policy. Everything not listed here today is
# authored as `*` (matches anything).
ACTION_VERBS = ["deploy", "delete", "invoke", "update", "register", "*"]


class PolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    resource_kind: str = Field(..., description="One of: " + ", ".join(RESOURCE_KINDS))
    resource_pattern: str = Field(
        default="*",
        description="Glob within the kind. e.g. 'agent-safety' or 'prod-*' or '*'",
    )
    action_pattern: str = Field(
        default="*",
        description="Glob over action verb. e.g. 'deploy' or 'delete' or '*'",
    )
    required_role: str = Field(default="ADMIN", description="ADMIN | OPERATOR")
    quorum: int = Field(default=1, ge=1, le=5, description="Number of approvals needed")
    sla_hours: int = Field(default=24, ge=1, le=168, description="Auto-expire after N hours")


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    resource_kind: Optional[str] = None
    resource_pattern: Optional[str] = None
    action_pattern: Optional[str] = None
    required_role: Optional[str] = None
    quorum: Optional[int] = Field(default=None, ge=1, le=5)
    sla_hours: Optional[int] = Field(default=None, ge=1, le=168)
    status: Optional[str] = Field(default=None, description="active | disabled")


class PolicyMatchRequest(BaseModel):
    resource_kind: str
    resource_id: str
    action: str


@router.get("/reference")
async def get_reference(_=RBACDepends(require_role(Role.VIEWER))):
    """Enum data the wizard needs."""
    return {
        "resource_kinds": RESOURCE_KINDS,
        "action_verbs": ACTION_VERBS,
        "ava_roles": AVA_ROLES,
    }


@router.get("/list")
async def list_policies(_=RBACDepends(require_role(Role.VIEWER))):
    if not settings.APPROVAL_POLICIES_TABLE_NAME:
        return {"policies": [], "warning": "APPROVAL_POLICIES_TABLE_NAME not configured"}
    try:
        resp = _table().scan()
        return {"policies": resp.get("Items", []) or []}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{policy_id}")
async def get_policy(policy_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _table().get_item(Key={"policy_id": policy_id})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail=f"Approval policy {policy_id} not found")
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def create_policy(req: PolicyCreate, _=RBACDepends(require_role(Role.ADMIN))):
    if req.resource_kind not in RESOURCE_KINDS:
        raise HTTPException(status_code=400, detail=f"resource_kind must be one of {RESOURCE_KINDS}")
    if req.required_role not in AVA_ROLES:
        raise HTTPException(status_code=400, detail=f"required_role must be one of {AVA_ROLES}")
    if not settings.APPROVAL_POLICIES_TABLE_NAME:
        raise HTTPException(status_code=503, detail="APPROVAL_POLICIES_TABLE_NAME not configured")
    now = datetime.now(timezone.utc).isoformat()
    item: Dict[str, Any] = {
        "policy_id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "description": (req.description or "").strip(),
        "resource_kind": req.resource_kind,
        "resource_pattern": (req.resource_pattern or "*").strip(),
        "action_pattern": (req.action_pattern or "*").strip(),
        "required_role": req.required_role,
        "quorum": req.quorum,
        "sla_hours": req.sla_hours,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    try:
        _table().put_item(Item=item)
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{policy_id}")
async def update_policy(policy_id: str, req: PolicyUpdate, _=RBACDepends(require_role(Role.ADMIN))):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "resource_kind" in updates and updates["resource_kind"] not in RESOURCE_KINDS:
        raise HTTPException(status_code=400, detail=f"resource_kind must be one of {RESOURCE_KINDS}")
    if "required_role" in updates and updates["required_role"] not in AVA_ROLES:
        raise HTTPException(status_code=400, detail=f"required_role must be one of {AVA_ROLES}")
    if "status" in updates and updates["status"] not in ("active", "disabled"):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'disabled'")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    set_clause = ", ".join(f"#{k} = :{k}" for k in updates)
    try:
        resp = _table().update_item(
            Key={"policy_id": policy_id},
            UpdateExpression=f"SET {set_clause}",
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        return resp.get("Attributes") or {}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(policy_id: str, _=RBACDepends(require_role(Role.ADMIN))):
    try:
        _table().delete_item(Key={"policy_id": policy_id})
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/match")
async def match_policies(req: PolicyMatchRequest, _=RBACDepends(require_role(Role.VIEWER))):
    """Return every ACTIVE policy that matches (resource_kind, resource_id, action).

    Enforcement call-sites will use this to decide whether an operation is
    permitted immediately or must open a request. Kept as an explicit
    endpoint so it can be unit-tested and observed independently of the
    actions that consume it. NOT WIRED YET into deploy/delete handlers.
    """
    if not settings.APPROVAL_POLICIES_TABLE_NAME:
        return {"matches": []}
    try:
        resp = _table().scan()
        matches: List[Dict[str, Any]] = []
        for p in resp.get("Items", []) or []:
            if p.get("status") != "active":
                continue
            kind = p.get("resource_kind", "*")
            if kind not in ("*", req.resource_kind):
                continue
            if not fnmatch.fnmatchcase(req.resource_id, p.get("resource_pattern", "*")):
                continue
            if not fnmatch.fnmatchcase(req.action, p.get("action_pattern", "*")):
                continue
            matches.append(p)
        return {"matches": matches}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
