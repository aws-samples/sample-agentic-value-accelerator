"""Govern Policy Drift — models for policy-reality drift detection.

Compares harness policies against actual CloudTrail activity to detect
deviations: tier violations, path violations, and unknown harnesses
operating outside the governed registry.

Follows the govern_trail convention: honest live/source/note flags.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class DriftType(str, Enum):
    """Type of policy drift detected."""

    TIER_VIOLATION = "tier_violation"      # Write operation on read-only tier
    PATH_VIOLATION = "path_violation"      # Blocked path accessed
    UNKNOWN_HARNESS = "unknown_harness"    # Activity from unregistered harness


class DriftSeverity(str, Enum):
    """Severity level of a drift finding."""

    CRITICAL = "critical"   # Immediate action required (e.g., credential path access)
    HIGH = "high"           # Significant policy violation (e.g., tier bypass)
    MEDIUM = "medium"       # Moderate violation (e.g., unknown harness, non-read-only tier)
    LOW = "low"             # Minor deviation (e.g., unknown harness, no sensitive ops)


class CloudTrailEvidence(BaseModel):
    """Evidence from CloudTrail event supporting a drift finding."""

    event_id: str = Field(..., description="CloudTrail event ID")
    event_name: str = Field(..., description="API action, e.g., InvokeModel")
    event_source: str = Field(..., description="e.g., bedrock.amazonaws.com")
    event_time: Optional[str] = Field(None, description="ISO8601 timestamp")
    username: Optional[str] = Field(None, description="Invoking identity")
    user_agent: Optional[str] = Field(None, description="userAgent from CloudTrail")
    request_params: Optional[Dict] = Field(None, description="Request parameters subset")
    error_code: Optional[str] = Field(None, description="Error code if call failed")


class PolicyDriftFinding(BaseModel):
    """A single policy-reality drift finding."""

    finding_id: str = Field(..., description="Unique finding identifier")
    drift_type: DriftType = Field(..., description="Type of drift detected")
    severity: DriftSeverity = Field(..., description="Severity level")
    policy_id: str = Field(..., description="Policy ID that was violated")
    harness_type: str = Field(..., description="Harness type involved")

    # What the policy says vs what actually happened
    expected: str = Field(..., description="What policy permits/requires")
    actual: str = Field(..., description="What CloudTrail shows happened")

    # Supporting evidence
    evidence: CloudTrailEvidence = Field(..., description="CloudTrail event details")

    # Metadata
    detected_at: str = Field(..., description="ISO8601 detection timestamp")
    resolved: bool = Field(False, description="Whether finding has been addressed")
    resolved_at: Optional[str] = Field(None, description="ISO8601 resolution timestamp")
    resolved_by: Optional[str] = Field(None, description="User who resolved")
    resolution_note: Optional[str] = Field(None, description="Resolution details")


class DriftCountBySeverity(BaseModel):
    """Count of findings by severity."""

    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class DriftCountByType(BaseModel):
    """Count of findings by drift type."""

    tier_violation: int = 0
    path_violation: int = 0
    unknown_harness: int = 0


class WorstOffender(BaseModel):
    """Identity or harness with the most drift findings."""

    identity: str = Field(..., description="IAM principal or harness identifier")
    identity_type: str = Field("identity", description="identity or harness")
    finding_count: int = Field(0, description="Total findings")
    critical_count: int = Field(0, description="Critical findings")
    high_count: int = Field(0, description="High findings")
    most_common_drift: Optional[DriftType] = Field(None, description="Most frequent drift type")
    last_violation: Optional[str] = Field(None, description="Most recent violation time")


class DriftSummary(BaseModel):
    """Aggregated summary of policy drift analysis."""

    total_findings: int = Field(0, description="Total findings in window")
    unresolved_findings: int = Field(0, description="Findings not yet addressed")
    by_severity: DriftCountBySeverity = Field(default_factory=DriftCountBySeverity)
    by_type: DriftCountByType = Field(default_factory=DriftCountByType)
    compliance_gap_percentage: float = Field(
        0.0,
        ge=0.0,
        le=100.0,
        description="Percentage of AI activity that violates policy"
    )
    worst_offenders: List[WorstOffender] = Field(
        default_factory=list,
        description="Top violating identities/harnesses"
    )
    policies_with_drift: List[str] = Field(
        default_factory=list,
        description="Policy IDs with detected drift"
    )


class DriftAnalysisResponse(BaseModel):
    """Response from policy drift analysis."""

    findings: List[PolicyDriftFinding] = Field(default_factory=list)
    summary: DriftSummary = Field(default_factory=DriftSummary)
    analysis_window_hours: int = Field(24, description="Hours of activity analyzed")
    total_events_analyzed: int = Field(0, description="CloudTrail events checked")
    last_analysis: Optional[str] = Field(
        None, description="ISO8601 time the (possibly cached) analysis was actually run"
    )

    # Honest live/source/note flags
    live: bool = Field(False, description="True if from real CloudTrail + policy data")
    source: str = Field("unavailable-fallback", description="Data source description")
    note: Optional[str] = Field(None, description="Additional context or warnings")


class DriftFindingsListResponse(BaseModel):
    """Response containing list of drift findings."""

    findings: List[PolicyDriftFinding] = Field(default_factory=list)
    total: int = 0
    unresolved: int = 0
    live: bool = False
    source: str = "unavailable-fallback"
    note: Optional[str] = None


class DriftSummaryResponse(BaseModel):
    """Response containing drift summary statistics."""

    summary: DriftSummary = Field(default_factory=DriftSummary)
    analysis_window_hours: int = 24
    live: bool = False
    source: str = "unavailable-fallback"
    note: Optional[str] = None


class WorstOffendersResponse(BaseModel):
    """Response containing worst offenders list."""

    offenders: List[WorstOffender] = Field(default_factory=list)
    analysis_window_hours: int = 24
    live: bool = False
    source: str = "unavailable-fallback"
    note: Optional[str] = None


class ResolveFindingRequest(BaseModel):
    """Request to resolve a drift finding."""

    resolution_note: Optional[str] = Field(None, description="Details about the resolution")
