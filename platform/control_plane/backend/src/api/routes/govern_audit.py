"""Govern Audit — append-only audit / decision log API routes.

Append-only by design (no PUT/DELETE): the log is an examiner-facing
system-of-record. Human decisions from the Govern module (e.g. handoff
approvals) POST here; the Audit & Incidents view GETs the merged stream.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from core import region_scope
from core import region_config
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

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_audit", region_scope.CONTROL_PLANE, prefix="/govern/audit")

_svc: Optional[GovernAuditService] = None
_check_svc: Optional[GovernGuardrailCheckService] = None


def get_service() -> GovernAuditService:
    global _svc
    if _svc is None:
        _svc = GovernAuditService(
            # Control-plane table: one home region, resolved by tier-1 rules.
            table_name=settings.GOVERN_AUDIT_TABLE_NAME,
            region=region_config.table_region("GOVERN_AUDIT"),
        )
    return _svc


def get_check_service() -> GovernGuardrailCheckService:
    global _check_svc
    if _check_svc is None:
        _check_svc = GovernGuardrailCheckService(
            audit_service=get_service(),
            guardrail_service=GuardrailService(
                # Regions resolve per tier inside the service: the template table in
                # the control region, Bedrock/CloudWatch in the governed region.
                table_name=settings.GUARDRAILS_TABLE_NAME,
            ),
            # bedrock-runtime ApplyGuardrail is a governed-resource call, so it
            # belongs in the governed region, not the control-plane region.
            region=settings.GOVERN_AWS_REGION,
        )
    return _check_svc


@router.post("/events", response_model=AuditEvent, status_code=201)
async def append_event(
    req: AuditEventCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Append an audit event. Records the caller from the `x-user-email` header, or
    `"unknown"` when absent - `require_role` returns only a Role, never a principal.

    created_by="user" was worse than no attribution on an examiner-facing
    system-of-record: it reads like a real principal, so nobody goes looking for the
    identity that was never captured. x-user-email is the same header core/rbac.py:88
    reads to decide the role.
    """
    svc = get_service()
    return svc.append(req, created_by=x_user_email or "unknown")


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
async def check_guardrail(
    req: GuardrailCheckRequest,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Run a REAL Bedrock guardrail check; on intervention, write an audit event.

    This is a live AWS signal — it calls bedrock-runtime ApplyGuardrail. Returns
    503 if the guardrail isn't published, 502 if the Bedrock call fails (e.g. no
    credentials locally), so failures are surfaced honestly rather than mocked.

    The audit event's `actor` comes from the `x-user-email` header, or `"unknown"`.
    """
    svc = get_check_service()
    try:
        return svc.check(
            template_id=req.template_id,
            text=req.text,
            source=req.source,
            agent=req.agent,
            actor=x_user_email or "unknown",
        )
    except GuardrailNotReadyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        # Log full error server-side; send generic message to frontend.
        logger.error(f"Guardrail check failed: {e}")
        raise HTTPException(status_code=502, detail="Bedrock guardrail check failed — check server logs for details.")
