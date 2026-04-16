"""
Agentic Payments Use Case Models.

Pydantic models for payment validation, routing, and reconciliation.
All models are specific to the agentic_payments use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class PaymentType(str, Enum):
    """Type of payment transaction."""
    WIRE = "wire"
    ACH = "ach"
    REAL_TIME = "real_time"
    INTERNATIONAL = "international"
    DOMESTIC = "domestic"


class ValidationStatus(str, Enum):
    """Payment validation status."""
    APPROVED = "approved"
    REJECTED = "rejected"
    REQUIRES_REVIEW = "requires_review"


class ReconciliationStatus(str, Enum):
    """Payment reconciliation status."""
    MATCHED = "matched"
    UNMATCHED = "unmatched"
    DISCREPANCY = "discrepancy"
    PENDING = "pending"


class PaymentRail(str, Enum):
    """Available payment rails for routing."""
    FEDWIRE = "fedwire"
    ACH = "ach"
    RTP = "rtp"
    SWIFT = "swift"
    SEPA = "sepa"


class PaymentRequest(BaseModel):
    """Request model for agentic payment processing."""
    payment_id: str = Field(..., description="Unique payment identifier")
    payment_type: PaymentType = Field(..., description="Type of payment transaction")
    additional_context: str | None = Field(
        default=None,
        description="Additional context for payment processing"
    )


class ValidationResult(BaseModel):
    """Payment validation result details."""
    status: ValidationStatus = Field(..., description="Validation status")
    rules_checked: list[str] = Field(default_factory=list, description="Rules and limits checked")
    violations: list[str] = Field(default_factory=list, description="Rule violations detected")
    sanctions_clear: bool = Field(default=True, description="Sanctions screening result")
    risk_score: int = Field(..., ge=0, le=100, description="Risk score from 0-100")
    notes: list[str] = Field(default_factory=list, description="Additional validation notes")


class RoutingDecision(BaseModel):
    """Payment routing decision details."""
    selected_rail: PaymentRail = Field(..., description="Selected payment rail")
    alternative_rails: list[PaymentRail] = Field(default_factory=list, description="Alternative payment rails")
    estimated_settlement_time: str = Field(..., description="Estimated settlement time")
    routing_cost: float = Field(..., ge=0, description="Estimated routing cost")
    routing_rationale: str = Field(..., description="Rationale for rail selection")


class PaymentResponse(BaseModel):
    """Response model for agentic payment processing."""
    payment_id: str = Field(..., description="Payment identifier")
    transaction_id: str = Field(..., description="Unique transaction identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Processing timestamp")
    validation_result: ValidationResult | None = Field(default=None, description="Validation results")
    routing_decision: RoutingDecision | None = Field(default=None, description="Routing decision")
    reconciliation_status: ReconciliationStatus | None = Field(default=None, description="Reconciliation status")
    summary: str = Field(..., description="Executive summary of payment processing")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "PaymentType",
    "ValidationStatus",
    "ReconciliationStatus",
    "PaymentRail",
    "PaymentRequest",
    "ValidationResult",
    "RoutingDecision",
    "PaymentResponse",
]
