"""
Trading Insights Use Case Models.

Pydantic models for trading insights requests and responses.
All models are specific to the trading insights use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of trading insights assessment."""
    FULL = "full"
    SIGNAL_GENERATION = "signal_generation"
    CROSS_ASSET_ANALYSIS = "cross_asset_analysis"
    SCENARIO_MODELING = "scenario_modeling"


class SignalStrength(str, Enum):
    """Trading signal strength classification."""
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    NEUTRAL = "neutral"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


class ScenarioLikelihood(str, Enum):
    """Likelihood classification for modeled scenarios."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    TAIL_RISK = "tail_risk"


class InsightsRequest(BaseModel):
    """Request model for trading insights assessment."""
    entity_id: str = Field(..., description="Unique portfolio/position identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of insights assessment"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class InsightsDetail(BaseModel):
    """Details of the trading insights assessment."""
    signal_strength: SignalStrength = Field(
        default=SignalStrength.NEUTRAL, description="Overall signal strength"
    )
    scenario_likelihood: ScenarioLikelihood = Field(
        default=ScenarioLikelihood.MEDIUM, description="Primary scenario likelihood"
    )
    signals_identified: list[str] = Field(
        default_factory=list, description="Trading signals identified"
    )
    cross_asset_opportunities: list[str] = Field(
        default_factory=list, description="Cross-asset opportunities detected"
    )
    scenario_outcomes: list[str] = Field(
        default_factory=list, description="Modeled scenario outcomes"
    )
    confidence_score: float = Field(
        default=0.0, description="Overall confidence score (0-1)"
    )


class InsightsResponse(BaseModel):
    """Response model for trading insights assessment."""
    entity_id: str = Field(..., description="Portfolio/position identifier")
    insights_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Assessment timestamp"
    )
    insights_detail: InsightsDetail | None = Field(
        default=None, description="Trading insights details"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Trading recommendations"
    )
    summary: str = Field(..., description="Executive summary of the assessment")
    raw_analysis: dict = Field(
        default_factory=dict, description="Raw analysis from agents"
    )
