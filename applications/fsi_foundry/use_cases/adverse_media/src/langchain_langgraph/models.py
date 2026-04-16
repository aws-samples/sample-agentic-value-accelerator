"""
Adverse Media Use Case Models .

Pydantic models for adverse media screening requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ScreeningType(str, Enum):
    FULL = "full"
    MEDIA_SCREENING = "media_screening"
    SENTIMENT_ANALYSIS = "sentiment_analysis"
    RISK_EXTRACTION = "risk_extraction"


class SentimentLevel(str, Enum):
    VERY_NEGATIVE = "very_negative"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    POSITIVE = "positive"
    VERY_POSITIVE = "very_positive"


class RiskSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ScreeningRequest(BaseModel):
    entity_id: str = Field(..., description="Unique entity identifier to screen")
    screening_type: ScreeningType = Field(
        default=ScreeningType.FULL,
        description="Type of screening to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the screening"
    )


class RiskSignal(BaseModel):
    signal_type: str = Field(..., description="Type of risk signal")
    severity: RiskSeverity = Field(default=RiskSeverity.MEDIUM, description="Signal severity")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Confidence score")
    description: str = Field(..., description="Description of the risk signal")
    source_references: list[str] = Field(default_factory=list, description="References to source articles")
    entity_linkage: str | None = Field(default=None, description="How the signal links to the entity")


class MediaFindings(BaseModel):
    articles_screened: int = Field(default=0, description="Number of articles screened")
    adverse_mentions: int = Field(default=0, description="Number of adverse mentions found")
    sentiment: SentimentLevel = Field(default=SentimentLevel.NEUTRAL, description="Overall sentiment")
    categories: list[str] = Field(default_factory=list, description="Categories of adverse media")
    key_findings: list[str] = Field(default_factory=list, description="Key findings from media screening")
    sources: list[str] = Field(default_factory=list, description="Media sources reviewed")


class ScreeningResponse(BaseModel):
    entity_id: str = Field(..., description="Entity identifier")
    screening_id: str = Field(..., description="Unique screening identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Screening timestamp")
    media_findings: MediaFindings | None = Field(default=None, description="Media screening findings")
    risk_signals: list[RiskSignal] = Field(default_factory=list, description="Extracted risk signals")
    summary: str = Field(..., description="Executive summary of the screening")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
