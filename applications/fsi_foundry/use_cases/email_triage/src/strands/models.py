"""Email Triage Use Case Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class TriageType(str, Enum):
    FULL = "full"
    CLASSIFICATION = "classification"
    ACTION_EXTRACTION = "action_extraction"

class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class EmailCategory(str, Enum):
    CLIENT_REQUEST = "client_request"
    TRADE_INSTRUCTION = "trade_instruction"
    COMPLIANCE_ALERT = "compliance_alert"
    MARKET_UPDATE = "market_update"
    INTERNAL_MEMO = "internal_memo"
    MEETING_REQUEST = "meeting_request"

class TriageRequest(BaseModel):
    entity_id: str = Field(..., description="Unique email or batch identifier")
    triage_type: TriageType = Field(default=TriageType.FULL, description="Type of triage request")
    additional_context: str | None = Field(default=None, description="Additional context")

class ClassificationDetail(BaseModel):
    category: str | None = Field(default=None, description="Email category")
    urgency: str | None = Field(default=None, description="Urgency level")
    sender_importance: float = Field(default=0.5, description="Sender importance score 0-1")
    topics: list[str] = Field(default_factory=list, description="Identified topics")
    actions_required: list[str] = Field(default_factory=list, description="Extracted action items")
    deadlines: list[str] = Field(default_factory=list, description="Extracted deadlines")

class TriageResponse(BaseModel):
    entity_id: str = Field(..., description="Email identifier")
    triage_id: str = Field(..., description="Unique triage identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Triage timestamp")
    classification: ClassificationDetail | None = Field(default=None, description="Classification details")
    recommendations: list[str] = Field(default_factory=list, description="Prioritization recommendations")
    summary: str = Field(..., description="Executive summary of the email triage")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")

__all__ = ["TriageType", "UrgencyLevel", "EmailCategory", "TriageRequest", "ClassificationDetail", "TriageResponse"]
