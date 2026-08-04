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
    control_id: str = Field(..., description="Control ID (e.g., AIR-OP-004, GOVERN 1.1)")
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
    coverage_pct: float = Field(..., description="Percentage of applicable controls passing")
    last_updated: Optional[datetime] = None


class CompliancePosture(BaseModel):
    """Overall compliance posture across all frameworks."""
    frameworks: List[FrameworkSummary]
    overall_coverage_pct: float
    total_controls: int
    total_pass: int
    total_gaps: int
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
