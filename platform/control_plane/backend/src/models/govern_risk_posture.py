"""Govern Risk Posture — real AWS Security Hub findings, read-through.

Source of truth: securityhub:GetFindings. Surfaces the account's real security
findings as a risk-posture signal — a severity roll-up plus the top open findings
mapped to a risk level. Distinct from the governance risk REGISTER (internal
process state); this is live AWS telemetry.

Honest live/source/note flags, graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SecurityFinding(BaseModel):
    """One Security Hub finding, trimmed to the fields the risk surface shows."""

    id: str
    title: str
    severity: str = Field(..., description="CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL")
    product: str = Field("", description="ProductName, e.g. 'Security Hub' / 'GuardDuty' / 'Inspector'")
    compliance_status: Optional[str] = Field(default=None, description="PASSED | FAILED | WARNING | NOT_AVAILABLE")
    resource_type: Optional[str] = Field(default=None, description="Resources[0].Type")
    updated_at: Optional[str] = None


class SeverityCount(BaseModel):
    severity: str
    count: int


class RiskPostureResponse(BaseModel):
    """Security Hub risk posture — severity roll-up + top open findings."""

    by_severity: List[SeverityCount] = Field(default_factory=list)
    top_findings: List[SecurityFinding] = Field(default_factory=list)
    total: int = 0
    critical: int = 0
    high: int = 0
    live: bool
    source: str
    note: Optional[str] = None
