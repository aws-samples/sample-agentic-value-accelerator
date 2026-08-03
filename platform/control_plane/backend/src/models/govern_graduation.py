"""Govern Graduation — earned/progressive autonomy computed from REAL signals.

The differentiator no competitor ships (even statically): an agent's graduation
readiness + verdict are computed live from the real, persisted audit/decision
log — chiefly the human-agreement rate from real handoff decisions — not from a
seeded generator. A bidirectional ratchet earns a step UP the L1->L4 ladder as
agreement accumulates, and steps DOWN to a safe degraded state on a real
incident / guardrail spike / falling agreement (with provenance back to the
triggering audit event).

Design (per the sharpened spec + adversarial critique):
- PERSIST only human-grant INTENT (GraduationRecord.ratchet: who promoted, when,
  probation, acknowledged step-downs). Never auto-promote.
- COMPUTE signals + criteria + verdict on read from the audit log — never
  denormalized/stale (mirrors the conformance compute() pattern).
- Reuse the exact THRESHOLDS + verdict logic semantics from the frontend
  graduationData.ts so L2/L3/L4 meaning is unchanged.

Grounded in the AWS Agentic AI Security Scoping Matrix (progressive autonomy),
EU AI Act Art. 14 (oversight transforms, never vanishes), and NIST AI RMF
MANAGE 2.4/4.1 (supersede/override) for the step-down being a first-class action.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

# Autonomy scope levels: 1 No Agency -> 2 Prescribed -> 3 Supervised -> 4 Full.
AgentScopeLevel = int

GraduationVerdict = str  # "ready" | "conditional" | "not_ready"


class RatchetDirection(str, Enum):
    UP = "up"
    HOLD = "hold"
    DOWN = "down"


# Per-target-level graduation thresholds — ported verbatim from the frontend
# graduationData.ts THRESHOLDS so the meaning of L2/L3/L4 is identical.
THRESHOLDS: Dict[int, Dict[str, float]] = {
    2: {"decisions": 200,  "days": 14, "maxIncidentRate": 2.0, "maxErrorRate": 3.0, "maxGuardrail": 2.0, "minAgreement": 85},
    3: {"decisions": 500,  "days": 30, "maxIncidentRate": 1.0, "maxErrorRate": 2.0, "maxGuardrail": 1.0, "minAgreement": 90},
    4: {"decisions": 5000, "days": 90, "maxIncidentRate": 0.2, "maxErrorRate": 1.0, "maxGuardrail": 0.5, "minAgreement": 95},
}

# How agent decision actions map to agreement vs override (for agreement rate).
AGREEMENT_ACTIONS = {"approve", "answer", "acknowledge", "choose"}
PARTIAL_ACTIONS = {"approve-with-edit"}   # counted as partial agreement (0.5)
OVERRIDE_ACTIONS = {"reject", "escalate", "take-over"}


class Ratchet(BaseModel):
    direction: RatchetDirection = RatchetDirection.HOLD
    step_down_triggered: bool = False
    step_down_reason: Optional[str] = None
    triggered_by_event_id: Optional[str] = None  # provenance link into the audit log
    last_ratchet_at: Optional[datetime] = None
    promoted_by: Optional[str] = None
    promoted_at: Optional[datetime] = None
    probation_until: Optional[str] = None


class GraduationRecordBase(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120)
    name: str = Field(default="", max_length=200)
    business_unit: str = Field(default="", max_length=120)
    current_level: AgentScopeLevel = 2
    has_policy: bool = True
    reviewer_hours_per_month: int = 0


class GraduationRecordCreate(GraduationRecordBase):
    pass


class GraduationRecord(GraduationRecordBase):
    """Persisted grant-intent state-of-record. Signals are NOT stored here."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    ratchet: Ratchet = Field(default_factory=Ratchet)


class GraduationCriterion(BaseModel):
    label: str
    requirement: str
    value: str
    status: str  # pass | warning | fail | insufficient
    blocking: bool
    detail: Optional[str] = None


class ComputedSignals(BaseModel):
    """Computed live from the audit log each request — never persisted."""
    decisions_in_scope: int = 0
    agreement_rate: int = 0            # %
    agreement_trend: str = "flat"      # rising | flat | falling
    guardrail_intervention_rate: float = 0.0
    open_incidents: int = 0
    incident_rate: float = 0.0
    error_rate: float = 0.0
    days_in_scope: int = 0
    window_counts: Dict[str, int] = Field(default_factory=dict)
    sufficient_evidence: bool = False  # enough decisions to judge at all


class AgentGraduation(BaseModel):
    """The full drop-in payload for the frontend EarnedAutonomyView."""
    agent_id: str
    name: str
    business_unit: str
    current_level: AgentScopeLevel
    target_level: Optional[AgentScopeLevel]
    verdict: GraduationVerdict
    readiness: int
    summary: str
    criteria: List[GraduationCriterion]
    signals: ComputedSignals
    ratchet: Ratchet
    reviewer_hours_per_month: int


class GraduationSummary(BaseModel):
    total: int = 0
    ready: int = 0
    conditional: int = 0
    not_ready: int = 0
    step_down_recommended: int = 0
    reclaimable_hours_per_month: int = 0
    pct_at_low_autonomy: int = 0


def _verdict_from(criteria: List[GraduationCriterion]) -> GraduationVerdict:
    """Identical logic to graduationData.ts verdictFrom: blocking fail -> not_ready,
    any non-pass -> conditional, else ready."""
    if any(c.blocking and c.status == "fail" for c in criteria):
        return "not_ready"
    if any(c.status != "pass" for c in criteria):
        return "conditional"
    return "ready"


def compute(record: GraduationRecord, signals: ComputedSignals) -> AgentGraduation:
    """Build the graduation criteria + verdict from real computed signals."""
    current = record.current_level
    target: Optional[int] = current + 1 if current < 4 else None
    criteria: List[GraduationCriterion] = []

    if target is not None:
        t = THRESHOLDS[target]

        def pf(ok: bool, blocking: bool = True) -> str:
            return "pass" if ok else ("fail" if blocking else "warning")

        # Insufficient evidence is a first-class status (critique fix): if the
        # agent has too few decisions, don't fake a pass/fail — say so.
        if not signals.sufficient_evidence:
            criteria.append(GraduationCriterion(
                label="Decisions in current scope",
                requirement=f">= {int(t['decisions'])}",
                value=str(signals.decisions_in_scope),
                status="insufficient", blocking=True,
                detail="Not enough real decisions logged yet to judge readiness.",
            ))
        else:
            criteria.append(GraduationCriterion(
                label="Decisions in current scope",
                requirement=f">= {int(t['decisions'])}",
                value=str(signals.decisions_in_scope),
                status=pf(signals.decisions_in_scope >= t["decisions"]), blocking=True,
            ))

        criteria.append(GraduationCriterion(
            label="Time at current level", requirement=f">= {int(t['days'])}d",
            value=f"{signals.days_in_scope}d",
            status=pf(signals.days_in_scope >= t["days"]), blocking=True))
        criteria.append(GraduationCriterion(
            label="Open incidents", requirement="0", value=str(signals.open_incidents),
            status=pf(signals.open_incidents == 0), blocking=True))
        criteria.append(GraduationCriterion(
            label="Incident rate", requirement=f"<= {t['maxIncidentRate']}/1k",
            value=f"{signals.incident_rate}/1k",
            status=pf(signals.incident_rate <= t["maxIncidentRate"], False), blocking=False))
        criteria.append(GraduationCriterion(
            label="Guardrail intervention rate", requirement=f"<= {t['maxGuardrail']}%",
            value=f"{signals.guardrail_intervention_rate}%",
            status=pf(signals.guardrail_intervention_rate <= t["maxGuardrail"], False), blocking=False))
        criteria.append(GraduationCriterion(
            label="Human agreement rate", requirement=f">= {int(t['minAgreement'])}%",
            value=f"{signals.agreement_rate}% {'▲' if signals.agreement_trend == 'rising' else '▼' if signals.agreement_trend == 'falling' else ''}".strip(),
            status=pf(signals.sufficient_evidence and signals.agreement_rate >= t["minAgreement"] and signals.agreement_trend != "falling"),
            blocking=True,
            detail=("Reviewers approve nearly everything — oversight adds little marginal safety."
                    if signals.agreement_rate >= t["minAgreement"] else
                    "Reviewers still overturn enough proposals that the human is adding safety.")))
        criteria.append(GraduationCriterion(
            label="Active guardrail policy", requirement="attached",
            value="yes" if record.has_policy else "none",
            status=pf(record.has_policy), blocking=True))

    # Step-down (from persisted ratchet) forces not_ready regardless.
    if record.ratchet.step_down_triggered:
        verdict = "not_ready"
    else:
        verdict = "ready" if target is None else _verdict_from(criteria)

    passed = sum(1 for c in criteria if c.status == "pass")
    readiness = round(passed / len(criteria) * 100) if criteria else 100

    if record.ratchet.step_down_triggered:
        summary = f"Stepped down: {record.ratchet.step_down_reason or 'adverse signal'}."
    elif target is None:
        summary = "At maximum autonomy (L4 Full Agency)."
    elif not signals.sufficient_evidence:
        summary = f"Insufficient evidence — {signals.decisions_in_scope} decisions logged so far."
    elif verdict == "ready":
        summary = f"Earned L{target}. {signals.agreement_rate}% agreement over {signals.days_in_scope}d, {signals.open_incidents} open incidents."
    elif verdict == "conditional":
        summary = f"Eligible for L{target} with monitoring — some criteria not yet met."
    else:
        blocking_fails = sum(1 for c in criteria if c.blocking and c.status == "fail")
        summary = f"Not yet ready for L{target} — {blocking_fails} blocking criteria unmet."

    return AgentGraduation(
        agent_id=record.agent_id, name=record.name, business_unit=record.business_unit,
        current_level=current, target_level=target, verdict=verdict, readiness=readiness,
        summary=summary, criteria=criteria, signals=signals, ratchet=record.ratchet,
        reviewer_hours_per_month=record.reviewer_hours_per_month,
    )
