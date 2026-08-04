"""Govern Trail — real CloudTrail activity for AI services, read-through.

Source of truth: cloudtrail:LookupEvents. Surfaces recent AI-service API activity
(Bedrock, SageMaker) as an audit-trail signal — who invoked what, when, and
whether it errored. Complements the guardrail-intervention audit bridge and the
CloudWatch invocation metrics.

Honest live/source/note flags, graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TrailEvent(BaseModel):
    """One CloudTrail event, trimmed to the audit-trail fields."""

    event_id: str
    event_name: str = Field(..., description="e.g. 'InvokeModelWithResponseStream'")
    event_source: str = Field(..., description="e.g. 'bedrock.amazonaws.com'")
    event_time: Optional[str] = None
    username: Optional[str] = Field(default=None, description="Invoking identity, if present")
    error_code: Optional[str] = Field(default=None, description="Present only when the call errored")


class TrailResponse(BaseModel):
    """Recent AI-service CloudTrail activity + a small roll-up."""

    events: List[TrailEvent] = Field(default_factory=list)
    total: int = 0
    by_source: dict = Field(default_factory=dict, description="event_source -> count")
    errors: int = Field(0, description="Events carrying an error code")
    window_hours: int = 24
    live: bool
    source: str
    note: Optional[str] = None


class AiCaller(BaseModel):
    """A distinct identity observed invoking AI services in CloudTrail.

    A shadow-AI SIGNAL, not a verdict: an identity calling Bedrock/SageMaker that
    isn't a known governed agent is a candidate for review. Whether it's truly
    "shadow" depends on how complete the governed registry is.
    """

    identity: str = Field(..., description="Invoking identity (username or role ARN tail)")
    event_count: int = 0
    sources: List[str] = Field(default_factory=list, description="Distinct event sources, e.g. bedrock/sagemaker")
    top_actions: List[str] = Field(default_factory=list, description="Most frequent event names")
    last_seen: Optional[str] = None
    recognized: bool = Field(False, description="True if the identity matches a known governed agent/registry entry")


class AiCallersResponse(BaseModel):
    """Distinct AI-service callers from CloudTrail, flagged recognized vs unrecognized.

    Honest framing: unrecognized ≠ malicious. This is an anomaly/coverage signal —
    identities using AI that the governed registry doesn't know about.
    """

    callers: List[AiCaller] = Field(default_factory=list)
    total_callers: int = 0
    unrecognized: int = Field(0, description="Callers not matched to a governed agent")
    window_hours: int = 24
    live: bool
    source: str
    note: Optional[str] = None
