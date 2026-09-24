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

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from models.govern_region_provenance import RegionProvenance


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
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class VulnerabilityFinding(BaseModel):
    """One Inspector2 vulnerability finding — snake_case mirror of the client shape.

    Sensitive identifiers are masked/shortened before exposure: the finding ARN
    keeps its shape but its account ID is masked, and the resource ID is reduced
    to a short, non-sensitive tail. The title is stripped of ARNs/account IDs but
    intentionally preserves the CVE (also surfaced in its own field).
    """

    finding_arn: Optional[str] = Field(default=None, description="Inspector2 finding ARN, account ID masked")
    title: str
    severity: str = Field(..., description="CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL | UNTRIAGED")
    type: str = Field(..., description="PACKAGE_VULNERABILITY | NETWORK_REACHABILITY | CODE_VULNERABILITY")
    status: str = Field(..., description="Finding status, e.g. ACTIVE")
    resource_type: Optional[str] = Field(default=None, description="e.g. AWS_EC2_INSTANCE, AWS_ECR_CONTAINER_IMAGE, AWS_LAMBDA_FUNCTION")
    resource_id: Optional[str] = Field(default=None, description="Short/masked affected-resource identifier")
    cve: Optional[str] = Field(default=None, description="CVE id (packageVulnerabilityDetails.vulnerabilityId), when present")
    fix_available: Optional[str] = Field(default=None, description="YES | NO | PARTIAL")
    first_observed: Optional[str] = Field(default=None, description="firstObservedAt, ISO 8601")


class VulnerabilitiesResponse(BaseModel):
    """Detailed Inspector2 vulnerability findings — real CVEs on EC2/ECR/Lambda."""

    findings: List[VulnerabilityFinding] = Field(default_factory=list)
    total: int = 0
    by_severity: List[SeverityCount] = Field(default_factory=list)
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    by_type: Dict[str, int] = Field(default_factory=dict, description="Finding count keyed by finding TYPE")
    covered_resources: int = Field(0, description="Resources under Inspector2 scan coverage")
    live: bool = False
    source: str = "inspector2"
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )
