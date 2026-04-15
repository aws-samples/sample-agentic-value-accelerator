"""
KYC Use Case Models.

Pydantic models for KYC risk assessment requests and responses.
All models are specific to the KYC use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of risk assessment to perform."""
    FULL = "full"
    CREDIT_ONLY = "credit_only"
    COMPLIANCE_ONLY = "compliance_only"


class RiskLevel(str, Enum):
    """Risk level classification."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ComplianceStatusEnum(str, Enum):
    """Compliance status classification."""
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"
    REVIEW_REQUIRED = "review_required"


class AssessmentRequest(BaseModel):
    """Request model for KYC risk assessment."""
    customer_id: str = Field(..., description="Unique customer identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of assessment to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class RiskScore(BaseModel):
    """Credit risk score details."""
    score: int = Field(..., ge=0, le=100, description="Risk score from 0-100")
    level: RiskLevel = Field(..., description="Risk level classification")
    factors: list[str] = Field(default_factory=list, description="Contributing factors")
    recommendations: list[str] = Field(default_factory=list, description="Risk mitigation recommendations")


class ComplianceStatus(BaseModel):
    """Compliance check results."""
    status: ComplianceStatusEnum = Field(..., description="Overall compliance status")
    checks_passed: list[str] = Field(default_factory=list, description="Compliance checks that passed")
    checks_failed: list[str] = Field(default_factory=list, description="Compliance checks that failed")
    regulatory_notes: list[str] = Field(default_factory=list, description="Regulatory notes and observations")


class AssessmentResponse(BaseModel):
    """Response model for KYC risk assessment."""
    customer_id: str = Field(..., description="Customer identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Assessment timestamp")
    credit_risk: RiskScore | None = Field(default=None, description="Credit risk assessment results")
    compliance: ComplianceStatus | None = Field(default=None, description="Compliance check results")
    summary: str = Field(..., description="Executive summary of the assessment")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
