"""
Underwriting Submission Triage Models (Strands Implementation).

Pydantic models for commercial insurance submission triage requests and
responses. A submission is the package a broker sends to an insurer on behalf
of a prospective client; triage decides whether it is worth quoting.

Response-side enum-like fields are intentionally typed as `str | None` rather
than as the enums declared below. The values come from an LLM synthesis step,
and a slightly off-format value (e.g. "Quote" or "IN_APPETITE") would fail
strict validation and cause the orchestrator to discard the entire structured
result in favour of raw text. The enums remain the source of truth for the
prompt schema, the UI, and callers. This mirrors `kyc_banking`, where
`RiskScore.level` and `ComplianceStatus.status` are typed the same way.

Request-side fields ARE strict: those values are supplied by the caller, not
generated, so early rejection of a bad value is the desired behaviour.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class TriageType(str, Enum):
    """Scope of triage to perform on the submission."""
    FULL = "full"
    APPETITE_ONLY = "appetite_only"
    EXPOSURE_ONLY = "exposure_only"
    PRICING_ONLY = "pricing_only"


class UnderwritingDecision(str, Enum):
    """Final triage outcome for the submission."""
    QUOTE = "quote"
    REFER = "refer"
    DECLINE = "decline"


class AppetiteStatus(str, Enum):
    """Whether the submission falls within the insurer's written risk appetite."""
    IN_APPETITE = "in_appetite"
    OUT_OF_APPETITE = "out_of_appetite"
    REFERRAL_REQUIRED = "referral_required"


class ExposureSeverity(str, Enum):
    """Severity classification for aggregate exposure."""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class SubmissionRequest(BaseModel):
    """Request model for underwriting submission triage."""
    submission_id: str = Field(..., description="Unique submission identifier")
    triage_type: TriageType = Field(
        default=TriageType.FULL,
        description="Scope of triage to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the triage, e.g. broker commentary"
    )


class AppetiteReview(BaseModel):
    """Risk appetite screening results."""
    status: str | None = Field(
        default=None,
        description="Appetite status: in_appetite, out_of_appetite, or referral_required"
    )
    checks_passed: list[str] = Field(
        default_factory=list,
        description="Appetite rules the submission satisfies"
    )
    checks_failed: list[str] = Field(
        default_factory=list,
        description="Appetite rules the submission breaches"
    )
    prohibited_classes_triggered: list[str] = Field(
        default_factory=list,
        description="Prohibited occupancy or business classes identified"
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Screening observations and referral rationale"
    )


class ExposureAssessment(BaseModel):
    """Aggregate exposure and loss history assessment."""
    total_insured_value: float = Field(
        default=0.0,
        description="Sum of building and contents values across all locations"
    )
    severity: str | None = Field(
        default=None,
        description="Exposure severity: low, moderate, high, or critical"
    )
    concentration_flags: list[str] = Field(
        default_factory=list,
        description="Geographic or peril concentrations identified"
    )
    loss_history_summary: str | None = Field(
        default=None,
        description="Narrative assessment of the applicant's prior claims"
    )
    findings: list[str] = Field(
        default_factory=list,
        description="Exposure findings supporting the severity rating"
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Additional exposure observations"
    )


class PricingIndication(BaseModel):
    """Technical pricing indication, before commercial negotiation."""
    indicated_premium: float = Field(
        default=0.0,
        description="Technically indicated annual premium"
    )
    rate_per_thousand: float = Field(
        default=0.0,
        description="Premium per $1,000 of total insured value"
    )
    loss_ratio_estimate: float = Field(
        default=0.0,
        description="Expected claims as a proportion of premium, 0.0-1.0"
    )
    confidence_score: float = Field(
        default=0.0,
        description="Confidence in the indication, 0.0-1.0"
    )
    justification: list[str] = Field(
        default_factory=list,
        description="Rating factors supporting the indicated premium"
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Pricing caveats and assumptions"
    )


class SubmissionResponse(BaseModel):
    """Response model for underwriting submission triage."""
    submission_id: str = Field(..., description="Submission identifier")
    assessment_id: str = Field(..., description="Unique triage assessment identifier")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Triage timestamp"
    )
    decision: str | None = Field(
        default=None,
        description="Triage decision: quote, refer, or decline"
    )
    appetite_review: AppetiteReview | None = Field(
        default=None,
        description="Risk appetite screening results"
    )
    exposure_assessment: ExposureAssessment | None = Field(
        default=None,
        description="Aggregate exposure and loss history assessment"
    )
    pricing_indication: PricingIndication | None = Field(
        default=None,
        description="Technical pricing indication"
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Information required from the broker before a decision can be finalised"
    )
    summary: str = Field(..., description="Executive summary of the triage outcome")
    raw_analysis: dict = Field(
        default_factory=dict,
        description="Raw analysis from each specialist agent"
    )


__all__ = [
    "TriageType",
    "UnderwritingDecision",
    "AppetiteStatus",
    "ExposureSeverity",
    "SubmissionRequest",
    "AppetiteReview",
    "ExposureAssessment",
    "PricingIndication",
    "SubmissionResponse",
]
