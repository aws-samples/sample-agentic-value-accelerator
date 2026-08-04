"""Govern Enforcement — runtime allow/pause/deny for agent actions.

The leapfrog differentiator (nobody in the field is GA): a deterministic,
autonomy-ladder-bound policy decision point (PDP). Given an agent's scope level,
a requested action/tool, its risk tier, and policy — return allow | pause | deny
with a reason, and RECORD the decision to the audit log. "pause" routes into the
Human Oversight handoff workspace; the human's resolution writes a second linked
decision — a fully local, examiner-provable loop.

Honest seam (per critique): the DECISION ENGINE + policy + audit wiring are fully
real and buildable today. The actual INTERCEPTION point (calling this before an
agent executes a tool) needs live agent execution (Bedrock AgentCore / a running
agent). So every decision is stamped enforcement_mode = advisory | blocking and a
source_principal — locally it's a real engine with a demoable evaluate endpoint;
the live blocking intercept is the seam.

The standout artifact is AUTONOMY_GATE: scope_level x action_type x risk_tier ->
the default disposition. Grounded in the AWS Agentic AI Security Scoping Matrix
per-scope controls and OWASP Agentic (excessive agency / T-series).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Disposition(str, Enum):
    ALLOW = "allow"
    PAUSE = "pause"   # -> human handoff
    DENY = "deny"


class ActionType(str, Enum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    EXTERNAL = "external"   # external API / comms
    ADMIN = "admin"


class RiskTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EnforcementMode(str, Enum):
    ADVISORY = "advisory"   # decision computed + recorded, not blocking (local default)
    BLOCKING = "blocking"   # decision enforced at a live intercept (needs agent infra)


# THE HERO ARTIFACT — the autonomy-ladder gate.
# AUTONOMY_GATE[scope_level][action_type][risk_tier] -> default Disposition.
# Reading: the higher the agent's scope level, the more it may do without a human;
# the higher the action's risk, the more likely a pause/deny even at high scope.
# L1 No Agency: read-only. L2 Prescribed: writes pause for human approval.
# L3 Supervised: autonomous within guardrails, high-risk pauses. L4 Full Agency:
# broad autonomy, only critical/admin pauses; nothing is a blanket deny by scope.
def _gate() -> Dict[int, Dict[str, Dict[str, str]]]:
    A, P, D = Disposition.ALLOW.value, Disposition.PAUSE.value, Disposition.DENY.value
    return {
        1: {  # No Agency — read-only advisory
            "read":     {"low": A, "medium": A, "high": P, "critical": P},
            "write":    {"low": D, "medium": D, "high": D, "critical": D},
            "execute":  {"low": D, "medium": D, "high": D, "critical": D},
            "external": {"low": D, "medium": D, "high": D, "critical": D},
            "admin":    {"low": D, "medium": D, "high": D, "critical": D},
        },
        2: {  # Prescribed Agency — per-action human approval for state changes
            "read":     {"low": A, "medium": A, "high": A, "critical": P},
            "write":    {"low": P, "medium": P, "high": P, "critical": D},
            "execute":  {"low": P, "medium": P, "high": D, "critical": D},
            "external": {"low": P, "medium": P, "high": D, "critical": D},
            "admin":    {"low": D, "medium": D, "high": D, "critical": D},
        },
        3: {  # Supervised Agency — autonomous within guardrails; escalate high-risk
            "read":     {"low": A, "medium": A, "high": A, "critical": A},
            "write":    {"low": A, "medium": A, "high": P, "critical": P},
            "execute":  {"low": A, "medium": A, "high": P, "critical": D},
            "external": {"low": A, "medium": P, "high": P, "critical": D},
            "admin":    {"low": P, "medium": P, "high": D, "critical": D},
        },
        4: {  # Full Agency — broad autonomy; only critical/admin pause; audit-heavy
            "read":     {"low": A, "medium": A, "high": A, "critical": A},
            "write":    {"low": A, "medium": A, "high": A, "critical": P},
            "execute":  {"low": A, "medium": A, "high": A, "critical": P},
            "external": {"low": A, "medium": A, "high": P, "critical": P},
            "admin":    {"low": P, "medium": P, "high": P, "critical": D},
        },
    }


AUTONOMY_GATE = _gate()


def gate_disposition(scope_level: int, action_type: str, risk_tier: str) -> Disposition:
    lvl = AUTONOMY_GATE.get(scope_level, AUTONOMY_GATE[2])
    act = lvl.get(action_type, lvl["write"])
    return Disposition(act.get(risk_tier, act.get("high", "pause")))


# --- Policy (versioned CRUD; explicit rules layered on top of the gate) ---

class EnforcementRule(BaseModel):
    # A rule matches on any subset of {agent_id, action_type, tool, risk_tier}.
    agent_id: Optional[str] = None
    action_type: Optional[str] = None
    tool: Optional[str] = None
    risk_tier: Optional[str] = None
    effect: Disposition = Disposition.DENY
    reason: Optional[str] = None


class EnforcementPolicyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    rules: List[EnforcementRule] = Field(default_factory=list)
    enabled: bool = True


class EnforcementPolicyCreate(EnforcementPolicyBase):
    pass


class EnforcementPolicy(EnforcementPolicyBase):
    policy_id: str = Field(default_factory=lambda: f"ep-{uuid.uuid4().hex[:10]}")
    version: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# --- Decision (append-only) ---

class EnforcementRequest(BaseModel):
    agent_id: str = Field(..., min_length=1)
    scope_level: int = Field(..., ge=1, le=4)
    action_type: ActionType
    tool: str = Field(default="", max_length=200)
    risk_tier: RiskTier = RiskTier.MEDIUM
    args: Optional[str] = Field(default=None, description="raw args — stored only as a sha256 fingerprint")
    source_principal: str = Field(default="unknown", max_length=200)


class EnforcementDecision(BaseModel):
    id: str = Field(default_factory=lambda: f"ed-{uuid.uuid4().hex[:12]}")
    ts: datetime = Field(default_factory=datetime.utcnow)
    agent_id: str
    scope_level: int
    action_type: str
    tool: str
    risk_tier: str
    disposition: Disposition
    reason: str
    matched_by: str  # "policy:<id>" | "ladder-gate" | "tool-approval" | "default"
    enforcement_mode: EnforcementMode = EnforcementMode.ADVISORY
    source_principal: str = "unknown"
    args_fingerprint: Optional[str] = None
    # Loop linkage: a pause creates a handoff; the resolution links back.
    handoff_id: Optional[str] = None
    resolved_decision_id: Optional[str] = None


def fingerprint(args: Optional[str]) -> Optional[str]:
    if not args:
        return None
    return "sha256:" + hashlib.sha256(args.encode("utf-8")).hexdigest()[:24]
