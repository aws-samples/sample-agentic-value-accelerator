"""Govern Security — unified AWS security posture, read-through.

Aggregates findings from the account's real security services — GuardDuty
(threats), Macie (sensitive-data exposure), Inspector (vulnerabilities), and
IAM Access Analyzer (external access) — each from its OWN API (not via Security
Hub, whose default view is dominated by its own control findings).

Privacy note: finding TITLE/RESOURCE strings embed identifiers (role names, CVEs,
bucket names, ARNs). This posture rollup surfaces finding TYPE + severity +
resource-TYPE + counts, deliberately NOT the raw sensitive titles.

Honest live/source/note flags; graceful live=False per source so one unreachable
service never breaks the others.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SeverityCount(BaseModel):
    severity: str = Field(..., description="CRITICAL | HIGH | MEDIUM | LOW")
    count: int


class SecuritySourceSummary(BaseModel):
    """One security service's contribution to the posture."""

    source: str = Field(..., description="guardduty | macie | inspector | access-analyzer")
    label: str = Field(..., description="Display name, e.g. 'GuardDuty'")
    dimension: str = Field(..., description="What it governs, e.g. 'Threats', 'Sensitive data'")
    total: int = 0
    critical: int = 0
    high: int = 0
    by_severity: List[SeverityCount] = Field(default_factory=list)
    top_types: List[str] = Field(default_factory=list, description="Most common finding TYPES (non-sensitive)")
    live: bool = False
    note: Optional[str] = Field(default=None, description="Why this source is empty/unavailable, if so")


class SecurityPostureResponse(BaseModel):
    """Unified security posture across the account's security services."""

    sources: List[SecuritySourceSummary] = Field(default_factory=list)
    total_findings: int = 0
    critical: int = 0
    high: int = 0
    sources_live: int = Field(0, description="Count of services returning live data")
    sources_total: int = 0
    live: bool = Field(..., description="True when at least one service is live")
    source: str
    note: Optional[str] = None
