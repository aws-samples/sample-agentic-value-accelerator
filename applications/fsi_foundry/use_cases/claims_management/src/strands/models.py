"""
Claims Management Use Case Models (Strands Implementation).

Pydantic models for claims management requests and responses.
These are identical to the LangGraph models - duplicated here to avoid
circular import issues when langchain dependencies aren't installed.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of claims assessment to perform."""
    FULL = "full"
    CLAIMS_INTAKE_ONLY = "claims_intake_only"
    DAMAGE_ASSESSMENT_ONLY = "damage_assessment_only"
    SETTLEMENT_ONLY = "settlement_only"


class ClaimStatus(str, Enum):
    """Status of an insurance claim."""
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ASSESSED = "assessed"
    SETTLED = "settled"
    DENIED = "denied"
    CLOSED = "closed"


class ClaimType(str, Enum):
    """Type of insurance claim."""
    AUTO = "auto"
    PROPERTY = "property"
    LIABILITY = "liability"
    HEALTH = "health"
    LIFE = "life"


class Severity(str, Enum):
    """Severity level of damage."""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CATASTROPHIC = "catastrophic"


class ClaimRequest(BaseModel):
    """Request model for claims management assessment."""
    claim_id: str = Field(..., description="Unique claim identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of assessment to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class IntakeSummary(BaseModel):
    """Summary of the claims intake process."""
    claim_type: ClaimType = Field(..., description="Classified claim type")
    status: ClaimStatus = Field(default=ClaimStatus.SUBMITTED)
    documentation_complete: str = Field(default="false", description="Whether documentation is complete: true or false")
    missing_documents: list[str] = Field(default_factory=list)
    key_details: dict = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class DamageAssessment(BaseModel):
    """Details of the damage assessment."""
    severity: Severity = Field(..., description="Damage severity level")
    estimated_repair_cost: float = Field(default=0.0)
    estimated_replacement_cost: float = Field(default=0.0)
    evidence_quality: str = Field(default="adequate")
    findings: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SettlementRecommendation(BaseModel):
    """Settlement recommendation details."""
    recommended_amount: float = Field(..., description="Recommended settlement amount")
    confidence_score: float = Field(default=0.0)
    policy_coverage_applicable: bool = Field(default=True)
    justification: list[str] = Field(default_factory=list)
    comparable_settlements: list[dict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ClaimResponse(BaseModel):
    """Response model for claims management assessment."""
    claim_id: str = Field(..., description="Claim identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    intake_summary: IntakeSummary | None = Field(default=None)
    damage_assessment: DamageAssessment | None = Field(default=None)
    settlement_recommendation: SettlementRecommendation | None = Field(default=None)
    summary: str = Field(..., description="Executive summary of the claims assessment")
    raw_analysis: dict = Field(default_factory=dict)


__all__ = [
    "AssessmentType", "ClaimStatus", "ClaimType", "Severity",
    "ClaimRequest", "IntakeSummary", "DamageAssessment",
    "SettlementRecommendation", "ClaimResponse",
]
