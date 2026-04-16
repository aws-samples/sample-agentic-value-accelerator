"""
Customer Support Use Case Models.

Pydantic models for customer support requests and responses.
All models are specific to the customer support use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class TicketType(str, Enum):
    """Type of support ticket."""
    FULL = "full"
    GENERAL = "general"
    BILLING = "billing"
    TECHNICAL = "technical"
    ACCOUNT = "account"


class UrgencyLevel(str, Enum):
    """Urgency level for a support ticket."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EscalationStatus(str, Enum):
    """Escalation status for a support ticket."""
    NOT_NEEDED = "not_needed"
    RECOMMENDED = "recommended"
    REQUIRED = "required"


class SupportRequest(BaseModel):
    """Request model for customer support interaction."""
    customer_id: str = Field(..., description="Unique customer identifier")
    ticket_type: TicketType = Field(
        default=TicketType.FULL,
        description="Type of support ticket"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the ticket"
    )


class TicketClassification(BaseModel):
    """Ticket classification details."""
    category: str = Field(..., description="Ticket category")
    urgency: UrgencyLevel = Field(default=UrgencyLevel.MEDIUM, description="Ticket urgency level")
    required_expertise: list[str] = Field(default_factory=list, description="Required expertise areas")
    tags: list[str] = Field(default_factory=list, description="Classification tags")


class ResolutionSuggestion(BaseModel):
    """Resolution suggestion details."""
    suggested_resolution: str = Field(..., description="Suggested resolution text")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score for the suggestion")
    similar_cases: list[str] = Field(default_factory=list, description="Similar historical case IDs")
    steps: list[str] = Field(default_factory=list, description="Resolution steps")
    knowledge_base_refs: list[str] = Field(default_factory=list, description="Knowledge base article references")


class EscalationDecision(BaseModel):
    """Escalation decision details."""
    status: EscalationStatus = Field(..., description="Escalation status")
    reason: str | None = Field(default=None, description="Reason for escalation decision")
    recommended_team: str | None = Field(default=None, description="Recommended team for escalation")
    priority_override: UrgencyLevel | None = Field(default=None, description="Priority override if escalated")


class SupportResponse(BaseModel):
    """Response model for customer support interaction."""
    customer_id: str = Field(..., description="Customer identifier")
    ticket_id: str = Field(..., description="Unique support ticket identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Interaction timestamp")
    classification: TicketClassification | None = Field(default=None, description="Ticket classification")
    resolution: ResolutionSuggestion | None = Field(default=None, description="Resolution suggestion")
    escalation: EscalationDecision | None = Field(default=None, description="Escalation decision")
    recommendations: list[str] = Field(default_factory=list, description="Action recommendations")
    summary: str = Field(..., description="Executive summary of the support interaction")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
