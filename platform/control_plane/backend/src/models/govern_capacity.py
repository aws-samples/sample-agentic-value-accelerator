"""Govern Capacity — AWS Service Quotas models for capacity management.

Models for tracking AI-relevant service quotas, usage levels, and capacity
alerts. Used by the FinOps Capacity Management feature to help prevent
service limit surprises and plan capacity for AI workloads.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ServiceQuota(BaseModel):
    """Individual service quota with current usage."""

    service_code: str = Field(..., description="AWS service code, e.g. 'bedrock'")
    service_name: str = Field(..., description="Human-readable service name")
    quota_code: str = Field(..., description="Quota code, e.g. 'L-1234ABCD'")
    quota_name: str = Field(..., description="Quota name")
    value: float = Field(..., description="Current quota limit")
    unit: str = Field("None", description="Unit of measurement")
    usage: float = Field(0.0, description="Current usage value")
    usage_pct: float = Field(0.0, description="Usage as percentage of limit (0-100)")
    adjustable: bool = Field(False, description="Whether this quota can be increased")
    global_quota: bool = Field(False, description="Whether this is a global (vs regional) quota")
    status: str = Field("ok", description="Status: ok | warning | critical")


class QuotasResponse(BaseModel):
    """List of AI-relevant service quotas with usage."""

    quotas: List[ServiceQuota] = Field(default_factory=list)
    total_monitored: int = 0
    at_risk_count: int = Field(0, description="Quotas at >80% usage")
    critical_count: int = Field(0, description="Quotas at >90% usage")
    live: bool = Field(..., description="True when sourced from Service Quotas API")
    source: str = Field(..., description="'service-quotas' | 'unavailable-fallback'")
    note: Optional[str] = None


class CapacityAlert(BaseModel):
    """Quota approaching its limit."""

    service_code: str
    service_name: str
    quota_code: str
    quota_name: str
    value: float
    usage: float
    usage_pct: float
    severity: str = Field(..., description="warning | critical")
    recommendation: str = Field(..., description="Suggested action")


class AlertsResponse(BaseModel):
    """Quotas approaching limits (>70% used)."""

    alerts: List[CapacityAlert] = Field(default_factory=list)
    warning_count: int = 0
    critical_count: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class UsageDataPoint(BaseModel):
    """Single usage data point for trend chart."""

    timestamp: str = Field(..., description="ISO timestamp")
    value: float = Field(..., description="Usage value at this time")
    limit: float = Field(..., description="Quota limit at this time")


class UsageHistoryResponse(BaseModel):
    """Usage trend for a service over time."""

    service_code: str
    service_name: str
    data_points: List[UsageDataPoint] = Field(default_factory=list)
    period_start: str
    period_end: str
    current_usage: float
    current_limit: float
    trend: str = Field("stable", description="increasing | decreasing | stable")
    live: bool
    source: str
    note: Optional[str] = None


class QuotaIncreaseRequest(BaseModel):
    """Request to increase a service quota."""

    service_code: str = Field(..., description="AWS service code")
    quota_code: str = Field(..., description="Quota code to increase")
    desired_value: float = Field(..., description="Requested new limit")
    reason: str = Field(
        ...,
        description=(
            "Justification for the increase. Recorded in the control plane only: "
            "RequestServiceQuotaIncrease accepts ServiceCode, QuotaCode and DesiredValue "
            "and has no justification field, so AWS never receives this."
        ),
    )


class QuotaIncreaseResponse(BaseModel):
    """Response from a quota increase request."""

    case_id: Optional[str] = Field(None, description="AWS Support case ID if created")
    request_id: Optional[str] = Field(None, description="Service Quotas request ID")
    # Left as a plain str rather than a Literal on purpose. `error` was added after the
    # four original values, and a Literal would have failed validation - a 500 - at exactly
    # the moment AWS was already failing, turning a reportable degrade into an outage.
    status: str = Field(
        ...,
        description=(
            "submitted | pending | denied | approved | invalid | error. Only 'denied' "
            "means AWS judged the request. 'error' means the call to Service Quotas "
            "failed (permissions, throttling, an AWS-side fault, or no response). "
            "'invalid' means this control plane rejected the request before submitting "
            "it - the quota is not adjustable through Service Quotas, or the requested "
            "value is not above the current limit - so AWS never saw it; the values "
            "quoted in `message` are still measured (live=true). Neither 'invalid' nor "
            "'error' is ever reported as 'denied', which would imply AWS decided."
        ),
    )
    message: str = Field(..., description="User-facing status line, naming the quota and region")
    live: bool = Field(..., description="True when Service Quotas actually answered")
    source: str = Field(..., description="'service-quotas' | 'unavailable-fallback'")
    note: Optional[str] = Field(
        None,
        description=(
            "Degrade explanation: what this response does NOT establish. None when AWS "
            "answered and the status is its own verdict. Never a restatement of `message`."
        ),
    )
