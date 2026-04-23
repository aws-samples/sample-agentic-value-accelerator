"""Agentic Commerce Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class CommerceType(str, Enum):
    FULL = "full"
    OFFER_ONLY = "offer_only"
    FULFILLMENT_ONLY = "fulfillment_only"
    MATCHING_ONLY = "matching_only"

class OfferStatus(str, Enum):
    GENERATED = "generated"
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING_REVIEW = "pending_review"

class FulfillmentStatus(str, Enum):
    READY = "ready"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"

class CommerceRequest(BaseModel):
    customer_id: str = Field(..., description="Customer identifier")
    commerce_type: CommerceType = Field(default=CommerceType.FULL)
    additional_context: str | None = Field(default=None)

class OfferResult(BaseModel):
    status: str = Field(default="pending_review")
    offers: list[str] = Field(default_factory=list)
    personalization_score: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: list[str] = Field(default_factory=list)

class FulfillmentResult(BaseModel):
    status: str = Field(default="in_progress")
    channel: str = Field(default="digital")
    steps_completed: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)

class MatchResult(BaseModel):
    matched_products: list[str] = Field(default_factory=list)
    confidence_scores: dict = Field(default_factory=dict)
    recommendations: list[str] = Field(default_factory=list)

class CommerceResponse(BaseModel):
    customer_id: str
    commerce_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    offer_result: OfferResult | None = None
    fulfillment_result: FulfillmentResult | None = None
    match_result: MatchResult | None = None
    summary: str = Field(default="")
    raw_analysis: dict = Field(default_factory=dict)
