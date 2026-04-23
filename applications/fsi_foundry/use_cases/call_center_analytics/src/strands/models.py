"""
Call Center Analytics Models (Strands Implementation).

Pydantic models for call center analytics requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    """Type of call center analysis to perform."""
    FULL = "full"
    CALL_MONITORING_ONLY = "call_monitoring_only"
    PERFORMANCE_ONLY = "performance_only"
    OPERATIONS_ONLY = "operations_only"


class CallQuality(str, Enum):
    """Call quality rating."""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class SentimentLevel(str, Enum):
    """Customer sentiment level detected during call."""
    VERY_POSITIVE = "very_positive"
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"
    VERY_NEGATIVE = "very_negative"


class CoachingPriority(str, Enum):
    """Priority level for agent coaching recommendations."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnalyticsRequest(BaseModel):
    """Request model for call center analytics."""
    call_center_id: str = Field(..., description="Unique call center identifier")
    analysis_type: AnalysisType = Field(
        default=AnalysisType.FULL,
        description="Type of analysis to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the analysis"
    )


class CallMonitoringResult(BaseModel):
    """Call monitoring analysis results."""
    overall_quality: str | None = Field(default=None, description="Overall call quality rating")
    average_sentiment: str | None = Field(default=None, description="Average customer sentiment")
    compliance_score: float = Field(default=0.0, description="Compliance adherence score 0-1")
    calls_reviewed: int = Field(default=0, description="Number of calls reviewed")
    quality_issues: list[str] = Field(default_factory=list, description="Identified quality issues")
    compliance_violations: list[str] = Field(default_factory=list, description="Compliance violations found")
    notes: list[str] = Field(default_factory=list, description="Additional monitoring notes")


class PerformanceMetrics(BaseModel):
    """Agent performance analysis results."""
    average_handle_time: float = Field(default=0.0, description="Average handle time in seconds")
    first_call_resolution_rate: float = Field(default=0.0, description="First call resolution rate 0-1")
    customer_satisfaction_score: float = Field(default=0.0, description="Average CSAT score 0-5")
    coaching_priority: str | None = Field(default=None, description="Coaching priority level")
    top_performers: list[str] = Field(default_factory=list, description="Top performing agents")
    coaching_opportunities: list[str] = Field(default_factory=list, description="Identified coaching opportunities")
    kpi_summary: dict = Field(default_factory=dict, description="Key performance indicator summary")
    notes: list[str] = Field(default_factory=list, description="Additional performance notes")


class OperationalInsights(BaseModel):
    """Operational insights and recommendations."""
    call_volume_trend: str = Field(default="", description="Call volume trend description")
    peak_hours: list[str] = Field(default_factory=list, description="Identified peak hours")
    bottlenecks: list[str] = Field(default_factory=list, description="Operational bottlenecks identified")
    staffing_recommendations: list[str] = Field(default_factory=list, description="Staffing optimization recommendations")
    process_improvements: list[str] = Field(default_factory=list, description="Process improvement suggestions")
    forecast_summary: str = Field(default="", description="Call volume forecast summary")
    notes: list[str] = Field(default_factory=list, description="Additional operational notes")


class AnalyticsResponse(BaseModel):
    """Response model for call center analytics."""
    call_center_id: str = Field(..., description="Call center identifier")
    analytics_id: str = Field(..., description="Unique analytics session identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    call_monitoring: CallMonitoringResult | None = Field(default=None)
    performance_metrics: PerformanceMetrics | None = Field(default=None)
    operational_insights: OperationalInsights | None = Field(default=None)
    summary: str = Field(..., description="Executive summary of the analytics")
    raw_analysis: dict = Field(default_factory=dict)


__all__ = [
    "AnalysisType", "CallQuality", "SentimentLevel", "CoachingPriority",
    "AnalyticsRequest", "CallMonitoringResult", "PerformanceMetrics",
    "OperationalInsights", "AnalyticsResponse",
]
