"""Post Call Analytics Use Case Models ."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    FULL = "full"
    TRANSCRIPTION = "transcription"
    SENTIMENT = "sentiment"
    ACTION_EXTRACTION = "action_extraction"


class SentimentLevel(str, Enum):
    VERY_NEGATIVE = "very_negative"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    POSITIVE = "positive"
    VERY_POSITIVE = "very_positive"


class ActionPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ActionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class PostCallRequest(BaseModel):
    call_id: str = Field(..., description="Unique call identifier")
    analysis_type: AnalysisType = Field(default=AnalysisType.FULL, description="Type of analysis to perform")
    additional_context: str | None = Field(default=None, description="Additional context")


class TranscriptionResult(BaseModel):
    speaker_count: int = Field(default=2, description="Number of speakers identified")
    duration_seconds: int = Field(default=0, description="Call duration in seconds")
    key_topics: list[str] = Field(default_factory=list, description="Key topics discussed")
    transcript_summary: str = Field(default="", description="Summary of the transcript")


class SentimentResult(BaseModel):
    overall_sentiment: str | None = Field(default=None, description="Overall call sentiment")
    customer_sentiment: str | None = Field(default=None, description="Customer sentiment")
    agent_sentiment: str | None = Field(default=None, description="Agent sentiment")
    satisfaction_score: float = Field(default=0.5, ge=0.0, le=1.0, description="Customer satisfaction score 0-1")
    emotional_shifts: list[str] = Field(default_factory=list, description="Notable emotional shifts during call")


class ActionItem(BaseModel):
    description: str = Field(..., description="Action item description")
    assignee: str | None = Field(default=None, description="Who is responsible")
    priority: str | None = Field(default=None, description="Priority level")
    deadline: str | None = Field(default=None, description="Deadline if mentioned")
    status: str | None = Field(default=None, description="Current status")


class PostCallResponse(BaseModel):
    call_id: str = Field(..., description="Call identifier")
    analytics_id: str = Field(..., description="Unique analytics identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Analysis timestamp")
    transcription: TranscriptionResult | None = Field(default=None, description="Transcription results")
    sentiment: SentimentResult | None = Field(default=None, description="Sentiment analysis results")
    action_items: list[ActionItem] = Field(default_factory=list, description="Extracted action items")
    summary: str = Field(..., description="Executive summary of the call analysis")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "AnalysisType", "SentimentLevel", "ActionPriority", "ActionStatus",
    "PostCallRequest", "TranscriptionResult", "SentimentResult", "ActionItem", "PostCallResponse",
]
