"""Govern Graduation service — earned autonomy computed from the real audit log.

Persists grant-intent GraduationRecords (DynamoDB, same pattern as conformance);
computes ComputedSignals live from the GovernAuditService query primitives on
every read. The agreement rate is a real COUNT over real persisted audit rows
keyed by the canonical agent_id (the handoff workspace writes that id into the
event's `agent` field).

Storage: pk = "GRAD#<agent_id>"  sk = "LATEST"  -> the graduation record.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from models.govern_graduation import (
    AGREEMENT_ACTIONS,
    OVERRIDE_ACTIONS,
    PARTIAL_ACTIONS,
    THRESHOLDS,
    AgentGraduation,
    ComputedSignals,
    GraduationRecord,
    GraduationRecordCreate,
    GraduationSummary,
    Ratchet,
    RatchetDirection,
    compute,
)
from services.govern_audit_service import GovernAuditService, _event_dt

logger = logging.getLogger(__name__)

# Minimum real decisions before we'll judge readiness at all (else "insufficient").
MIN_DECISIONS_FOR_EVIDENCE = 8

# The APPROVAL category is shared between human decisions and ratchet bookkeeping;
# only these actions represent a genuine human decision on an agent's output.
_DECISION_ACTIONS = AGREEMENT_ACTIONS | PARTIAL_ACTIONS | OVERRIDE_ACTIONS


class StepDownGuardError(Exception):
    """Raised when a promote would clobber an active, unacknowledged step-down."""


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernGraduationService:
    PK_PREFIX = "GRAD#"
    SK_LATEST = "LATEST"

    # Ephemeral in-memory store used when the graduation table isn't provisioned
    # (e.g. running locally without the DynamoDB backend). The roster is stateful
    # CRUD (seed + promote/step-down), so a table-free environment can't persist
    # across restarts — but the seed roster, compute-on-read signals, and ratchet
    # actions all still work.
    _mem: dict = {}

    def __init__(self, table_name: str, audit_service: GovernAuditService, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self.audit = audit_service
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    def _persist(self, r: GraduationRecord) -> None:
        """Write to DynamoDB; fall back to the ephemeral in-memory store when the
        table isn't provisioned (local / no DynamoDB backend)."""
        try:
            self.table.put_item(Item=self._to_item(r))
        except Exception:
            type(self)._mem[r.agent_id] = r

    # --- DDB shape ---------------------------------------------------------

    def _to_item(self, r: GraduationRecord) -> dict:
        body = r.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{r.agent_id}",
            "sk": self.SK_LATEST,
            "agent_id": r.agent_id,
            "name": r.name,
            "current_level": r.current_level,
            "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> GraduationRecord:
        return GraduationRecord.model_validate(_from_ddb(json.loads(item["data"])))

    # --- Signal computation from the real audit log ------------------------

    def _compute_signals(self, agent_id: str) -> ComputedSignals:
        # All decision events for this agent (approval category), newest-first.
        counts = self.audit.count_by_action(agent_id, category=AuditCategory.APPROVAL)
        agree = sum(counts.get(a, 0) for a in AGREEMENT_ACTIONS)
        partial = sum(counts.get(a, 0) for a in PARTIAL_ACTIONS)
        override = sum(counts.get(a, 0) for a in OVERRIDE_ACTIONS)
        total = agree + partial + override
        # Agreement rate: full agreements + half-credit for edited approvals.
        agreement_rate = round((agree + 0.5 * partial) / total * 100) if total else 0

        # Trend: split the decision stream into recent vs prior halves by time.
        # Restrict to genuine human-decision actions — the APPROVAL category also
        # carries ratchet bookkeeping ("graduation-change") which is not a decision
        # and would otherwise dilute the trend denominator and skew days-in-scope.
        approval_events = [
            e for e in self.audit.query_events(agent=agent_id, category=AuditCategory.APPROVAL)
            if (e.action or "").strip().lower() in _DECISION_ACTIONS
        ]
        trend = self._agreement_trend(approval_events)

        # Guardrail + incident signals (real, agent-keyed).
        guardrail_events = self.audit.query_events(agent=agent_id, category=AuditCategory.GUARDRAIL)
        incident_events = self.audit.query_events(agent=agent_id, category=AuditCategory.INCIDENT)
        guardrail_rate = round(len(guardrail_events) / total * 100, 2) if total else 0.0
        open_incidents = sum(
            1 for e in incident_events if e.severity in (AuditSeverity.HIGH, AuditSeverity.CRITICAL)
        )
        incident_rate = round(len(incident_events) / total * 1000, 2) if total else 0.0

        # Days in scope: age of the oldest decision (real time span).
        days = 0
        if approval_events:
            oldest = min(_event_dt(e) for e in approval_events)
            days = max(0, (datetime.utcnow() - oldest).days)

        return ComputedSignals(
            decisions_in_scope=total,
            agreement_rate=agreement_rate,
            agreement_trend=trend,
            guardrail_intervention_rate=guardrail_rate,
            open_incidents=open_incidents,
            incident_rate=incident_rate,
            error_rate=0.0,  # no live feed yet — surfaced as insufficient, not faked
            days_in_scope=days,
            window_counts=counts,
            sufficient_evidence=total >= MIN_DECISIONS_FOR_EVIDENCE,
        )

    def _agreement_trend(self, events: list) -> str:
        """rising | flat | falling from recent-half vs prior-half agreement rate."""
        if len(events) < 6:
            return "flat"
        ordered = sorted(events, key=_event_dt)  # oldest -> newest
        mid = len(ordered) // 2
        prior, recent = ordered[:mid], ordered[mid:]

        def rate(evs) -> float:
            a = sum(1 for e in evs if (e.action or "").lower() in AGREEMENT_ACTIONS)
            p = sum(0.5 for e in evs if (e.action or "").lower() in PARTIAL_ACTIONS)
            return (a + p) / len(evs) if evs else 0.0

        delta = rate(recent) - rate(prior)
        if delta > 0.05:
            return "rising"
        if delta < -0.05:
            return "falling"
        return "flat"

    # --- CRUD + graduation reads -------------------------------------------

    def upsert(self, req: GraduationRecordCreate, created_by: Optional[str] = None) -> GraduationRecord:
        existing = self._get_record(req.agent_id)
        if existing:
            for f, v in req.model_dump(exclude_none=True).items():
                setattr(existing, f, v)
            existing.updated_at = datetime.utcnow()
            r = existing
        else:
            r = GraduationRecord(**req.model_dump(exclude_none=False), created_by=created_by)
        self._persist(r)
        return r

    def _get_record(self, agent_id: str) -> Optional[GraduationRecord]:
        try:
            resp = self.table.get_item(Key={"pk": f"{self.PK_PREFIX}{agent_id}", "sk": self.SK_LATEST})
            item = resp.get("Item")
            if item:
                return self._from_item(item)
        except Exception:
            pass
        return type(self)._mem.get(agent_id)

    def get_graduation(self, agent_id: str) -> Optional[AgentGraduation]:
        record = self._get_record(agent_id)
        if not record:
            return None
        signals = self._compute_signals(agent_id)
        return compute(record, signals)

    def list_records(self) -> List[GraduationRecord]:
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.PK_PREFIX))
            return [self._from_item(i) for i in resp.get("Items", [])]
        except Exception:
            return list(type(self)._mem.values())

    def list_graduations(self) -> List[AgentGraduation]:
        out = [compute(r, self._compute_signals(r.agent_id)) for r in self.list_records()]
        out.sort(key=lambda g: g.readiness, reverse=True)
        return out

    def summarize(self) -> GraduationSummary:
        grads = self.list_graduations()
        ready = sum(1 for g in grads if g.verdict == "ready" and not g.ratchet.step_down_triggered)
        conditional = sum(1 for g in grads if g.verdict == "conditional")
        not_ready = sum(1 for g in grads if g.verdict == "not_ready")
        step_down = sum(1 for g in grads if g.ratchet.step_down_triggered)
        hours = sum(g.reviewer_hours_per_month for g in grads if g.verdict == "ready" and not g.ratchet.step_down_triggered)
        low = sum(1 for g in grads if g.current_level <= 2)
        return GraduationSummary(
            total=len(grads), ready=ready, conditional=conditional, not_ready=not_ready,
            step_down_recommended=step_down, reclaimable_hours_per_month=hours,
            pct_at_low_autonomy=round(low / len(grads) * 100) if grads else 0,
        )

    # --- Ratchet actions (persist intent + audit the action) ---------------

    def promote(self, agent_id: str, promoted_by: str = "user", probation_days: Optional[int] = None, override_step_down: bool = False) -> Optional[AgentGraduation]:
        r = self._get_record(agent_id)
        if not r or r.current_level >= 4:
            return None
        # Don't silently wipe an active step-down: an agent that was ratcheted down
        # on a real incident must be explicitly re-cleared before it can be promoted,
        # or the ratchet's safety provenance (reason, triggering event) is lost.
        if r.ratchet.step_down_triggered and not override_step_down:
            raise StepDownGuardError(
                f"Agent {agent_id} is under an active step-down ({r.ratchet.step_down_reason}); "
                "clear it explicitly before promoting."
            )
        r.current_level += 1
        r.ratchet = Ratchet(
            direction=RatchetDirection.UP, promoted_by=promoted_by, promoted_at=datetime.utcnow(),
            probation_until=(f"probation:{probation_days}d" if probation_days else None),
        )
        r.updated_at = datetime.utcnow()
        self._persist(r)
        self._audit_ratchet(r, f"Promoted to L{r.current_level}", promoted_by)
        return self.get_graduation(agent_id)

    def step_down(self, agent_id: str, reason: str, triggered_by_event_id: Optional[str] = None, actor: str = "system") -> Optional[AgentGraduation]:
        r = self._get_record(agent_id)
        if not r:
            return None
        if r.current_level > 1:
            r.current_level -= 1
        r.ratchet = Ratchet(
            direction=RatchetDirection.DOWN, step_down_triggered=True, step_down_reason=reason,
            triggered_by_event_id=triggered_by_event_id, last_ratchet_at=datetime.utcnow(),
        )
        r.updated_at = datetime.utcnow()
        self._persist(r)
        self._audit_ratchet(r, f"Stepped down to L{r.current_level}: {reason}", actor)
        return self.get_graduation(agent_id)

    def report_incident(self, agent_id: str, severity: str = "high", detail: str = "Manually reported incident") -> Optional[AgentGraduation]:
        """Demo producer: append a real incident audit event, then step the agent down."""
        r = self._get_record(agent_id)
        if not r:
            return None
        # Coerce defensively: an off-enum severity string must not 500 the endpoint.
        try:
            sev = AuditSeverity(severity)
        except ValueError:
            sev = AuditSeverity.HIGH
        ev = self.audit.append(AuditEventCreate(
            category=AuditCategory.INCIDENT,
            severity=sev,
            actor="system",
            agent=agent_id,
            summary=f"{r.name or agent_id}: incident reported",
            action="flag-for-review",
            decision_context=detail,
        ), created_by="system")
        return self.step_down(agent_id, reason="Incident reported", triggered_by_event_id=ev.id)

    def _audit_ratchet(self, r: GraduationRecord, summary: str, actor: str) -> None:
        self.audit.append(AuditEventCreate(
            category=AuditCategory.APPROVAL,
            severity=AuditSeverity.MEDIUM,
            actor=actor,
            agent=r.agent_id,
            summary=f"{r.name or r.agent_id}: {summary}",
            action="graduation-change",
            decision_context=f"Autonomy grant changed to L{r.current_level} (direction={r.ratchet.direction}). Human-granted, recorded for accountability.",
        ), created_by=actor)
