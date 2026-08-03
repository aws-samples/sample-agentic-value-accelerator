"""Govern Guardrails — real Bedrock Guardrails telemetry, read-through.

Two live AWS sources:
  - bedrock:ListGuardrails            → the account's configured guardrails
  - cloudwatch AWS/Bedrock/Guardrails → real Invocations / InvocationsIntervened,
    both per-guardrail (GuardrailArn) and per-policy-type (GuardrailPolicyType:
    ContentPolicy | TopicPolicy | WordPolicy | SensitiveInformationPolicy |
    ContextualGroundingPolicy).

This is a live safety/bias signal: what the account's guardrails actually blocked
or redacted — content filters (hate/violence/insults/…), denied topics, PII
redaction, and contextual-grounding checks. Honest live/source/note flags,
graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class GuardrailSummary(BaseModel):
    """One configured guardrail, from ListGuardrails."""

    guardrail_id: str
    name: str
    status: str = Field("", description="e.g. READY | FAILED | …")
    version: str = ""
    description: Optional[str] = None
    created_at: Optional[str] = Field(default=None, description="createdAt ISO8601, if present")
    # Per-guardrail CloudWatch rollup over the window (0 when no metrics emitted).
    invocations: int = 0
    interventions: int = 0
    intervention_rate_pct: float = 0.0
    has_metrics: bool = Field(False, description="True when CloudWatch returned data for this guardrail")


class PolicyBreakdown(BaseModel):
    """Interventions attributed to one guardrail policy type across the account."""

    policy_type: str = Field(..., description="ContentPolicy | TopicPolicy | WordPolicy | SensitiveInformationPolicy | ContextualGroundingPolicy")
    label: str = Field(..., description="Human-friendly label")
    interventions: int = 0
    dimension: str = Field("", description="What this policy guards, e.g. 'PII / sensitive data'")


class GuardrailTelemetryResponse(BaseModel):
    """The account's guardrail fleet + real intervention telemetry."""

    guardrails: List[GuardrailSummary] = Field(default_factory=list)
    by_policy: List[PolicyBreakdown] = Field(default_factory=list)
    total_guardrails: int = 0
    total_invocations: int = 0
    total_interventions: int = 0
    intervention_rate_pct: float = Field(0.0, description="interventions / invocations * 100 over the window")
    guardrails_with_metrics: int = 0
    window_days: int = 30
    live: bool
    source: str
    note: Optional[str] = None
