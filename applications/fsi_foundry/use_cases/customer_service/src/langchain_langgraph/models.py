"""
Customer Service Use Case Models.

Pydantic models for customer service interaction requests and responses.
All models are specific to the customer service use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class InquiryType(str, Enum):
    """Type of customer service inquiry."""
    FULL = "full"
    GENERAL = "general"
    TRANSACTION_DISPUTE = "transaction_dispute"
    PRODUCT_INQUIRY = "product_inquiry"
    SERVICE_REQUEST = "service_request"


class ResolutionStatus(str, Enum):
    """Resolution status for a service inquiry."""
    RESOLVED = "resolved"
    PENDING = "pending"
    ESCALATED = "escalated"


class Priority(str, Enum):
    """Priority level for a service inquiry."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ServiceRequest(BaseModel):
    """Request model for customer service interaction."""
    customer_id: str = Field(..., description="Unique customer identifier")
    inquiry_type: InquiryType = Field(
        default=InquiryType.FULL,
        description="Type of service inquiry"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the inquiry"
    )


class ResolutionDetail(BaseModel):
    """Details of the service resolution."""
    status: ResolutionStatus = Field(..., description="Resolution status")
    priority: Priority = Field(default=Priority.MEDIUM, description="Inquiry priority")
    actions_taken: list[str] = Field(default_factory=list, description="Actions taken to resolve")
    follow_up_required: bool = Field(default=False, description="Whether follow-up is needed")
    notes: list[str] = Field(default_factory=list, description="Resolution notes")


class ServiceResponse(BaseModel):
    """Response model for customer service interaction."""
    customer_id: str = Field(..., description="Customer identifier")
    service_id: str = Field(..., description="Unique service interaction identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Interaction timestamp")
    resolution: ResolutionDetail | None = Field(default=None, description="Resolution details")
    recommendations: list[str] = Field(default_factory=list, description="Product/service recommendations")
    summary: str = Field(..., description="Executive summary of the interaction")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "InquiryType",
    "ResolutionStatus",
    "Priority",
    "ServiceRequest",
    "ResolutionDetail",
    "ServiceResponse",
]
