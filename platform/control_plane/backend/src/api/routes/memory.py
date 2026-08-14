"""Bedrock AgentCore Memory API routes.

Thin wrapper over `bedrock-agentcore-control:{Create,Get,Update,Delete,List}Memory`
so the UI can surface Memory as a first-class Build primitive.

v1 scope:
  * list / get / create / update / delete a memory instance
  * strategy list is the canonical set from the AgentCore docs

Memory instances created here are addressable by ARN; the Harness Create
wizard picks from this catalog instead of always spinning up managed memory.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/memory", tags=["memory"])


_control_client = None


def _control():
    global _control_client
    if _control_client is None:
        _control_client = boto3.client(
            "bedrock-agentcore-control", region_name=settings.AWS_REGION
        )
    return _control_client


# ─── Shapes ─────────────────────────────────────────────────────────────────


# EPISODIC is documented in the AgentCore harness docs but not yet exposed
# in the standalone CreateMemory API. Ship the three that work today.
AVAILABLE_STRATEGIES = ["SEMANTIC", "SUMMARIZATION", "USER_PREFERENCE"]


class MemoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    event_expiry_duration: int = Field(default=30, ge=1, le=365, description="Days to retain short-term events.")
    strategies: List[str] = Field(default_factory=lambda: ["SEMANTIC", "SUMMARIZATION"])


class MemoryUpdateRequest(BaseModel):
    description: Optional[str] = None
    event_expiry_duration: Optional[int] = Field(default=None, ge=1, le=365)


def _summarize(m: Dict[str, Any]) -> Dict[str, Any]:
    """Collapse a full Memory response into a UI-shaped card row."""
    return {
        "memory_id": m.get("memoryId") or m.get("id"),
        "memory_arn": m.get("memoryArn") or m.get("arn"),
        "name": m.get("name"),
        "description": m.get("description") or "",
        "status": m.get("status"),
        "strategies": [
            (s.get("type") or s.get("strategyType") or "").upper()
            for s in (m.get("strategies") or [])
            if isinstance(s, dict)
        ],
        "event_expiry_duration": m.get("eventExpiryDuration"),
        "created_at": _isoformat(m.get("createdAt")),
        "updated_at": _isoformat(m.get("updatedAt")),
    }


def _isoformat(v: Any) -> str:
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    return str(v)


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/strategies")
async def list_strategies(_=RBACDepends(require_role(Role.VIEWER))):
    """Static list of built-in strategies. Frontend consumes this for the wizard."""
    return {
        "strategies": [
            {"id": "SEMANTIC",        "label": "Semantic",        "description": "Extract factual knowledge for retrieval via semantic search."},
            {"id": "SUMMARIZATION",   "label": "Summarization",   "description": "Running conversation summaries scoped by actor + session."},
            {"id": "USER_PREFERENCE", "label": "User Preference", "description": "Capture user preferences expressed during conversations."},
        ]
    }


@router.get("/list")
async def list_memories(_=RBACDepends(require_role(Role.VIEWER))):
    """List every memory instance in this account/region.

    ListMemories summaries only include {id, arn, status, timestamps,
    managedByResourceArn}. Name, description, strategies live on the full
    GetMemory response, so we fan out one GetMemory per row to hydrate the
    UI columns. Cheap for the sizes we expect (single-account, dozens of
    memories max); revisit with pagination + parallelism if that changes.
    """
    try:
        resp = _control().list_memories()
        rows = resp.get("memories") or resp.get("memorySummaries") or []
        enriched: List[Dict[str, Any]] = []
        for r in rows:
            mid = r.get("memoryId") or r.get("id")
            if not mid:
                enriched.append(_summarize(r))
                continue
            try:
                full = _control().get_memory(memoryId=mid)
                enriched.append(_summarize((full or {}).get("memory") or full or r))
            except ClientError as get_err:
                # Individual failures degrade gracefully — the row still
                # renders with what the summary carried.
                logger.warning(f"get_memory({mid}) failed during list enrichment: {get_err}")
                enriched.append(_summarize(r))
        return {"memories": enriched}
    except ClientError as e:
        logger.error(f"list_memories failed: {e}")
        return {"memories": [], "warning": str(e)}


@router.get("/{memory_id}")
async def get_memory(memory_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _control().get_memory(memoryId=memory_id)
        return _summarize(resp.get("memory") or resp)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"Memory {memory_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def create_memory(req: MemoryCreateRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    """Create an AgentCore Memory instance.

    Wire format notes (verified against boto3 bedrock-agentcore-control):
    * The parameter is `memoryStrategies` (not `strategies`).
    * Each strategy is a typed object keyed by kind — `semanticMemoryStrategy`,
      `summaryMemoryStrategy`, `userPreferenceMemoryStrategy`,
      `customMemoryStrategy` — and every object requires its own `name`.
      There is no `EPISODIC` in the SDK yet, though it's documented; we
      reject it with a clear error until AWS ships the shape.
    """
    bad = [s for s in req.strategies if s not in AVAILABLE_STRATEGIES]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported strategies: {bad}. Allowed: {AVAILABLE_STRATEGIES}",
        )

    # Translate the UI-friendly strategy identifiers into the wire shape.
    strategy_key_by_id = {
        "SEMANTIC":         "semanticMemoryStrategy",
        "SUMMARIZATION":    "summaryMemoryStrategy",
        "USER_PREFERENCE":  "userPreferenceMemoryStrategy",
    }
    unsupported = [s for s in req.strategies if s not in strategy_key_by_id]
    if unsupported:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Strategy not yet supported by the AgentCore SDK: {unsupported}. "
                f"Supported today: {list(strategy_key_by_id)}"
            ),
        )
    # Strategy names must match [a-zA-Z][a-zA-Z0-9_]{0,47} (no hyphens or
    # dots, max 48 chars). We derive per-strategy names by concatenating the
    # sanitized memory name with an underscore + a short strategy suffix.
    def _sanitize(v: str) -> str:
        # Strip anything outside letters/digits/underscore; leading digit gets
        # a "m_" prefix so the name still starts with a letter.
        cleaned = "".join(c if (c.isalnum() or c == "_") else "_" for c in v)
        if not cleaned:
            cleaned = "memory"
        if not cleaned[0].isalpha():
            cleaned = f"m_{cleaned}"
        return cleaned
    strategy_suffix_by_id = {
        "SEMANTIC":        "semantic",
        "SUMMARIZATION":   "summary",
        "USER_PREFERENCE": "userpref",
    }
    base = _sanitize(req.name)
    memory_strategies = []
    for s in req.strategies:
        suffix = strategy_suffix_by_id[s]
        # Reserve room for underscore + suffix within the 48-char limit.
        max_base = 48 - 1 - len(suffix)
        strategy_name = f"{base[:max_base]}_{suffix}"
        memory_strategies.append({strategy_key_by_id[s]: {"name": strategy_name}})

    kwargs: Dict[str, Any] = {
        "name": req.name,
        "eventExpiryDuration": req.event_expiry_duration,
        "memoryStrategies": memory_strategies,
    }
    if req.description:
        kwargs["description"] = req.description

    try:
        resp = _control().create_memory(**kwargs)
        return _summarize(resp.get("memory") or resp)
    except ClientError as e:
        logger.error(f"create_memory failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateMemory failed: {e}")


@router.patch("/{memory_id}")
async def update_memory(memory_id: str, req: MemoryUpdateRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    kwargs: Dict[str, Any] = {"memoryId": memory_id}
    if req.description is not None:
        kwargs["description"] = req.description
    if req.event_expiry_duration is not None:
        kwargs["eventExpiryDuration"] = req.event_expiry_duration
    try:
        return _control().update_memory(**kwargs)
    except ClientError as e:
        logger.error(f"update_memory failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(memory_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    try:
        _control().delete_memory(memoryId=memory_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
