"""Earnings Summarization Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class SummarizationType(str, Enum):
    FULL = "full"
    TRANSCRIPT_ONLY = "transcript_only"
    METRICS_ONLY = "metrics_only"
    SENTIMENT_ONLY = "sentiment_only"

class SentimentRating(str, Enum):
    VERY_POSITIVE = "very_positive"
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"
    VERY_NEGATIVE = "very_negative"

class MetricCategory(str, Enum):
    REVENUE = "revenue"
    EARNINGS = "earnings"
    GUIDANCE = "guidance"
    OPERATIONAL = "operational"

class SummarizationRequest(BaseModel):
    entity_id: str = Field(..., description="Earnings call entity identifier")
    summarization_type: SummarizationType = Field(default=SummarizationType.FULL)
    additional_context: str | None = Field(default=None)

class EarningsOverview(BaseModel):
    sentiment: SentimentRating = Field(default=SentimentRating.NEUTRAL)
    key_metrics: dict = Field(default_factory=dict)
    guidance_changes: list[str] = Field(default_factory=list)
    notable_quotes: list[str] = Field(default_factory=list)
    risks_identified: list[str] = Field(default_factory=list)

class SummarizationResponse(BaseModel):
    entity_id: str = Field(..., description="Entity identifier")
    summarization_id: str = Field(..., description="Unique summarization identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    earnings_overview: EarningsOverview | None = Field(default=None)
    recommendations: list[str] = Field(default_factory=list)
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict)

