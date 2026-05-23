"""Compliance Deadline Monitor Models (Strands Implementation).

Pydantic models for compliance deadline monitoring requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class FilingType(str, Enum):
    SAR = "sar"
    CTR = "ctr"
    SEC_10K = "sec_10k"
    SEC_10Q = "sec_10q"
    CALL_REPORT = "call_report"
    FR_Y9C = "fr_y9c"


class UrgencyLevel(str, Enum):
    OVERDUE = "overdue"
    CRITICAL = "critical"
    WARNING = "warning"
    ON_TRACK = "on_track"


class MonitorRequest(BaseModel):
    as_of_date: str | None = Field(default=None, description="Date to check deadlines against (ISO format). Defaults to today.")
    filing_types: list[FilingType] | None = Field(default=None, description="Filter to specific filing types. None means all.")


class DeadlineItem(BaseModel):
    filing_type: FilingType = Field(..., description="Type of regulatory filing")
    entity: str = Field(..., description="Entity or account the filing relates to")
    due_date: str = Field(..., description="Filing deadline (ISO date)")
    days_remaining: int = Field(..., description="Days until deadline (negative = overdue)")
    urgency: UrgencyLevel = Field(..., description="Urgency classification")
    status: str = Field(..., description="Current filing status")
    recommended_action: str = Field(..., description="Recommended next step")


class MonitorResponse(BaseModel):
    monitor_id: str = Field(..., description="Unique monitoring run identifier")
    as_of_date: str = Field(..., description="Date the check was performed against")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Run timestamp")
    total_deadlines: int = Field(default=0, description="Total deadlines checked")
    at_risk: int = Field(default=0, description="Number of deadlines at risk or overdue")
    deadlines: list[DeadlineItem] = Field(default_factory=list, description="Deadline items sorted by urgency")
    escalations: list[str] = Field(default_factory=list, description="Recommended escalations")
    summary: str = Field(..., description="Executive summary of deadline status")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "FilingType", "UrgencyLevel",
    "MonitorRequest", "DeadlineItem", "MonitorResponse",
]
