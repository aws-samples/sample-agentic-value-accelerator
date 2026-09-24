"""Pydantic models for Compliance Attestation persistence."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ControlStatus(str, Enum):
    PASS = "pass"
    IN_PROGRESS = "in-progress"
    FAIL = "fail"
    NOT_STARTED = "not-started"


class EvidenceType(str, Enum):
    DOCUMENT = "document"
    LINK = "link"
    SCREENSHOT = "screenshot"
    API_CHECK = "api-check"
    AUTO_DETECTED = "auto-detected"


class Evidence(BaseModel):
    """A piece of evidence supporting a control attestation."""
    id: str = Field(..., description="Unique evidence ID")
    type: EvidenceType = Field(..., description="Type of evidence")
    name: str = Field(..., description="Display name")
    description: Optional[str] = Field(None, description="Optional description")
    url: Optional[str] = Field(None, description="Link to evidence (S3, URL, etc.)")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: str = Field(..., description="User who uploaded")


class ControlAttestation(BaseModel):
    """Attestation state for a single control within a framework."""
    control_id: str = Field(
        ...,
        description=(
            "Control ID exactly as spelled in the frontend checklist "
            "(COMPLIANCE_CENTER_FRAMEWORKS in mockData.ts) - e.g. 'AIR-OP-004', "
            "'NIST-GV-1.6', 'LLM01-1', 'GOV-1'. NOT the framework's own section label: "
            "'GOVERN 1.6' is the `section` of control 'NIST-GV-1.6', and this description "
            "used to give that spelling as the example. The UI joins attestations on this "
            "value, so a divergent spelling is silently dropped and reads as 'not "
            "assessed' - it cost 10 of 24 measured attestations."
        ),
    )
    framework_id: str = Field(..., description="Framework ID (e.g., finos-air, nist-ai-rmf)")
    status: ControlStatus = Field(default=ControlStatus.NOT_STARTED)
    owner: Optional[str] = Field(None, description="Control owner")
    notes: Optional[str] = Field(None, description="Attestation notes")
    evidence: List[Evidence] = Field(default_factory=list)
    due_date: Optional[datetime] = Field(None, description="Remediation due date if not pass")
    last_reviewed: Optional[datetime] = Field(None)
    reviewed_by: Optional[str] = Field(None)
    auto_detected: bool = Field(default=False, description="True if status was auto-detected from AWS")
    auto_detection_source: Optional[str] = Field(None, description="Source of auto-detection (e.g., 'guardrails', 'config-rules')")
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = Field(default="system")


class ControlAttestationUpdate(BaseModel):
    """Payload for updating a control attestation."""
    status: Optional[ControlStatus] = None
    owner: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    # Provenance, settable so it PERSISTS. _apply_auto_detection used to write the
    # attestation and then set these two flags on the in-memory dict afterwards, which only
    # worked while the table was unreachable and every attestation happened to live in that
    # dict. With DynamoDB healthy the key is absent, so the flags were dropped: posture
    # reported auto_detected_count=0 for 24 auto-detected controls, and the "N auto-detected"
    # disclosure vanished from the UI exactly when the data became real. Routing them through
    # the update means the single write in upsert_attestation carries them.
    auto_detected: Optional[bool] = None
    auto_detection_source: Optional[str] = None


class EvidenceCreate(BaseModel):
    """Payload for adding evidence to a control."""
    type: EvidenceType
    name: str
    description: Optional[str] = None
    url: Optional[str] = None


class FrameworkSummary(BaseModel):
    """Summary stats for a framework."""
    framework_id: str
    framework_name: str
    total_controls: int
    pass_count: int
    in_progress_count: int
    fail_count: int
    not_started_count: int
    coverage_pct: float = Field(
        ...,
        description=(
            "Pass rate over ASSESSED controls only: pass_count / assessed_count * 100. "
            "This is NOT coverage of the full control set - a framework with 2 of 16 "
            "controls assessed and both passing reports 100 here. For true coverage of "
            "the control set see assessed_pct."
        ),
    )
    assessed_count: int = Field(
        default=0,
        description=(
            "Controls carrying a non not-started attestation. The denominator of "
            "coverage_pct (= total_controls - not_started_count, clamped to "
            "[0, total_controls])."
        ),
    )
    assessed_pct: float = Field(
        default=0.0,
        description="True coverage: assessed_count / total_controls * 100.",
    )
    last_updated: Optional[datetime] = None


class CompliancePosture(BaseModel):
    """Overall compliance posture across all distinct frameworks."""
    frameworks: List[FrameworkSummary]
    overall_coverage_pct: float = Field(
        ...,
        description=(
            "Pooled pass rate over ASSESSED controls only: total_pass / total_assessed "
            "* 100. NOT coverage of the estate - see overall_assessed_pct. Never render "
            "this without its denominator."
        ),
    )
    total_controls: int
    total_pass: int
    total_gaps: int = Field(
        default=0,
        description=(
            "Controls explicitly attested FAIL. Not-started and in-progress controls are "
            "NOT gaps, so 0 here does not mean the estate is clean."
        ),
    )
    total_assessed: int = Field(
        default=0,
        description="Controls carrying a non not-started attestation; denominator of overall_coverage_pct.",
    )
    total_not_assessed: int = Field(
        default=0,
        description="total_controls - total_assessed. Controls with no attestation at all.",
    )
    overall_assessed_pct: float = Field(
        default=0.0,
        description="True coverage: total_assessed / total_controls * 100.",
    )
    auto_detected_count: int = Field(default=0, description="Controls with auto-detected status")
    last_sync: Optional[datetime] = None


class AutoDetectionResult(BaseModel):
    """Result of auto-detection for a control."""
    control_id: str
    framework_id: str
    detected_status: ControlStatus
    source: str
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    details: Optional[str] = None
