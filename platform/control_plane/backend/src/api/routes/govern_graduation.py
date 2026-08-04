"""Govern Graduation — earned/progressive autonomy computed from real signals.

GET reads compute graduation live from the audit log; POST actions persist
human-grant intent and append an audit event (never auto-promote). A seed
endpoint backfills a demo roster with dated real approval events so the board
shows real movement in a fresh environment.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.config import settings
from core.rbac import Role, require_role
from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from models.govern_graduation import (
    AgentGraduation,
    GraduationRecord,
    GraduationRecordCreate,
    GraduationSummary,
)
from services.govern_audit_service import GovernAuditService
from services.govern_graduation_service import GovernGraduationService, StepDownGuardError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/graduation", tags=["govern-graduation"])

_svc: Optional[GovernGraduationService] = None


def get_service() -> GovernGraduationService:
    global _svc
    if _svc is None:
        audit = GovernAuditService(
            table_name=settings.GOVERN_AUDIT_TABLE_NAME, region=settings.AWS_REGION,
        )
        _svc = GovernGraduationService(
            table_name=settings.GOVERN_GRADUATION_TABLE_NAME,
            audit_service=audit,
            region=settings.AWS_REGION,
        )
    return _svc


@router.get("/records", response_model=List[GraduationRecord])
async def list_records(_=Depends(require_role(Role.VIEWER))):
    return get_service().list_records()


@router.get("/summary", response_model=GraduationSummary)
async def summary(_=Depends(require_role(Role.VIEWER))):
    return get_service().summarize()


@router.get("", response_model=List[AgentGraduation])
async def list_graduations(_=Depends(require_role(Role.VIEWER))):
    return get_service().list_graduations()


@router.get("/{agent_id}", response_model=AgentGraduation)
async def get_graduation(agent_id: str, _=Depends(require_role(Role.VIEWER))):
    g = get_service().get_graduation(agent_id)
    if not g:
        raise HTTPException(status_code=404, detail="No graduation record for agent")
    return g


@router.post("/records", response_model=GraduationRecord, status_code=201)
async def upsert_record(req: GraduationRecordCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().upsert(req, created_by="user")


class PromoteRequest(BaseModel):
    probation_days: Optional[int] = None
    override_step_down: bool = False


@router.post("/{agent_id}/promote", response_model=AgentGraduation)
async def promote(agent_id: str, req: PromoteRequest = PromoteRequest(), _=Depends(require_role(Role.OPERATOR))):
    try:
        g = get_service().promote(
            agent_id, promoted_by="user",
            probation_days=req.probation_days, override_step_down=req.override_step_down,
        )
    except StepDownGuardError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not g:
        raise HTTPException(status_code=409, detail="Cannot promote (missing record or already at L4)")
    return g


class StepDownRequest(BaseModel):
    reason: str
    triggered_by_event_id: Optional[str] = None


@router.post("/{agent_id}/step-down", response_model=AgentGraduation)
async def step_down(agent_id: str, req: StepDownRequest, _=Depends(require_role(Role.OPERATOR))):
    g = get_service().step_down(agent_id, reason=req.reason, triggered_by_event_id=req.triggered_by_event_id, actor="user")
    if not g:
        raise HTTPException(status_code=404, detail="No graduation record for agent")
    return g


class IncidentRequest(BaseModel):
    severity: str = "high"
    detail: str = "Manually reported incident"


@router.post("/{agent_id}/report-incident", response_model=AgentGraduation)
async def report_incident(agent_id: str, req: IncidentRequest = IncidentRequest(), _=Depends(require_role(Role.OPERATOR))):
    g = get_service().report_incident(agent_id, severity=req.severity, detail=req.detail)
    if not g:
        raise HTTPException(status_code=404, detail="No graduation record for agent")
    return g


# --- Demo seed: a fixed roster + dated real approval backfill ---


class SeedRequest(BaseModel):
    reset: bool = False


# 6 named demo agents that also appear in the Handoff Workspace roster. The
# decision counts / agreement rates are tuned against THRESHOLDS so the seeded
# board tells the full earned-autonomy story — some agents have EARNED promotion,
# some are conditional/insufficient, one should step down — rather than everyone
# failing the same gate. L2->L3 needs >=500 decisions & >=90% agreement over
# >=30d; L3->L4 needs >=5000 & >=95%.
_DEMO_ROSTER = [
    # READY: cleared L2->L3 — >=500 decisions, >=90% agreement, long tenure.
    {"agent_id": "agt-00001", "name": "Retail-Agent-1", "business_unit": "Retail Banking", "current_level": 2, "reviewer_hours_per_month": 42, "approvals": 690, "rejects": 18, "days": 65},
    # NOT-READY: solid agreement but not enough decisions logged yet (insufficient).
    {"agent_id": "agt-00002", "name": "Capital-Agent-2", "business_unit": "Capital Markets", "current_level": 2, "reviewer_hours_per_month": 55, "approvals": 95, "rejects": 22, "days": 20},
    # READY: cleared L2->L3 comfortably — high volume, very high agreement.
    {"agent_id": "agt-00003", "name": "Wealth-Agent-3", "business_unit": "Wealth Management", "current_level": 2, "reviewer_hours_per_month": 30, "approvals": 880, "rejects": 22, "days": 120},
    # READY: cleared L2->L3.
    {"agent_id": "agt-00004", "name": "Risk-Agent-4", "business_unit": "Risk & Fraud", "current_level": 2, "reviewer_hours_per_month": 68, "approvals": 610, "rejects": 26, "days": 48},
    # NOT-READY: low agreement — the human is still adding real safety (L3 target 90%).
    {"agent_id": "agt-00005", "name": "Ops-Agent-5", "business_unit": "Operations", "current_level": 2, "reviewer_hours_per_month": 25, "approvals": 380, "rejects": 300, "days": 40},
    # NOT-READY: insufficient evidence — barely any decisions logged.
    {"agent_id": "agt-00006", "name": "Service-Agent-6", "business_unit": "Customer Service", "current_level": 2, "reviewer_hours_per_month": 50, "approvals": 40, "rejects": 3, "days": 12},
]


@router.post("/seed")
async def seed_demo(req: SeedRequest = SeedRequest(), _=Depends(require_role(Role.OPERATOR))):
    """Backfill the demo roster with graduation records + dated real approval events.

    Every event is a real row in the audit table keyed by the canonical agent_id,
    so the board's numbers are real counts — just pre-populated so a fresh env
    isn't empty. Idempotent-ish: creates records and appends a backfill batch.
    """
    from datetime import datetime, timedelta
    svc = get_service()
    audit = svc.audit
    # reset clears the table-free in-memory buffers so re-seeding doesn't
    # double-count the backfilled decisions (no-op when backed by DynamoDB).
    if req.reset:
        try:
            type(svc)._mem.clear()
            type(audit)._mem.clear()
        except Exception:
            pass
    created = []
    for a in _DEMO_ROSTER:
        svc.upsert(GraduationRecordCreate(
            agent_id=a["agent_id"], name=a["name"], business_unit=a["business_unit"],
            current_level=a["current_level"], reviewer_hours_per_month=a["reviewer_hours_per_month"],
        ), created_by="seed")
        # Dated backfill: spread approve/reject events across the agent's window.
        total = a["approvals"] + a["rejects"]
        span_days = a["days"]
        for i in range(total):
            is_reject = i < a["rejects"]
            # newest events are approvals so trend reads slightly rising for healthy agents
            days_ago = span_days - int((i / max(1, total - 1)) * span_days)
            event_ts = datetime.utcnow() - timedelta(days=days_ago)
            audit.append(AuditEventCreate(
                category=AuditCategory.APPROVAL,
                severity=AuditSeverity.LOW,
                actor="reviewer@bank.example",
                agent=a["agent_id"],
                summary=f"{a['name']}: backfilled decision",
                action="reject" if is_reject else "approve",
                decision_context="Seeded historical decision for the demo roster (real audit row).",
            ), created_by="seed", ts=event_ts)
        created.append(a["agent_id"])
    return {"seeded_agents": created, "roster": len(_DEMO_ROSTER)}
