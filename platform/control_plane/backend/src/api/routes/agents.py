"""Agents registry — backed by AWS Agent Registry (record type AGENT, tag Kind=agent).

Sibling of `a2a.py`. Both routes write records with `recordType=AGENT`
in the AVA registry, but they use different `Kind` tags to distinguish
UX-visible categories:

  * A2A Servers  → tag Kind=a2a   — A2A-protocol peers with an
                    AgentCard at /.well-known/agent.json (Agent-to-
                    Agent protocol).
  * Agents       → tag Kind=agent — anything else callable — Bedrock
                    AgentCore Runtime agents, Kiro / DevOps / Security
                    frontier agents, deployed harnesses registered as
                    peers. No AgentCard requirement; runtime_ref points
                    at whatever endpoint or runtime ARN the caller uses.

Data blob (`descriptors.custom.data`) shape:
  {
    "name":        display_name,
    "runtime":     "bedrock-agentcore-runtime" | "openai-compat" | "custom" | ...,
    "runtime_ref": ARN / URL / opaque identifier,
    "capabilities": ["capA", "capB"],
    "auth_hint":    "none" | "aws-sigv4" | "oauth2" | "bearer" | "api-key",
    "description":  string,
    "curated_id":   optional back-ref to agents_curated.json entry,
  }

Response shape mirrors a2a.py's — the frontend consumes both list
endpoints the same way.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends, Header, HTTPException
from pydantic import BaseModel, Field

from core.rbac import Role, require_role
from services import agent_registry_client as reg
from services import approval_policy_engine as policy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


def _curated_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data",
        "agents_curated.json",
    )


# ─── Shapes ─────────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    runtime: str = Field(
        default="bedrock-agentcore-runtime",
        description="Runtime kind — bedrock-agentcore-runtime | bedrock-agentcore-harness | openai-compat | custom",
    )
    runtime_ref: str = Field(..., min_length=4, description="Endpoint URL, runtime ARN, or opaque runtime identifier")
    description: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list, description="Free-form capability tags")
    auth_hint: str = Field(default="none", description="none | aws-sigv4 | oauth2 | bearer | api-key")
    category: str = Field(default="custom")
    source: str = Field(default="custom", description="custom | curated")
    curated_id: Optional[str] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    runtime: Optional[str] = None
    runtime_ref: Optional[str] = None
    description: Optional[str] = None
    capabilities: Optional[List[str]] = None
    auth_hint: Optional[str] = None
    category: Optional[str] = None


_STATUS_MAP: Dict[str, str] = {
    "APPROVED":         "active",
    "PENDING_APPROVAL": "pending",
    "DRAFT":            "pending",
    "REJECTED":         "rejected",
    "DEPRECATED":       "deprecated",
    "CREATING":         "pending",
    "UPDATING":         "pending",
    "CREATE_FAILED":    "failed",
    "UPDATE_FAILED":    "failed",
}


def _to_ui(record: Dict[str, Any]) -> Dict[str, Any]:
    """Translate a registry record into the frontend shape.

    Data blob lives under `descriptors.custom.data` (Agents don't have
    the a2aAgentCard descriptor — they aren't A2A protocol). We use the
    `custom` descriptor for the generic-agent case.
    """
    descriptor = ((record.get("descriptors") or {}).get("custom") or {})
    data = descriptor.get("dataParsed") or {}
    status_upper = record.get("status", "")
    return {
        "agent_id":     record.get("recordId") or "",
        "record_arn":   record.get("recordArn") or "",
        "name":         record.get("displayName") or data.get("name") or record.get("name") or "",
        "runtime":      data.get("runtime", ""),
        "runtime_ref":  data.get("runtime_ref", ""),
        "description":  record.get("description") or data.get("description", ""),
        "capabilities": data.get("capabilities") or [],
        "auth_hint":    data.get("auth_hint", "none"),
        "category":     data.get("category", "custom"),
        "source":       data.get("source", "custom"),
        "curated_id":   data.get("curated_id"),
        "status":       _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":   status_upper,
        "created_at":   record.get("createdAt") or "",
        "updated_at":   record.get("updatedAt") or "",
    }


# ─── Routes ─────────────────────────────────────────────────────────────


@router.get("/curated")
async def list_curated(_=RBACDepends(require_role(Role.VIEWER))):
    """Reference Agents — official AWS frontier agents + sample FSI patterns."""
    path = _curated_path()
    if not os.path.exists(path):
        return {"agents": [], "warning": f"agents_curated.json not found at {path}"}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"failed to read agents_curated.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_agents(_=RBACDepends(require_role(Role.VIEWER))):
    """Registered Agents — AGENT records tagged Kind=agent (NOT a2a)."""
    if not reg._registry_id():
        return {
            "agents": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        records = reg.list_records(record_type="AGENT", tag_filter={"Kind": "agent"})
        return {"agents": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list Agents records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_id}")
async def get_agent(agent_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(agent_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def register_agent(
    req: AgentCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish an Agent. Policy engine decides auto-approve vs. queue vs. deny."""
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish Agents until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="agent", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies Agent registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    # Publish as recordType=AGENT with tag Kind=agent. Uses `custom`
    # descriptor because Agents don't require an A2A AgentCard.
    data_payload = {
        "name":         req.name.strip(),
        "runtime":      req.runtime,
        "runtime_ref":  req.runtime_ref.strip(),
        "capabilities": req.capabilities or [],
        "auth_hint":    req.auth_hint,
        "category":     req.category,
        "source":       req.source,
        "description":  (req.description or "").strip(),
    }
    if req.curated_id:
        data_payload["curated_id"] = req.curated_id

    try:
        record = reg.create_record(
            kind="agent",
            record_type="AGENT",
            descriptor_key="custom",
            display_name=req.name.strip(),
            description=(req.description or "").strip(),
            data_payload=data_payload,
            tags={"Kind": "agent"},  # distinguish from A2A (Kind=a2a)
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"create Agents record failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("create Agents record unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="agent",
            requested_by=x_user_email or "unknown",
            justification=f"Register Agent '{req.name.strip()}' → {req.runtime}:{req.runtime_ref.strip()}",
            verdict=verdict,
        )
    return _to_ui(record)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Soft-delete (DEPRECATED) — keeps the audit trail."""
    try:
        reg.deprecate(agent_id, reason="Deprecated via AVA Registry → Agents page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
