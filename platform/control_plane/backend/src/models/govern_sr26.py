"""Govern SR 26-2 — agent-aware model-risk-management control mapping.

Represents the CURRENT US model-risk guidance of record — Federal Reserve/OCC/
FDIC SR 26-2 (Apr 2026), which supersedes SR 11-7 — reframed for AUTONOMOUS
AGENTS, not just static models. This is FSI whitespace: MRM-credible vendors are
model-centric, and agent-forward vendors lack MRM.

The differentiator over a static compliance checklist: each control carries a
BINDING that resolves against a live signal (a real audit-log query, a handoff
record, a guardrail check, an agent's autonomy level, or a graduation signal).
evaluate() walks the bindings and flips controls to pass/warning/fail backed by
real evidence, computing an evidence_backed_pct — "here is how AVA satisfies
SR 26-2 for agents, proven against the real log," not a self-attestation.

CAVEAT: SR 26-2's exact clause text should be confirmed against the Fed letter;
the control catalog reflects the guidance's structure (inventory, validation /
effective challenge, ongoing monitoring, governance, risk-tiering by materiality)
reframed for agents, and is labeled as such.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

# Reuse the conformance status vocabulary for consistency across Govern.
from models.govern_conformance import ConformanceStatus


class BindingKind(str, Enum):
    AUDIT_QUERY = "audit_query"          # resolves against the real audit log
    HANDOFF_RECORD = "handoff_record"    # a human-oversight decision exists
    GUARDRAIL_CHECK = "guardrail_check"  # the live Bedrock guardrail signal
    AUTONOMY_LEVEL = "autonomy_level"    # agent's scope level (client-supplied)
    GRADUATION_SIGNAL = "graduation_signal"  # earned-autonomy signal (client-supplied)
    MANUAL = "manual"                    # human attestation only


class SignalSource(str, Enum):
    LIVE = "live"                        # resolved against real persisted data
    CLIENT_SUPPLIED = "client_supplied"  # passed in by the frontend
    PENDING = "pending"                  # no feed yet — honest


class SR26Binding(BaseModel):
    kind: BindingKind = BindingKind.MANUAL
    # For AUDIT_QUERY: category to count and the window; expectation is min count
    # (>=) unless max_count set (interventions should be <= threshold).
    category: Optional[str] = None
    severity_min: Optional[str] = None
    since_days: Optional[int] = 30
    min_count: Optional[int] = None
    max_count: Optional[int] = None
    detail: Optional[str] = None


class SR26Control(BaseModel):
    id: str = Field(..., description="e.g. SR26-INV-1")
    label: str
    # How this SR 26-2 model-control is reframed for autonomous agents.
    agent_reframe: str
    binding: SR26Binding = Field(default_factory=SR26Binding)
    status: ConformanceStatus = ConformanceStatus.NOT_STARTED
    # Evaluation output (populated by evaluate()):
    evaluated_value: Optional[str] = None
    signal_source: SignalSource = SignalSource.PENDING
    iso42001_ref: Optional[str] = Field(default=None, description="cross-ref to an ISO 42001 clause control")


class SR26Pillar(BaseModel):
    key: str
    name: str
    controls: List[SR26Control] = Field(default_factory=list)


class SR26Computed(BaseModel):
    total_controls: int = 0
    passed: int = 0
    warning: int = 0
    failed: int = 0
    not_started: int = 0
    conformance_pct: int = 0
    # The differentiator metric: % of controls backed by a LIVE resolved signal
    # (not manual attestation), among applicable controls.
    evidence_backed_pct: int = 0
    last_evaluated_at: Optional[datetime] = None


class SR26MappingBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    standard: str = Field(default="SR 26-2 (Apr 2026, supersedes SR 11-7)", max_length=160)
    agent_id: Optional[str] = Field(default=None, description="agent this mapping applies to")
    materiality_tier: str = Field(default="Tier 1 (Material)", max_length=80)


class SR26MappingCreate(SR26MappingBase):
    pillars: Optional[List[SR26Pillar]] = None


class SR26MappingUpdate(BaseModel):
    name: Optional[str] = None
    materiality_tier: Optional[str] = None
    pillars: Optional[List[SR26Pillar]] = None


class SR26Mapping(SR26MappingBase):
    sr26_id: str = Field(default_factory=lambda: f"sr26-{__import__('uuid').uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    pillars: List[SR26Pillar] = Field(default_factory=list)
    computed: Optional[SR26Computed] = None


def default_catalog() -> List[SR26Pillar]:
    """The agent-reframed SR 26-2 control catalog (structure per the guidance;
    exact clause text to be confirmed against the Fed letter). Bindings point at
    the real signals AVA already produces."""
    return [
        SR26Pillar(key="inventory", name="Model & Agent Inventory", controls=[
            SR26Control(id="SR26-INV-1", label="Comprehensive model inventory maintained",
                agent_reframe="Every autonomous agent is registered with owner, scope level, and tools — the agent registry is the inventory of record.",
                binding=SR26Binding(kind=BindingKind.MANUAL, detail="Agent registry present."),
                iso42001_ref="ISO-8.3"),
            SR26Control(id="SR26-INV-2", label="Materiality/risk tiering of models",
                agent_reframe="Agents are risk-tiered; autonomy level (L1-L4) is a first-class materiality input.",
                binding=SR26Binding(kind=BindingKind.AUTONOMY_LEVEL, detail="Agent scope level drives tiering.")),
        ]),
        SR26Pillar(key="validation", name="Validation & Effective Challenge", controls=[
            SR26Control(id="SR26-VAL-1", label="Independent validation before use",
                agent_reframe="Agent behavior is evaluated (eval suite / deployment gate) before a scope level is granted.",
                binding=SR26Binding(kind=BindingKind.MANUAL, detail="Deployment gate verdict on record."),
                iso42001_ref="ISO-8.2"),
            SR26Control(id="SR26-VAL-2", label="Effective challenge documented",
                agent_reframe="Human reviewers challenge agent proposals via the handoff workspace; overrides are logged as effective challenge.",
                binding=SR26Binding(kind=BindingKind.HANDOFF_RECORD, category="approval", since_days=90, min_count=1,
                    detail="At least one human decision (challenge) recorded for this agent.")),
        ]),
        SR26Pillar(key="monitoring", name="Ongoing Monitoring", controls=[
            SR26Control(id="SR26-MON-1", label="Ongoing performance monitoring",
                agent_reframe="Agent decisions are continuously logged and auditable; guardrail interventions are captured live.",
                binding=SR26Binding(kind=BindingKind.AUDIT_QUERY, category="approval", since_days=30, min_count=1,
                    detail="Decisions logged for this agent in the last 30 days.")),
            SR26Control(id="SR26-MON-2", label="Guardrail / limit breaches surfaced",
                agent_reframe="Real Bedrock guardrail interventions are recorded to the audit log with decision-context.",
                binding=SR26Binding(kind=BindingKind.GUARDRAIL_CHECK, category="guardrail", since_days=30,
                    detail="Guardrail check signal wired (live Bedrock ApplyGuardrail).")),
        ]),
        SR26Pillar(key="governance", name="Governance & Oversight", controls=[
            SR26Control(id="SR26-GOV-1", label="Board/senior oversight of model risk",
                agent_reframe="Human oversight is enforced by autonomy-gated HITL; oversight transforms (not vanishes) as agents graduate.",
                binding=SR26Binding(kind=BindingKind.GRADUATION_SIGNAL, detail="Earned-autonomy ratchet governs oversight."),
                iso42001_ref="ISO-5.1"),
            SR26Control(id="SR26-GOV-2", label="Roles and accountability defined",
                agent_reframe="Every agent decision records actor + decision-context — accountability is examiner-visible.",
                binding=SR26Binding(kind=BindingKind.AUDIT_QUERY, category="approval", since_days=90, min_count=1,
                    detail="Accountable, attributed decisions on record."),
                iso42001_ref="ISO-5.3"),
        ]),
    ]


def compute(mapping: SR26Mapping) -> SR26Computed:
    counts = {s: 0 for s in ConformanceStatus}
    total = 0
    live = 0
    applicable = 0
    for p in mapping.pillars:
        for c in p.controls:
            counts[c.status] += 1
            total += 1
            if c.status != ConformanceStatus.NOT_APPLICABLE:
                applicable += 1
                if c.signal_source == SignalSource.LIVE:
                    live += 1
    pct = round(counts[ConformanceStatus.PASS] / applicable * 100) if applicable else 0
    evidence_pct = round(live / applicable * 100) if applicable else 0
    return SR26Computed(
        total_controls=total, passed=counts[ConformanceStatus.PASS],
        warning=counts[ConformanceStatus.IN_PROGRESS], failed=counts[ConformanceStatus.FAIL],
        not_started=counts[ConformanceStatus.NOT_STARTED],
        conformance_pct=pct, evidence_backed_pct=evidence_pct,
        last_evaluated_at=datetime.utcnow(),
    )
