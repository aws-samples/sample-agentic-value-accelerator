"""Custom Resources registry — backed by AWS Agent Registry (recordType=CUSTOM).

Escape hatch for anything worth cataloging that doesn't fit the four
typed record shapes (MCP / AGENT / SKILL). Sibling of mcp.py / a2a.py /
agents.py / skills.py. Records write to the AVA registry with
`recordType=CUSTOM` and a free-form `custom` descriptor whose `data`
carries whatever payload the caller wants.

Data blob layout (descriptors.custom.data):
  {
    "name":        display_name,
    "kind":        free-form category label (e.g. "application" for
                   auto-published deploys, or anything else),
    "description": string,
    "tags":        ["tag-a", "tag-b"],
    "metadata":    arbitrary object,
  }
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends, Header, HTTPException
from pydantic import BaseModel, Field

from core.rbac import Role, require_role
from services import agent_registry_client as reg
from services import approval_policy_engine as policy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/custom-resources", tags=["custom-resources"])


class CustomResourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: str = Field(default="generic", description="Free-form label (e.g. 'application', 'knowledge-base').")
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None


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
    descriptor = ((record.get("descriptors") or {}).get("custom") or {})
    data = descriptor.get("dataParsed") or {}
    tags = record.get("tags") or {}
    status_upper = record.get("status", "")
    return {
        "resource_id":  record.get("recordId") or "",
        "record_arn":   record.get("recordArn") or "",
        "name":         record.get("displayName") or data.get("name") or record.get("name") or "",
        "kind":         data.get("kind") or tags.get("Kind") or "generic",
        "description":  record.get("description") or data.get("description", ""),
        "tags":         data.get("tags") or [],
        "metadata":     data.get("metadata") or {},
        "record_tags":  tags,
        "status":       _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":   status_upper,
        "created_at":   record.get("createdAt") or "",
        "updated_at":   record.get("updatedAt") or "",
    }


@router.get("/list")
async def list_custom_resources(_=RBACDepends(require_role(Role.VIEWER))):
    """All CUSTOM records in the AVA registry.

    Includes auto-published deployed applications (tag Kind=application),
    hand-registered custom resources, and anything else that lands as
    recordType=CUSTOM.
    """
    if not reg._registry_id():
        return {
            "resources": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        records = reg.list_records(record_type="CUSTOM")
        return {"resources": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list CUSTOM records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{resource_id}")
async def get_custom_resource(resource_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(resource_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"Custom resource {resource_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def register_custom_resource(
    req: CustomResourceCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish a custom resource. Policy engine decides auto-approve vs. queue vs. deny."""
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish Custom Resources until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="custom", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies Custom Resource registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    data_payload: Dict[str, Any] = {
        "name":        req.name.strip(),
        "kind":        req.kind,
        "description": (req.description or "").strip(),
        "tags":        req.tags or [],
        "metadata":    req.metadata or {},
    }

    try:
        record = reg.create_record(
            kind=req.kind,
            record_type="CUSTOM",
            descriptor_key="custom",
            display_name=req.name.strip(),
            description=(req.description or "").strip(),
            data_payload=data_payload,
            data_schema_version="",  # custom descriptor doesn't accept dataSchemaVersion
            tags={"Kind": req.kind},
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"create CUSTOM record failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("create CUSTOM record unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="custom",
            requested_by=x_user_email or "unknown",
            justification=f"Register Custom Resource '{req.name.strip()}' ({req.kind})",
            verdict=verdict,
        )
    return _to_ui(record)


@router.delete("/{resource_id}", status_code=204)
async def delete_custom_resource(resource_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Soft-delete (DEPRECATED) — keeps the audit trail."""
    try:
        reg.deprecate(resource_id, reason="Deprecated via AVA Registry → Custom Resources page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
