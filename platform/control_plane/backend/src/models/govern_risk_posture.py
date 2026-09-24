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

from models.govern_region_provenance import RegionProvenance


class SecurityFinding(BaseModel):
    """One Security Hub finding, trimmed to the fields the risk surface shows."""

    id: str
    title: str
    severity: str = Field(..., description="CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL")
    product: str = Field("", description="ProductName, e.g. 'Security Hub' / 'GuardDuty' / 'Inspector'")
    compliance_status: Optional[str] = Field(default=None, description="PASSED | FAILED | WARNING | NOT_AVAILABLE")
    resource_type: Optional[str] = Field(default=None, description="Resources[0].Type")
    updated_at: Optional[str] = None
    region: Optional[str] = Field(
        default=None,
        description=(
            "Security Hub region this finding was read from. Remediation is region-scoped, "
            "so a finding with no region is not actionable."
        ),
    )


class SeverityCount(BaseModel):
    severity: str
    count: int


class RiskPostureResponse(BaseModel):
    """Security Hub risk posture — severity roll-up + top open findings.

    Aggregated across governed regions, EXCEPT when the account has Security Hub
    cross-region finding aggregation enabled: the aggregation region's findings
    already include every linked region, so fanning out would count the same finding
    once per region. In that case the read is single-region by design and `note` says
    which region and why.
    """

    by_severity: List[SeverityCount] = Field(default_factory=list)
    top_findings: List[SecurityFinding] = Field(default_factory=list)
    total: int = Field(
        0,
        description=(
            "Active findings counted within the scan window. When `truncated` is true "
            "this is a floor, not the account's finding count."
        ),
    )
    critical: int = 0
    high: int = 0
    scanned: int = Field(0, description="Findings actually examined to build these counts")
    truncated: bool = Field(
        False,
        description=(
            "True when Security Hub had more findings than the scan limit. Every count "
            "here is then a floor - raise `scan` for the full picture."
        ),
    )
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )
