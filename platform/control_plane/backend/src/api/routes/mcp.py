"""MCP Servers registry — backed by AWS Agent Registry (record type MCP).

Aug 2026 migration: what used to live in DynamoDB (single-table
`mcp_servers`) now lives as records in the AVA registry (AWS Agent
Registry). Curated well-known servers still ship as a JSON blob from
`data/mcp_curated.json` — those are UI convenience cards, not registry
records, and remain unchanged.

Response shape (`{server_id, name, url, ...}`) is preserved so the
frontend keeps working. `server_id` now maps to the registry `recordId`
(1:1), and status values map from AWS Agent Registry's approval statuses
(DRAFT / PENDING_APPROVAL / APPROVED / REJECTED / DEPRECATED) into a
simplified `active|pending|rejected|deprecated` for the UI.

Approval flow: every registration goes to PENDING_APPROVAL and creates
an Approval Queue row. Operators approve via Operate → Approval Queue.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends, Header, HTTPException
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role
from services import agent_registry_client as reg
from services import approval_policy_engine as policy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp", tags=["mcp"])


def _curated_path() -> str:
    """Locate the curated JSON — packaged under src/data at container root."""
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data",
        "mcp_curated.json",
    )


# ─── Shapes ─────────────────────────────────────────────────────────────────


class McpServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=8)
    description: Optional[str] = None
    category: str = Field(default="custom")
    auth_hint: str = Field(default="none", description="none | api_key | oauth2 | bearer | sigv4")
    delegation_mode: str = Field(default="m2m", description="m2m | obo")
    header_name: Optional[str] = None
    header_value: Optional[str] = None
    source: str = Field(default="custom", description="custom | curated")
    curated_id: Optional[str] = Field(default=None, description="Backref to mcp_curated.json entry if source=curated")


class McpServerUpdate(BaseModel):
    # AWS Agent Registry supports name/displayName/description/descriptors
    # updates via UpdateRegistryRecord. Other fields (auth_hint, header,
    # category) live inside the `data` blob of the descriptor, so they
    # roundtrip through descriptors on update.
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    auth_hint: Optional[str] = None
    delegation_mode: Optional[str] = None
    header_name: Optional[str] = None
    header_value: Optional[str] = None


# Registry status → UI status. The registry uses UPPER_SNAKE names; the
# frontend expects short lowercase — this keeps that translation in one
# place.
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
    """Translate an AWS Agent Registry record into the shape the McpLanding
    page expects: `{server_id, name, url, ...}`. AVA-specific fields
    (url, auth_hint, header_*, curated_id) live under
    `descriptors.mcpServer.data._meta.ava` — extracted here so the
    frontend keeps its old flat shape.
    """
    descriptor = ((record.get("descriptors") or {}).get("mcpServer") or {})
    parsed = descriptor.get("dataParsed") or {}
    # AVA extras live under _meta.ava; top-level fields are the MCP
    # server.json schema (name, description, version).
    data = dict((parsed.get("_meta") or {}).get("ava") or {})
    # Fall back to the top-level description if the meta blob doesn't
    # carry one.
    data.setdefault("description", parsed.get("description", ""))
    data.setdefault("name", parsed.get("name", ""))
    status_upper = record.get("status", "")
    return {
        "server_id":       record.get("recordId") or "",
        "record_arn":      record.get("recordArn") or "",
        "name":            record.get("displayName") or data.get("name") or record.get("name") or "",
        "url":             data.get("url", ""),
        "description":     record.get("description") or data.get("description", ""),
        "auth_hint":       data.get("auth_hint", "none"),
        "delegation_mode": data.get("delegation_mode", "m2m"),
        "category":        data.get("category", "custom"),
        "header_name":     data.get("header_name"),
        "header_value":    data.get("header_value"),
        "source":          data.get("source", "custom"),
        "curated_id":      data.get("curated_id"),
        "status":          _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":      status_upper,
        "created_at":      record.get("createdAt") or "",
        "updated_at":      record.get("updatedAt") or "",
    }


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/curated")
async def list_curated(_=RBACDepends(require_role(Role.VIEWER))):
    """Return the hand-curated list of well-known MCP servers.

    Backed by data/mcp_curated.json. Entries carry `posture` (official /
    community) so the UI can surface trust cues without endorsing the servers.
    """
    path = _curated_path()
    if not os.path.exists(path):
        return {"servers": [], "warning": f"mcp_curated.json not found at {path}"}
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        logger.error(f"failed to read mcp_curated.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_servers(_=RBACDepends(require_role(Role.VIEWER))):
    """Registered MCP servers — from AWS Agent Registry, record type MCP."""
    if not reg._registry_id():
        return {
            "servers": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        records = reg.list_records(record_type="MCP")
        return {"servers": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list MCP records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{server_id}")
async def get_server(server_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(server_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"MCP server {server_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def register_server(
    req: McpServerCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    # VIEWER can propose a registration — the policy engine decides
    # whether approval is required. If no active policy matches, the
    # register is auto-approved and the record lands APPROVED directly.
    # Route-level RBAC keeps VIEWER as the floor so nothing bypasses auth.
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish an MCP server. Policy engine decides auto-approve vs. queue vs. deny."""
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish MCP records until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="mcp", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies MCP registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    # Auto-approve → land as APPROVED; require_approval → PENDING_APPROVAL.
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    try:
        record = reg.publish_mcp_server(
            display_name=req.name.strip(),
            url=req.url.strip(),
            auth_hint=req.auth_hint,
            description=(req.description or "").strip(),
            curated_id=req.curated_id,
            extra={
                "category":        req.category,
                "delegation_mode": req.delegation_mode,
                "header_name":     req.header_name,
                "header_value":    req.header_value,
                "source":          req.source,
            },
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"publish_mcp_server failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("publish_mcp_server unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    # Queue row only when a policy requires approval. Auto-approved records
    # don't create queue noise.
    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="mcp",
            requested_by=x_user_email or "unknown",
            justification=f"Register MCP server '{req.name.strip()}' at {req.url.strip()}",
            verdict=verdict,
        )
    return _to_ui(record)


@router.patch("/{server_id}")
async def update_server(server_id: str, req: McpServerUpdate, _=RBACDepends(require_role(Role.OPERATOR))):
    """Update mutable fields on an MCP record.

    v1 supports the four AWS-updatable fields (name/displayName/description/
    descriptors). AVA-specific fields inside `data` roundtrip: we read the
    current record, merge, then re-serialize.
    """
    try:
        current = reg.get_record(server_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"MCP server {server_id} not found")
        raise HTTPException(status_code=500, detail=str(e))

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Merge into the existing `data` blob so mutable metadata survives.
    descriptor = (current.get("descriptors") or {}).get("mcpServer") or {}
    data = dict(descriptor.get("dataParsed") or {})
    for k in ("url", "auth_hint", "delegation_mode", "category", "header_name", "header_value", "description"):
        if k in updates:
            data[k] = updates[k]
    if "name" in updates:
        data["name"] = updates["name"]

    from services.agent_registry_client import control_client, _registry_id
    import json as _json
    kwargs: Dict[str, Any] = {
        "registryId": _registry_id(),
        "recordId": server_id,
        "descriptors": {
            "optionalValue": {
                "mcpServer": {
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
        return _to_ui(reg.get_record(server_id))
    except ClientError as e:
        logger.error(f"update MCP record failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Deprecate (soft delete) the MCP record.

    Normal lifecycle keeps the audit trail — the record stays in the
    registry as DEPRECATED. To hard-delete, hit
    `agent-registry-control:DeleteRegistryRecord` directly (ADMIN only).
    """
    try:
        reg.deprecate(server_id, reason="Deprecated via AVA MCP Servers page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
