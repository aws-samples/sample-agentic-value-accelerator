"""
Investment Management Use Case Models.

Pydantic models for investment management assessment requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of investment management assessment."""
    FULL = "full"
    ALLOCATION_OPTIMIZATION = "allocation_optimization"
    REBALANCING = "rebalancing"
    PERFORMANCE_ATTRIBUTION = "performance_attribution"


class RiskProfile(str, Enum):
    """Portfolio risk profile classification."""
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"
    ULTRA_AGGRESSIVE = "ultra_aggressive"


class RebalanceUrgency(str, Enum):
    """Urgency level for portfolio rebalancing."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ManagementRequest(BaseModel):
    """Request model for investment management assessment."""
    entity_id: str = Field(..., description="Unique portfolio/entity identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of investment management assessment"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class PortfolioAnalysisDetail(BaseModel):
    """Details of the portfolio analysis."""
    risk_profile: str | None = Field(default=None, description="Portfolio risk profile")
    rebalance_urgency: RebalanceUrgency = Field(
        default=RebalanceUrgency.LOW, description="Rebalancing urgency"
    )
    drift_pct: float = Field(default=0.0, description="Portfolio drift percentage")
    allocation_score: float = Field(default=0.5, description="Allocation optimality 0-1")
    attribution_factors: list[str] = Field(
        default_factory=list, description="Performance attribution factors"
    )
    trade_recommendations: list[str] = Field(
        default_factory=list, description="Recommended trades for rebalancing"
    )


class ManagementResponse(BaseModel):
    """Response model for investment management assessment."""
    entity_id: str = Field(..., description="Portfolio/entity identifier")
    management_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Assessment timestamp"
    )
    portfolio_analysis: PortfolioAnalysisDetail | None = Field(
        default=None, description="Portfolio analysis details"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Investment recommendations"
    )
    summary: str = Field(..., description="Executive summary of the assessment")
    raw_analysis: dict = Field(
        default_factory=dict, description="Raw analysis from agents"
    )
