"""Call Summarization Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class SummarizationType(str, Enum):
    FULL = "full"
    KEY_POINTS_ONLY = "key_points_only"
    SUMMARY_ONLY = "summary_only"

class OutcomeType(str, Enum):
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    FOLLOW_UP = "follow_up"
    UNRESOLVED = "unresolved"

class AudienceLevel(str, Enum):
    EXECUTIVE = "executive"
    MANAGER = "manager"
    AGENT = "agent"
    DETAILED = "detailed"

class SummarizationRequest(BaseModel):
    call_id: str = Field(..., description="Unique call identifier")
    summarization_type: SummarizationType = Field(default=SummarizationType.FULL)
    additional_context: str | None = Field(default=None)

class KeyPoint(BaseModel):
    topic: str = Field(..., description="Topic of the key point")
    detail: str = Field(..., description="Detail of the key point")
    confidence: float = Field(default=0.0, description="Confidence 0.0-1.0")

class KeyPointsResult(BaseModel):
    key_points: list[KeyPoint] = Field(default_factory=list)
    call_outcome: str = Field(default="resolved")
    topics_discussed: list[str] = Field(default_factory=list)

class SummaryResult(BaseModel):
    executive_summary: str = Field(default="", description="Concise executive summary")
    action_items: list[str] = Field(default_factory=list)
    customer_sentiment: str = Field(default="neutral")
    audience_level: str = Field(default="manager")

class SummarizationResponse(BaseModel):
    call_id: str = Field(..., description="Call identifier")
    summarization_id: str = Field(..., description="Unique summarization identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    key_points: KeyPointsResult | None = Field(default=None)
    summary: SummaryResult | None = Field(default=None)
    overall_summary: str = Field(..., description="Overall summary of the call")
    raw_analysis: dict = Field(default_factory=dict)
