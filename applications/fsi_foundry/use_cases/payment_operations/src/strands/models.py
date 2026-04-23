"""Payment Operations Models (Strands Implementation)."""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class OperationType(str, Enum):
    FULL = "full"
    EXCEPTION_ONLY = "exception_only"
    SETTLEMENT_ONLY = "settlement_only"


class ExceptionSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SettlementStatus(str, Enum):
    PENDING = "pending"
    SETTLED = "settled"
    FAILED = "failed"
    REQUIRES_ACTION = "requires_action"


class OperationsRequest(BaseModel):
    customer_id: str = Field(..., description="Payment or customer identifier")
    operation_type: OperationType = Field(default=OperationType.FULL)
    additional_context: str | None = Field(default=None)


class ExceptionResolution(BaseModel):
    severity: str = Field(default="medium")
    resolution: str = Field(default="Pending review")
    actions_taken: list[str] = Field(default_factory=list)
    requires_escalation: bool = Field(default=False)


class SettlementResult(BaseModel):
    status: str = Field(default="pending")
    settlement_date: str | None = Field(default=None)
    reconciled: bool = Field(default=False)
    notes: list[str] = Field(default_factory=list)


class OperationsResponse(BaseModel):
    customer_id: str
    operation_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    exception_resolution: ExceptionResolution | None = None
    settlement_result: SettlementResult | None = None
    summary: str = Field(default="")
    raw_analysis: dict = Field(default_factory=dict)
