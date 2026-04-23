"""Market Surveillance Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class SurveillanceType(str, Enum):
    FULL = "full"
    TRADE_ONLY = "trade_only"
    COMMS_ONLY = "comms_only"
    ALERT_ONLY = "alert_only"

class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class SurveillanceRequest(BaseModel):
    customer_id: str = Field(..., description="Surveillance case or trader identifier")
    surveillance_type: SurveillanceType = Field(default=SurveillanceType.FULL)
    additional_context: str | None = Field(default=None)

class TradePatternResult(BaseModel):
    patterns_detected: list[str] = Field(default_factory=list)
    risk_score: int = Field(default=0, ge=0, le=100)
    anomalies: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

class CommsMonitorResult(BaseModel):
    flagged_communications: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    compliance_concerns: list[str] = Field(default_factory=list)

class AlertResult(BaseModel):
    severity: str = Field(default="medium")
    alert_type: str = Field(default="")
    recommended_actions: list[str] = Field(default_factory=list)
    escalation_required: bool = Field(default=False)

class SurveillanceResponse(BaseModel):
    customer_id: str
    surveillance_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    trade_pattern: TradePatternResult | None = None
    comms_monitor: CommsMonitorResult | None = None
    alert: AlertResult | None = None
    summary: str = Field(default="")
    raw_analysis: dict = Field(default_factory=dict)
