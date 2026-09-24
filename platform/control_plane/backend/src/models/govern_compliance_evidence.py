"""Govern Compliance Evidence Chain — mapping governance controls to compliance frameworks.

Provides a structured way to demonstrate how AVA Govern controls map to specific
compliance framework requirements (SOC 2, NIST AI RMF, ISO 42001, FFIEC, etc.).

Key concepts:
- ComplianceFramework: Enumeration of supported frameworks
- ControlMapping: How a framework control maps to AVA features
- EvidenceItem: Collected proof that a control is satisfied
- ComplianceReport: Full compliance coverage for a framework
- EvidenceExport: Auditor-ready export package
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ComplianceFramework(str, Enum):
    """Supported compliance frameworks."""

    SOC2 = "soc2"
    NIST_AI_RMF = "nist-ai-rmf"
    ISO_42001 = "iso-42001"
    FFIEC = "ffiec"
    PCI_DSS = "pci-dss"
    GDPR_AI = "gdpr-ai"


# Human-readable framework names
FRAMEWORK_DISPLAY_NAMES: Dict[ComplianceFramework, str] = {
    ComplianceFramework.SOC2: "SOC 2 Type II",
    ComplianceFramework.NIST_AI_RMF: "NIST AI Risk Management Framework",
    ComplianceFramework.ISO_42001: "ISO/IEC 42001 AI Management System",
    ComplianceFramework.FFIEC: "FFIEC Model Risk Management",
    ComplianceFramework.PCI_DSS: "PCI DSS v4.0",
    ComplianceFramework.GDPR_AI: "GDPR AI Governance",
}


class EvidenceStatus(str, Enum):
    """Status of evidence collection for a control."""

    COLLECTED = "collected"
    PENDING = "pending"
    GAP = "gap"
    EXPIRED = "expired"
    # Evidence exists but is an illustrative example, not a measurement. Distinct from
    # COLLECTED because "collected" is an assertion an auditor relies on: 11 of the 12
    # collectors in govern_compliance_evidence_service return hardcoded literals, and
    # reporting those as COLLECTED told the Compliance Evidence Chain that SOC 2 controls
    # were evidenced when nothing had been gathered.
    ILLUSTRATIVE = "illustrative"


class EvidenceType(str, Enum):
    """Types of evidence that can be collected."""

    KILLSWITCH_STATUS = "killswitch_status"
    AUDIT_ARTIFACT = "audit_artifact"
    VALIDATION_PANEL = "validation_panel"
    POLICY_CONFIG = "policy_config"
    INCIDENT_METRICS = "incident_metrics"
    TOOL_TIER_CONFIG = "tool_tier_config"
    PATH_JAIL_CONFIG = "path_jail_config"
    CLOUDTRAIL_EVENTS = "cloudtrail_events"
    APPROVAL_WORKFLOW = "approval_workflow"
    ACCESS_LOG = "access_log"
    DRIFT_DETECTION = "drift_detection"
    POSTURE_SCORE = "posture_score"


class AvaControl(str, Enum):
    """AVA Govern internal controls that can satisfy framework requirements."""

    KILLSWITCH = "killswitch"
    AUDIT_ARTIFACTS = "audit_artifacts"
    VALIDATION_PANELS = "validation_panels"
    TOOL_TIERS = "tool_tiers"
    PATH_JAILING = "path_jailing"
    HARNESS_POLICIES = "harness_policies"
    CANDIDATE_INCIDENTS = "candidate_incidents"
    CLOUDTRAIL_INTEGRATION = "cloudtrail_integration"
    RBAC = "rbac"
    APPROVAL_WORKFLOWS = "approval_workflows"
    ADVERSARIAL_REVIEW = "adversarial_review"
    DRIFT_DETECTION = "drift_detection"
    POSTURE_SCORING = "posture_scoring"
    HARNESS_DETECTION = "harness_detection"


# Display names for AVA controls
AVA_CONTROL_DISPLAY_NAMES: Dict[AvaControl, str] = {
    AvaControl.KILLSWITCH: "Emergency Kill-Switch",
    AvaControl.AUDIT_ARTIFACTS: "Audit Artifacts (VVAH)",
    AvaControl.VALIDATION_PANELS: "Adversarial Validation Panels",
    AvaControl.TOOL_TIERS: "Tool Access Tiers",
    AvaControl.PATH_JAILING: "Path Jailing Security",
    AvaControl.HARNESS_POLICIES: "Harness Policy Engine",
    AvaControl.CANDIDATE_INCIDENTS: "Candidate Incident Detection",
    AvaControl.CLOUDTRAIL_INTEGRATION: "CloudTrail Integration",
    AvaControl.RBAC: "Role-Based Access Control",
    AvaControl.APPROVAL_WORKFLOWS: "Human Approval Workflows",
    AvaControl.ADVERSARIAL_REVIEW: "Adversarial Security Review",
    AvaControl.DRIFT_DETECTION: "Configuration Drift Detection",
    AvaControl.POSTURE_SCORING: "Risk Posture Scoring",
    AvaControl.HARNESS_DETECTION: "Harness Discovery & Detection",
}


class ControlMapping(BaseModel):
    """Maps a compliance framework control to AVA Govern controls."""

    framework: ComplianceFramework = Field(..., description="Compliance framework")
    control_id: str = Field(
        ..., description="Framework control ID (e.g., 'CC6.1', 'GOVERN 1.1')"
    )
    control_name: str = Field(..., description="Control name")
    description: str = Field(..., description="Control description/requirement")
    ava_controls: List[AvaControl] = Field(
        default_factory=list,
        description="AVA controls that satisfy this requirement",
    )
    evidence_types: List[EvidenceType] = Field(
        default_factory=list,
        description="Types of evidence that prove compliance",
    )
    priority: str = Field(
        default="medium", description="Priority: critical, high, medium, low"
    )
    notes: Optional[str] = Field(None, description="Implementation notes")


class EvidenceItem(BaseModel):
    """A piece of collected evidence for a control mapping."""

    evidence_id: str = Field(
        default_factory=lambda: f"ev-{uuid.uuid4().hex[:12]}",
        description="Unique evidence ID",
    )
    control_mapping_id: str = Field(
        ..., description="ID of control mapping (framework#control_id)"
    )
    evidence_type: EvidenceType = Field(..., description="Type of evidence")
    source: str = Field(
        ..., description="AVA feature that produced the evidence"
    )
    data: Dict[str, Any] = Field(
        default_factory=dict, description="Actual evidence data"
    )
    collected_at: datetime = Field(default_factory=datetime.utcnow)
    validity_period_days: int = Field(
        default=90, description="How long this evidence is valid"
    )
    status: EvidenceStatus = Field(default=EvidenceStatus.COLLECTED)
    collected_by: str = Field(default="system", description="Who collected the evidence")
    provenance: Literal["measured", "illustrative"] = Field(
        default="illustrative",
        description=(
            "Whether `data` was read from a real source or is a worked example. Defaults to "
            "ILLUSTRATIVE deliberately: a new collector must opt in to claiming it measured "
            "something, rather than inheriting a claim it may not have earned. Only set "
            "'measured' when every field in `data` came from the named source."
        ),
    )

    @property
    def expires_at(self) -> datetime:
        """Calculate expiration timestamp."""
        return self.collected_at + timedelta(days=self.validity_period_days)

    @property
    def is_expired(self) -> bool:
        """Check if evidence has expired."""
        return datetime.utcnow() > self.expires_at


class ControlCoverage(BaseModel):
    """Coverage status for a single control."""

    control_id: str
    control_name: str
    description: str
    ava_controls: List[str]  # Display names
    evidence_status: EvidenceStatus
    evidence_count: int = 0
    last_evidence_at: Optional[datetime] = None
    gap_reason: Optional[str] = None


class ComplianceReport(BaseModel):
    """Full compliance report for a framework."""

    report_id: str = Field(
        default_factory=lambda: f"rpt-{uuid.uuid4().hex[:12]}",
        description="Report ID",
    )
    framework: ComplianceFramework
    framework_name: str
    coverage_percentage: float = Field(
        ..., ge=0, le=100, description="Percentage of controls with evidence"
    )
    total_controls: int
    covered_controls: int
    pending_controls: int
    gap_controls: int
    control_coverages: List[ControlCoverage] = Field(default_factory=list)
    evidence_items: List[EvidenceItem] = Field(default_factory=list)
    gaps: List[str] = Field(
        default_factory=list, description="Control IDs with gaps"
    )
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    generated_by: str = Field(default="system")
    validity_days: int = Field(
        default=90, description="Report validity period"
    )


class EvidenceExport(BaseModel):
    """Auditor-ready export package."""

    export_id: str = Field(
        default_factory=lambda: f"exp-{uuid.uuid4().hex[:12]}",
        description="Export ID",
    )
    framework: ComplianceFramework
    framework_name: str
    export_format: str = Field(default="json", description="Export format (json/csv)")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    generated_by: str = Field(default="system")

    # Metadata
    organization: str = Field(default="AVA Platform")
    reporting_period_start: datetime
    reporting_period_end: datetime

    # Content
    report: ComplianceReport
    evidence_summary: Dict[str, int] = Field(
        default_factory=dict, description="Count of evidence by type"
    )
    attestation_statement: str = Field(
        default="",
        description="Statement attesting to evidence completeness",
    )


class FrameworkCoverageResponse(BaseModel):
    """Response for framework coverage API."""

    framework: ComplianceFramework
    framework_name: str
    total_controls: int
    covered_controls: int
    pending_controls: int
    gap_controls: int
    coverage_percentage: float
    last_updated: Optional[datetime] = None


class FrameworkListResponse(BaseModel):
    """Response listing all supported frameworks."""

    frameworks: List[Dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class ControlMappingsResponse(BaseModel):
    """Response listing control mappings for a framework."""

    framework: ComplianceFramework
    framework_name: str
    mappings: List[ControlMapping] = Field(default_factory=list)
    total: int = 0


class EvidenceResponse(BaseModel):
    """Response for evidence collection."""

    control_mapping_id: str
    evidence_items: List[EvidenceItem] = Field(default_factory=list)
    status: EvidenceStatus
    total: int = 0
