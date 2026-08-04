"""Govern Audit — append-only audit / decision log API routes.

Append-only by design (no PUT/DELETE): the log is an examiner-facing
system-of-record. Human decisions from the Govern module (e.g. handoff
approvals) POST here; the Audit & Incidents view GETs the merged stream.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role
from models.govern_audit import AuditCategory, AuditEvent, AuditEventCreate
from services.govern_audit_service import GovernAuditService
from services.govern_guardrail_check_service import (
    GovernGuardrailCheckService,
    GuardrailNotReadyError,
)
from services.guardrail_service import GuardrailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/audit", tags=["govern-audit"])

_svc: Optional[GovernAuditService] = None
_check_svc: Optional[GovernGuardrailCheckService] = None


def get_service() -> GovernAuditService:
    global _svc
    if _svc is None:
        _svc = GovernAuditService(
            table_name=settings.GOVERN_AUDIT_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


def get_check_service() -> GovernGuardrailCheckService:
    global _check_svc
    if _check_svc is None:
        _check_svc = GovernGuardrailCheckService(
            audit_service=get_service(),
            guardrail_service=GuardrailService(
                table_name=settings.GUARDRAILS_TABLE_NAME,
                region=settings.AWS_REGION,
            ),
            region=settings.AWS_REGION,
        )
    return _check_svc


@router.post("/events", response_model=AuditEvent, status_code=201)
async def append_event(req: AuditEventCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    return svc.append(req, created_by="user")


@router.get("/events", response_model=List[AuditEvent])
async def list_events(
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    _=Depends(require_role(Role.VIEWER)),
):
    svc = get_service()
    try:
        cat = AuditCategory(category) if category else None
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category '{category}'. Valid: {[c.value for c in AuditCategory]}",
        )
    return svc.list(category=cat, limit=limit)


@router.get("/events/{event_id}", response_model=AuditEvent)
async def get_event(event_id: str, ts: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    e = svc.get(event_id, ts=ts)
    if not e:
        raise HTTPException(status_code=404, detail="Audit event not found")
    return e


# --- Live signal: real Bedrock guardrail check -> audit log ---


class GuardrailCheckRequest(BaseModel):
    template_id: str = Field(..., description="Guardrail template with a published Bedrock guardrail")
    text: str = Field(..., min_length=1, max_length=25000)
    source: str = Field(default="OUTPUT", pattern="^(INPUT|OUTPUT)$")
    agent: Optional[str] = None


@router.post("/check-guardrail")
async def check_guardrail(req: GuardrailCheckRequest, _=Depends(require_role(Role.OPERATOR))):
    """Run a REAL Bedrock guardrail check; on intervention, write an audit event.

    This is a live AWS signal — it calls bedrock-runtime ApplyGuardrail. Returns
    503 if the guardrail isn't published, 502 if the Bedrock call fails (e.g. no
    credentials locally), so failures are surfaced honestly rather than mocked.
    """
    svc = get_check_service()
    try:
        return svc.check(
            template_id=req.template_id,
            text=req.text,
            source=req.source,
            agent=req.agent,
            actor="user",
        )
    except GuardrailNotReadyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        # Log full error server-side; send generic message to frontend.
        logger.error(f"Guardrail check failed: {e}")
        raise HTTPException(status_code=502, detail="Bedrock guardrail check failed — check server logs for details.")
