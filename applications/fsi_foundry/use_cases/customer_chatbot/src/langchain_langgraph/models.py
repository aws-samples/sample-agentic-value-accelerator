"""
Customer Chatbot Models.

Pydantic models for customer chatbot requests and responses.
All models are specific to the customer chatbot use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class IntentType(str, Enum):
    """Type of customer chatbot intent."""
    FULL = "full"
    GENERAL = "general"
    ACCOUNT_INQUIRY = "account_inquiry"
    TRANSFER = "transfer"
    BILL_PAYMENT = "bill_payment"
    TRANSACTION_HISTORY = "transaction_history"


class ConversationStatus(str, Enum):
    """Conversation status classification."""
    ACTIVE = "active"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    PENDING = "pending"


class ActionType(str, Enum):
    """Type of action taken during the conversation."""
    BALANCE_CHECK = "balance_check"
    STATEMENT_REQUEST = "statement_request"
    TRANSFER_INITIATED = "transfer_initiated"
    BILL_PAID = "bill_paid"
    PROFILE_UPDATED = "profile_updated"
    INFO_PROVIDED = "info_provided"


class ChatRequest(BaseModel):
    """Request model for customer chatbot interaction."""
    customer_id: str = Field(..., description="Unique customer identifier")
    intent_type: IntentType = Field(
        default=IntentType.FULL,
        description="Type of chatbot intent"
    )
    message_context: str | None = Field(
        default=None,
        description="Additional message context for the conversation"
    )


class ActionDetail(BaseModel):
    """Details of an action taken during the conversation."""
    action_type: str | None = Field(default=None, description="Type of action performed")
    description: str = Field(..., description="Description of the action")
    status: str | None = Field(default=None, description="Action status")
    details: dict = Field(default_factory=dict, description="Additional action details")


class ChatResponse(BaseModel):
    """Response model for customer chatbot interaction."""
    customer_id: str = Field(..., description="Customer identifier")
    conversation_id: str = Field(..., description="Unique conversation identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Interaction timestamp")
    response_message: str = Field(..., description="Primary response message to the customer")
    actions_taken: list[ActionDetail] | None = Field(default=None, description="Actions performed during conversation")
    recommendations: list[str] = Field(default_factory=list, description="Follow-up recommendations")
    summary: str = Field(..., description="Executive summary of the interaction")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
