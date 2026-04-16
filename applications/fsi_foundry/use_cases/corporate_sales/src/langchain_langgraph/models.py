"""
Corporate Sales Use Case Models.

Pydantic models for corporate sales analysis requests and responses.
All models are specific to the corporate sales use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    """Type of sales analysis to perform."""
    FULL = "full"
    LEAD_SCORING = "lead_scoring"
    OPPORTUNITY_ANALYSIS = "opportunity_analysis"
    PITCH_PREPARATION = "pitch_preparation"


class LeadTier(str, Enum):
    """Lead tier classification."""
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"
    UNQUALIFIED = "unqualified"


class OpportunityStage(str, Enum):
    """Sales opportunity stage."""
    PROSPECTING = "prospecting"
    QUALIFICATION = "qualification"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class SalesRequest(BaseModel):
    """Request model for corporate sales analysis."""
    customer_id: str = Field(..., description="Unique corporate prospect identifier")
    analysis_type: AnalysisType = Field(
        default=AnalysisType.FULL,
        description="Type of sales analysis to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the analysis"
    )


class LeadScore(BaseModel):
    """Lead scoring details."""
    score: int = Field(..., ge=0, le=100, description="Lead score from 0-100")
    tier: LeadTier = Field(..., description="Lead tier classification")
    factors: list[str] = Field(default_factory=list, description="Contributing scoring factors")
    recommendations: list[str] = Field(default_factory=list, description="Engagement recommendations")


class OpportunityDetail(BaseModel):
    """Opportunity analysis details."""
    stage: OpportunityStage = Field(..., description="Current opportunity stage")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Deal confidence score")
    estimated_value: float = Field(default=0.0, description="Estimated deal value")
    key_drivers: list[str] = Field(default_factory=list, description="Key opportunity drivers")
    risks: list[str] = Field(default_factory=list, description="Identified risks")
    next_steps: list[str] = Field(default_factory=list, description="Recommended next steps")


class SalesResponse(BaseModel):
    """Response model for corporate sales analysis."""
    customer_id: str = Field(..., description="Corporate prospect identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Assessment timestamp")
    lead_score: LeadScore | None = Field(default=None, description="Lead scoring results")
    opportunity: OpportunityDetail | None = Field(default=None, description="Opportunity analysis results")
    recommendations: list[str] = Field(default_factory=list, description="Pitch and engagement recommendations")
    summary: str = Field(..., description="Executive summary of the sales assessment")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
