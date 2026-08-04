"""Govern Audit — append-only audit / decision log for the Govern module.

Records governance events: guardrail activity, incidents, human approvals/
decisions (e.g. from the Human Oversight handoff workspace), deployments, and
config changes. Distinguishes API-level logging ("what happened", via
summary/action/evidence) from decision-context logging ("why it happened", via
decision_context) — per the AWS agentic-governance framework.

Append-only: events are created and read, never updated or deleted, so the log
is a durable system-of-record for examiners. Mirrors the shape of the frontend
AuditEvent type (components/govern/mockData.ts) so it is a drop-in for the
existing auditLog store.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AuditCategory(str, Enum):
    GUARDRAIL = "guardrail"
    INCIDENT = "incident"
    APPROVAL = "approval"
    DEPLOYMENT = "deployment"
    CONFIG = "config"
    ENFORCEMENT = "enforcement"
    A2A = "a2a"


class AuditSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AuditEventBase(BaseModel):
    category: AuditCategory
    severity: AuditSeverity = AuditSeverity.LOW
    actor: str = Field(..., min_length=1, max_length=240)
    summary: str = Field(..., min_length=1, max_length=500)
    action: str = Field(..., min_length=1, max_length=500)
    agent: Optional[str] = Field(default=None, max_length=240)
    evidence: Optional[str] = Field(default=None, max_length=500)
    # Decision-context ("why it happened") — distinct from action ("what happened").
    decision_context: Optional[str] = Field(default=None, max_length=4000)


class AuditEventCreate(AuditEventBase):
    """Payload to append a new audit event. Timestamp/id are server-assigned."""


class AuditEvent(AuditEventBase):
    id: str = Field(default_factory=lambda: f"ae-{uuid.uuid4().hex[:12]}")
    ts: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
