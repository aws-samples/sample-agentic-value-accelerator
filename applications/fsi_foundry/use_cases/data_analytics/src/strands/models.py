"""
Data Analytics Use Case Models (Strands Implementation).

Pydantic models for data analytics assessment requests and responses.
These are identical to the LangGraph models - duplicated here to avoid
circular import issues when langchain dependencies aren't installed.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of data analytics assessment."""
    FULL = "full"
    DATA_EXPLORATION = "data_exploration"
    STATISTICAL_ANALYSIS = "statistical_analysis"
    INSIGHT_GENERATION = "insight_generation"


class DataQuality(str, Enum):
    """Data quality classification."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


class InsightConfidence(str, Enum):
    """Confidence level for generated insights."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    SPECULATIVE = "speculative"


class AnalyticsRequest(BaseModel):
    """Request model for data analytics assessment."""
    entity_id: str = Field(..., description="Unique dataset/entity identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of analytics assessment"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class AnalyticsDetail(BaseModel):
    """Details of the analytics assessment."""
    data_quality: str | None = Field(default=None, description="Data quality classification")
    insight_confidence: InsightConfidence = Field(
        default=InsightConfidence.MEDIUM, description="Insight confidence level"
    )
    patterns_identified: list[str] = Field(
        default_factory=list, description="Patterns identified in the data"
    )
    statistical_findings: list[str] = Field(
        default_factory=list, description="Key statistical findings"
    )
    visualization_suggestions: list[str] = Field(
        default_factory=list, description="Suggested visualizations"
    )
    data_coverage_pct: float = Field(
        default=0.0, description="Percentage of data coverage analyzed"
    )


class AnalyticsResponse(BaseModel):
    """Response model for data analytics assessment."""
    entity_id: str = Field(..., description="Dataset/entity identifier")
    analytics_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Assessment timestamp"
    )
    analytics_detail: AnalyticsDetail | None = Field(
        default=None, description="Analytics assessment details"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Analytical recommendations"
    )
    summary: str = Field(..., description="Executive summary of the assessment")
    raw_analysis: dict = Field(
        default_factory=dict, description="Raw analysis from agents"
    )


__all__ = [
    "AssessmentType",
    "DataQuality",
    "InsightConfidence",
    "AnalyticsRequest",
    "AnalyticsDetail",
    "AnalyticsResponse",
]
