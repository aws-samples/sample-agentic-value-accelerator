"""Trading Assistant Models ."""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    FULL = "full"
    MARKET_ANALYSIS = "market_analysis"
    TRADE_IDEA = "trade_idea"
    EXECUTION_PLAN = "execution_plan"


class MarketCondition(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"
    VOLATILE = "volatile"


class ExecutionUrgency(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    IMMEDIATE = "immediate"


class TradingRequest(BaseModel):
    entity_id: str = Field(..., description="Unique trading request identifier")
    analysis_type: AnalysisType = Field(default=AnalysisType.FULL, description="Type of trading analysis")
    additional_context: str | None = Field(default=None, description="Additional context")


class MarketAnalysisDetail(BaseModel):
    condition: str | None = Field(default=None, description="Overall market condition")
    urgency: str | None = Field(default=None, description="Execution urgency")
    confidence_score: float = Field(default=0.5, description="Analysis confidence 0-1")
    key_levels: list[str] = Field(default_factory=list, description="Key price levels")
    trade_ideas: list[str] = Field(default_factory=list, description="Generated trade ideas")
    execution_notes: list[str] = Field(default_factory=list, description="Execution planning notes")


class TradingResponse(BaseModel):
    entity_id: str = Field(..., description="Trading request identifier")
    analysis_id: str = Field(..., description="Unique analysis identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Analysis timestamp")
    market_analysis: MarketAnalysisDetail | None = Field(default=None, description="Market analysis details")
    recommendations: list[str] = Field(default_factory=list, description="Trading recommendations")
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
