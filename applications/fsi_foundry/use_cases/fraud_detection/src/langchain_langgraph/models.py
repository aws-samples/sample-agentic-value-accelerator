"""
Fraud Detection Models.

Pydantic models for fraud detection monitoring requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class MonitoringType(str, Enum):
    FULL = "full"
    TRANSACTION_MONITORING = "transaction_monitoring"
    PATTERN_ANALYSIS = "pattern_analysis"
    ALERT_GENERATION = "alert_generation"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class MonitoringRequest(BaseModel):
    customer_id: str = Field(..., description="Unique customer/account identifier")
    monitoring_type: MonitoringType = Field(default=MonitoringType.FULL, description="Type of monitoring to perform")
    additional_context: str | None = Field(default=None, description="Additional context for the monitoring request")


class RiskAssessment(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Risk score from 0-100")
    level: RiskLevel = Field(..., description="Risk level classification")
    factors: list[str] = Field(default_factory=list, description="Contributing risk factors")
    recommendations: list[str] = Field(default_factory=list, description="Risk mitigation recommendations")


class FraudAlert(BaseModel):
    alert_id: str = Field(..., description="Unique alert identifier")
    severity: AlertSeverity = Field(..., description="Alert severity level")
    description: str = Field(..., description="Alert description")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence")
    recommended_actions: list[str] = Field(default_factory=list, description="Recommended actions")


class MonitoringResponse(BaseModel):
    customer_id: str = Field(..., description="Customer/account identifier")
    monitoring_id: str = Field(..., description="Unique monitoring session identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Monitoring timestamp")
    risk_assessment: RiskAssessment | None = Field(default=None, description="Overall risk assessment")
    alerts: list[FraudAlert] = Field(default_factory=list, description="Generated fraud alerts")
    summary: str = Field(..., description="Executive summary of the monitoring session")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
