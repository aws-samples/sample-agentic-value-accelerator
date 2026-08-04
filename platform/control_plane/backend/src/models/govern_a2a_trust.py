"""Govern A2A Trust — enforced agent-to-agent delegation authorization.

Unclaimed territory (competitors claim "network-level" A2A with no mechanism).
The differentiator AVA OWNS is the AUTONOMY CEILING: one agent cannot delegate
more autonomy than either party holds — effective ceiling =
min(source.scope_level, target.scope_level, policy.max_delegated_autonomy).

Per the adversarial critique, this deliberately does NOT reimplement a general
policy engine — the org already ships a Cedar/AgentCore PolicyService. This owns
only (a) the A2A subject shape (source/target agent + delegated action +
constraints) and (b) the autonomy-ladder gate on top. It can export a Cedar
policy statement as the bridge to the existing AgentCore gateway enforcement.

Grounded in OWASP Agentic (T14 rogue agents / inter-agent trust) and AWS
AgentCore identity/gateway concepts.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

AgentScopeLevel = int


class TrustEffect(str, Enum):
    PERMIT = "permit"
    DENY = "deny"


class DeniedBy(str, Enum):
    NO_POLICY = "no_policy"                # default-deny, no matching policy
    EXPLICIT_DENY = "explicit_deny"        # a policy forbids it
    ACTION_NOT_ALLOWED = "action_not_allowed"
    CHAIN_DEPTH = "chain_depth"            # delegation chain too deep
    AUTONOMY_CEILING = "autonomy_ceiling"  # the differentiator: exceeds ceiling


class AgentIdentityBase(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120)
    name: str = Field(default="", max_length=200)
    scope_level: AgentScopeLevel = 2
    role_arn: Optional[str] = None


class AgentIdentityCreate(AgentIdentityBase):
    pass


class AgentIdentity(AgentIdentityBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TrustConstraint(BaseModel):
    max_chain_depth: int = 2
    allowed_data_classes: List[str] = Field(default_factory=list)  # empty = any
    detail: Optional[str] = None


class TrustPolicyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    # fnmatch patterns: "agt-*" etc.
    source_pattern: str = Field(default="*", max_length=120)
    target_pattern: str = Field(default="*", max_length=120)
    allowed_actions: List[str] = Field(default_factory=list)  # empty = any
    effect: TrustEffect = TrustEffect.PERMIT
    priority: int = 100  # lower evaluates first
    max_delegated_autonomy: AgentScopeLevel = 4
    constraint: TrustConstraint = Field(default_factory=TrustConstraint)
    enabled: bool = True


class TrustPolicyCreate(TrustPolicyBase):
    pass


class TrustPolicyUpdate(BaseModel):
    name: Optional[str] = None
    source_pattern: Optional[str] = None
    target_pattern: Optional[str] = None
    allowed_actions: Optional[List[str]] = None
    effect: Optional[TrustEffect] = None
    priority: Optional[int] = None
    max_delegated_autonomy: Optional[AgentScopeLevel] = None
    constraint: Optional[TrustConstraint] = None
    enabled: Optional[bool] = None


class TrustPolicy(TrustPolicyBase):
    policy_id: str = Field(default_factory=lambda: f"tp-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DelegationRequest(BaseModel):
    source_agent_id: str = Field(..., min_length=1)
    target_agent_id: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1, max_length=200)
    requested_autonomy: AgentScopeLevel = Field(default=2, ge=1, le=4)
    chain_depth: int = Field(default=1, ge=1)
    data_class: Optional[str] = None


class DelegationDecision(BaseModel):
    id: str = Field(default_factory=lambda: f"da-{uuid.uuid4().hex[:12]}")
    ts: datetime = Field(default_factory=datetime.utcnow)
    source_agent_id: str
    target_agent_id: str
    action: str
    effect: TrustEffect
    denied_by: Optional[DeniedBy] = None
    reason: str = ""
    matched_policy_id: Optional[str] = None
    # The differentiator, surfaced explicitly:
    effective_autonomy_ceiling: int = 0
    requested_autonomy: int = 0
    source_scope: int = 0
    target_scope: int = 0
