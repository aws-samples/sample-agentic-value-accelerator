"""Skills registry — backed by AWS Agent Registry (recordType=SKILL).

Sibling of mcp.py / a2a.py / agents.py. Records write to the AVA
registry with `recordType=SKILL` and `Kind=skill` tag. Curated JSON
(data/skills_curated.json) is still served from `/curated` so the UI
can offer a "deploy from curated" flow same as MCP/A2A.

Data blob layout (descriptors.agentSkillsDefinition.data):
  {
    "name":         display_name,
    "kind":         "evaluation" | "extraction" | "workflow" | "guardrail",
    "description":  string,
    "input_variables": ["v1", "v2", ...],
    "output_schema": arbitrary object,
    "tags":         ["tag-a", "tag-b"],
    "posture":      "official" | "community",
    "curated_id":   optional back-ref,
  }
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
router = APIRouter(prefix="/skills", tags=["skills"])


def _curated_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data",
        "skills_curated.json",
    )


# ─── Shapes ─────────────────────────────────────────────────────────────


class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: str = Field(default="workflow", description="evaluation | extraction | workflow | guardrail")
    description: Optional[str] = None
    input_variables: List[str] = Field(default_factory=list)
    output_schema: Optional[Any] = None
    tags: List[str] = Field(default_factory=list)
    posture: str = Field(default="community", description="official | community")
    source: str = Field(default="custom", description="custom | curated")
    curated_id: Optional[str] = None


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
    descriptor = ((record.get("descriptors") or {}).get("agentSkillsDefinition") or {})
    parsed = descriptor.get("dataParsed") or {}
    # AVA fields live under _meta.ava (top-level `data` conforms to the
    # AWS skill definition schema — repository/websiteUrl/packages).
    data = dict((parsed.get("_meta") or {}).get("ava") or {})
    status_upper = record.get("status", "")
    return {
        "skill_id":        record.get("recordId") or "",
        "record_arn":      record.get("recordArn") or "",
        "name":            record.get("displayName") or data.get("name") or record.get("name") or "",
        "kind":            data.get("kind", "workflow"),
        "description":     record.get("description") or data.get("description", ""),
        "input_variables": data.get("input_variables") or [],
        "output_schema":   data.get("output_schema"),
        "tags":            data.get("tags") or [],
        "posture":         data.get("posture", "community"),
        "source":          data.get("source", "custom"),
        "curated_id":      data.get("curated_id"),
        "status":          _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":      status_upper,
        "created_at":      record.get("createdAt") or "",
        "updated_at":      record.get("updatedAt") or "",
    }


# ─── Routes ─────────────────────────────────────────────────────────────


@router.get("/curated")
async def list_curated(_=RBACDepends(require_role(Role.VIEWER))):
    """Return the hand-curated list of skills.

    Backed by data/skills_curated.json — six canonical entries covering
    evaluation rubrics, extraction schemas, workflows, and guardrail
    templates. Users click "Deploy" on a curated card to publish it to
    the AVA registry (routes through the Approval Queue by policy).
    """
    path = _curated_path()
    if not os.path.exists(path):
        return {"skills": [], "warning": f"skills_curated.json not found at {path}"}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"failed to read skills_curated.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_skills(_=RBACDepends(require_role(Role.VIEWER))):
    """Registered Skills — records tagged Kind=skill in the AVA registry."""
    if not reg._registry_id():
        return {
            "skills": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        records = reg.list_records(record_type="SKILL")
        return {"skills": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list Skills records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{skill_id}")
async def get_skill(skill_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(skill_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"Skill {skill_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def register_skill(
    req: SkillCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish a Skill. Policy engine decides auto-approve vs. queue vs. deny."""
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish Skills until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="skill", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies Skill registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    # AWS `agentSkillsDefinition.data` schema (v0.1.0) allows only:
    #   {_meta?, repository?, websiteUrl?, packages?}
    # Everything else must live under `_meta.ava` so the AVA UI can
    # reconstruct on read while the registry-side validator passes.
    data_payload: Dict[str, Any] = {
        "_meta": {
            "ava": {
                "name":            req.name.strip(),
                "kind":            req.kind,
                "description":     (req.description or "").strip(),
                "input_variables": req.input_variables or [],
                "output_schema":   req.output_schema,
                "tags":            req.tags or [],
                "posture":         req.posture,
                "source":          req.source,
                **({"curated_id": req.curated_id} if req.curated_id else {}),
            }
        }
    }

    try:
        record = reg.create_record(
            kind="skill",
            record_type="SKILL",
            descriptor_key="agentSkillsDefinition",
            display_name=req.name.strip(),
            description=(req.description or "").strip(),
            data_payload=data_payload,
            data_schema_version="0.1.0",  # only version AWS supports today
            tags={"Kind": "skill"},
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"create Skill record failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("create Skill record unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="skill",
            requested_by=x_user_email or "unknown",
            justification=f"Register Skill '{req.name.strip()}' ({req.kind})",
            verdict=verdict,
        )
    return _to_ui(record)


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Soft-delete (DEPRECATED) — keeps the audit trail."""
    try:
        reg.deprecate(skill_id, reason="Deprecated via AVA Registry → Skills page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
