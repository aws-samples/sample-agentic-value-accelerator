"""A2A Servers registry — backed by AWS Agent Registry (record type AGENT).

Aug 2026 migration: what used to live in DynamoDB (`a2a_agents`) now
lives as records in the AVA registry (AWS Agent Registry). Curated
reference A2A servers still ship as `data/a2a_curated.json`.

Response shape (`{agent_id, name, endpoint, ...}`) is preserved so the
frontend keeps working. `agent_id` now maps to the registry `recordId`.
Registration fetches the AgentCard from the endpoint's well-known URL
and stores it inside the record's `data` blob so consumers don't need to
issue a live fetch to know what the peer can do.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
from typing import Any, Dict, Optional
from urllib.parse import urljoin

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends, Header, HTTPException
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role
from services import agent_registry_client as reg
from services import approval_policy_engine as policy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/a2a", tags=["a2a"])


def _curated_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data",
        "a2a_curated.json",
    )


# ─── Shapes ─────────────────────────────────────────────────────────────────


class A2aAgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    endpoint: str = Field(..., min_length=8, description="Base URL for the A2A agent (agent_card at /.well-known/agent.json)")
    description: Optional[str] = None
    category: str = Field(default="custom")
    auth_hint: str = Field(default="none", description="none | api_key | oauth2 | bearer | sigv4")
    delegation_mode: str = Field(default="m2m", description="m2m | obo")
    source: str = Field(default="custom", description="custom | curated")
    curated_id: Optional[str] = None


class A2aAgentUpdate(BaseModel):
    name: Optional[str] = None
    endpoint: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    auth_hint: Optional[str] = None
    delegation_mode: Optional[str] = None


class AgentCardFetchRequest(BaseModel):
    endpoint: str = Field(..., min_length=8)


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
    """Translate an AWS Agent Registry record into the frontend's expected
    `{agent_id, name, endpoint, ...}` shape.

    The descriptor's `data` is the full A2A AgentCard JSON — AVA-specific
    extras (agent_card_url, curated_id, source, ...) are under
    `_meta.ava`. The card's own `url` is the effective endpoint.
    """
    descriptor = ((record.get("descriptors") or {}).get("a2aAgentCard") or {})
    card = descriptor.get("dataParsed") or {}
    ava = dict((card.get("_meta") or {}).get("ava") or {})
    data: Dict[str, Any] = {
        "agent_card_url": ava.get("agent_card_url") or card.get("url", ""),
        "auth_hint":      ava.get("auth_hint", "none"),
        "delegation_mode":ava.get("delegation_mode", "m2m"),
        "category":       ava.get("category", "custom"),
        "source":         ava.get("source", "custom"),
        "curated_id":     ava.get("curated_id"),
        "agent_card":     card,
        "description":    card.get("description", ""),
        "name":           card.get("name", ""),
    }
    status_upper = record.get("status", "")
    return {
        "agent_id":        record.get("recordId") or "",
        "record_arn":      record.get("recordArn") or "",
        "name":            record.get("displayName") or data.get("name") or record.get("name") or "",
        "endpoint":        data.get("agent_card_url", ""),
        "description":     record.get("description") or data.get("description", ""),
        "auth_hint":       data.get("auth_hint", "none"),
        "delegation_mode": data.get("delegation_mode", "m2m"),
        "category":        data.get("category", "custom"),
        "source":          data.get("source", "custom"),
        "curated_id":      data.get("curated_id"),
        "agent_card":      data.get("agent_card") or {},
        "status":          _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":      status_upper,
        "created_at":      record.get("createdAt") or "",
        "updated_at":      record.get("updatedAt") or "",
    }


def _fetch_agent_card(endpoint: str) -> tuple[str, Dict[str, Any]]:
    """Fetch the well-known AgentCard from an endpoint.

    Returns (resolved_url, parsed_card). Raises HTTPException(502) if the
    fetch or parse fails.
    """
    url = endpoint.rstrip("/")
    if not url.endswith("agent.json"):
        url = urljoin(url + "/", ".well-known/agent.json")
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = resp.read().decode("utf-8")
        return url, json.loads(body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch AgentCard from {url}: {e}")


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/curated")
async def list_curated(_=RBACDepends(require_role(Role.VIEWER))):
    """Reference A2A agents — demos + samples. Not vetted for production."""
    path = _curated_path()
    if not os.path.exists(path):
        return {"agents": [], "warning": f"a2a_curated.json not found at {path}"}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"failed to read a2a_curated.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_agents(_=RBACDepends(require_role(Role.VIEWER))):
    """Registered A2A servers — from AWS Agent Registry, record type AGENT."""
    if not reg._registry_id():
        return {
            "agents": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        # A2A servers and Agents both live under recordType=AGENT — the
        # `Kind` tag is what distinguishes them. Without this filter the
        # A2A page rendered every AGENT record (including Kind=agent
        # entries produced by Foundry deploys) and looked like it was
        # showing MCP servers to the user.
        records = reg.list_records(record_type="AGENT", tag_filter={"Kind": "a2a"})
        return {"agents": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list A2A records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_id}")
async def get_agent(agent_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(agent_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"A2A agent {agent_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-card")
async def fetch_agent_card(req: AgentCardFetchRequest, _=RBACDepends(require_role(Role.VIEWER))):
    """Fetch the well-known AgentCard so the Create form can preview it."""
    url, card = _fetch_agent_card(req.endpoint)
    return {"agent_card": card, "resolved_url": url}


@router.post("", status_code=201)
async def register_agent(
    req: A2aAgentCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    # VIEWER floor — the policy engine decides whether approval is needed.
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish an A2A server. Policy engine decides auto-approve vs. queue vs. deny."""
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish A2A records until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="a2a", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies A2A registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    # Fetch the AgentCard once — the record carries it inline so downstream
    # consumers don't need to hit the endpoint again for capabilities.
    try:
        resolved_url, card = _fetch_agent_card(req.endpoint)
    except HTTPException as e:
        logger.warning(f"AgentCard fetch during register failed: {e.detail}")
        resolved_url = req.endpoint.strip()
        card = {}

    try:
        record = reg.publish_a2a_server(
            display_name=req.name.strip(),
            agent_card_url=resolved_url,
            agent_card=card,
            description=(req.description or "").strip(),
            curated_id=req.curated_id,
            extra={
                "category":        req.category,
                "auth_hint":       req.auth_hint,
                "delegation_mode": req.delegation_mode,
                "source":          req.source,
            },
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"publish_a2a_server failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("publish_a2a_server unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="a2a",
            requested_by=x_user_email or "unknown",
            justification=f"Register A2A server '{req.name.strip()}' at {req.endpoint.strip()}",
            verdict=verdict,
        )
    return _to_ui(record)


@router.patch("/{agent_id}")
async def update_agent(agent_id: str, req: A2aAgentUpdate, _=RBACDepends(require_role(Role.OPERATOR))):
    """Update mutable fields on an A2A record.

    Endpoint change re-fetches the AgentCard so the stored `data.agent_card`
    stays in sync with the peer's current capabilities.
    """
    try:
        current = reg.get_record(agent_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"A2A agent {agent_id} not found")
        raise HTTPException(status_code=500, detail=str(e))

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    descriptor = (current.get("descriptors") or {}).get("a2aAgentCard") or {}
    data = dict(descriptor.get("dataParsed") or {})

    if "endpoint" in updates:
        try:
            resolved_url, card = _fetch_agent_card(updates["endpoint"])
            data["agent_card_url"] = resolved_url
            data["agent_card"] = card
        except HTTPException:
            data["agent_card_url"] = updates["endpoint"]
    for k in ("auth_hint", "delegation_mode", "category", "description"):
        if k in updates:
            data[k] = updates[k]
    if "name" in updates:
        data["name"] = updates["name"]

    from services.agent_registry_client import control_client, _registry_id
    import json as _json
    kwargs: Dict[str, Any] = {
        "registryId": _registry_id(),
        "recordId": agent_id,
        "descriptors": {
            "optionalValue": {
                "a2aAgentCard": {
                    "data": _json.dumps(data),
                    "dataSchemaVersion": "1.0",
                }
            }
        },
    }
    if "name" in updates:
        kwargs["displayName"] = {"optionalValue": updates["name"]}
    if "description" in updates:
        kwargs["description"] = {"optionalValue": updates["description"]}
    try:
        control_client().update_registry_record(**kwargs)
        return _to_ui(reg.get_record(agent_id))
    except ClientError as e:
        logger.error(f"update A2A record failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Deprecate the A2A record (soft delete)."""
    try:
        reg.deprecate(agent_id, reason="Deprecated via AVA A2A Servers page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
