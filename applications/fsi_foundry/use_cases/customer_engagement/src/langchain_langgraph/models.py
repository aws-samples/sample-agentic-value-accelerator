"""
Customer Engagement Use Case Models.

Pydantic models for customer engagement assessment requests and responses.
All models are specific to the Customer Engagement use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of customer engagement assessment to perform."""
    FULL = "full"
    CHURN_PREDICTION_ONLY = "churn_prediction_only"
    OUTREACH_ONLY = "outreach_only"
    POLICY_OPTIMIZATION_ONLY = "policy_optimization_only"


class ChurnRisk(str, Enum):
    """Customer churn risk level."""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class OutreachChannel(str, Enum):
    """Communication channel for customer outreach."""
    EMAIL = "email"
    PHONE = "phone"
    SMS = "sms"
    IN_APP = "in_app"
    MAIL = "mail"


class PolicyAction(str, Enum):
    """Recommended policy action for retention."""
    RENEW = "renew"
    UPGRADE = "upgrade"
    BUNDLE = "bundle"
    DISCOUNT = "discount"
    ADJUST_COVERAGE = "adjust_coverage"


class EngagementRequest(BaseModel):
    """Request model for customer engagement assessment."""
    customer_id: str = Field(..., description="Unique customer identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of engagement assessment to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class ChurnPrediction(BaseModel):
    """Churn prediction details."""
    risk_level: str | None = Field(default=None, description="Predicted churn risk level")
    churn_probability: float = Field(default=0.0, description="Churn probability score 0-1")
    risk_factors: list[str] = Field(default_factory=list, description="Key risk factors identified")
    behavioral_signals: list[str] = Field(default_factory=list, description="Behavioral signals observed")
    retention_window_days: int = Field(default=90, description="Estimated days before likely churn")
    notes: list[str] = Field(default_factory=list, description="Additional prediction notes")


class OutreachPlan(BaseModel):
    """Personalized outreach plan details."""
    recommended_channel: str | None = Field(default=None, description="Primary outreach channel")
    secondary_channels: list[OutreachChannel] = Field(default_factory=list)
    messaging_theme: str = Field(default="", description="Core messaging theme")
    talking_points: list[str] = Field(default_factory=list, description="Key talking points")
    optimal_timing: str = Field(default="", description="Recommended outreach timing")
    personalization_elements: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PolicyRecommendations(BaseModel):
    """Policy optimization recommendations."""
    recommended_actions: list[PolicyAction] = Field(default_factory=list)
    coverage_adjustments: list[str] = Field(default_factory=list)
    bundling_opportunities: list[str] = Field(default_factory=list)
    estimated_savings: float = Field(default=0.0, description="Estimated annual savings for customer")
    value_improvements: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class EngagementResponse(BaseModel):
    """Response model for customer engagement assessment."""
    customer_id: str = Field(..., description="Customer identifier")
    engagement_id: str = Field(..., description="Unique engagement assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    churn_prediction: ChurnPrediction | None = Field(default=None)
    outreach_plan: OutreachPlan | None = Field(default=None)
    policy_recommendations: PolicyRecommendations | None = Field(default=None)
    summary: str = Field(..., description="Executive summary of the engagement assessment")
    raw_analysis: dict = Field(default_factory=dict)
