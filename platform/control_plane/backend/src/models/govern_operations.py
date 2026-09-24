"""Govern Operations - Pydantic models for the Operations Hub API.

Covers: Fleet Health, Incidents, Alerts, SLAs, On-Call, Changes, Metrics, Capacity.
Data flows from CloudWatch, Service Quotas, DynamoDB, and optionally PagerDuty.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================


class AgentHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


class IncidentStatus(str, Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    IDENTIFIED = "identified"
    MONITORING = "monitoring"
    RESOLVED = "resolved"


class IncidentSeverity(str, Enum):
    SEV1 = "sev1"  # Critical - immediate response
    SEV2 = "sev2"  # High - urgent
    SEV3 = "sev3"  # Medium - normal priority
    SEV4 = "sev4"  # Low - minor issue


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertState(str, Enum):
    ALARM = "alarm"
    OK = "ok"
    INSUFFICIENT_DATA = "insufficient_data"


class SLAStatus(str, Enum):
    COMPLIANT = "compliant"
    AT_RISK = "at_risk"
    BREACHED = "breached"


class ChangeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEPLOYED = "deployed"
    ROLLED_BACK = "rolled_back"


# ============================================================================
# Fleet Health Models
# ============================================================================


class AgentHealthMetrics(BaseModel):
    """Health metrics for a single agent."""

    latency_p50_ms: float = Field(0.0, description="50th percentile latency in ms")
    latency_p99_ms: float = Field(0.0, description="99th percentile latency in ms")
    error_rate_pct: float = Field(0.0, description="Error rate percentage (0-100)")
    invocations_24h: int = Field(0, description="Invocations in last 24 hours")
    success_rate_pct: float = Field(100.0, description="Success rate percentage (0-100)")


class AgentHealthRecord(BaseModel):
    """Health record for a single agent in the fleet."""

    agent_id: str
    agent_name: str
    platform: str = Field(description="bedrock-agent | agentcore | sagemaker")
    status: AgentHealthStatus = AgentHealthStatus.UNKNOWN
    health_score: int = Field(0, ge=0, le=100, description="Composite health score")
    metrics: AgentHealthMetrics = Field(default_factory=AgentHealthMetrics)
    last_invocation: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    open_incidents: int = 0
    environment: Literal["prod", "pilot", "dev"] = "dev"
    region: str = "us-east-1"


class FleetStatusSummary(BaseModel):
    """Summary of fleet health status."""

    total: int = 0
    healthy: int = 0
    degraded: int = 0
    down: int = 0
    unknown: int = 0
    pct_healthy: float = Field(0.0, description="Percentage of healthy agents")
    avg_health_score: float = Field(0.0, description="Average health score across fleet")


class FleetStatusResponse(BaseModel):
    """Response for fleet status endpoint."""

    summary: FleetStatusSummary
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    live: bool = False
    source: str = "aggregation"
    note: Optional[str] = None


class FleetAgentsResponse(BaseModel):
    """Response for fleet agents list endpoint."""

    agents: List[AgentHealthRecord] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50
    live: bool = False
    source: str = "aggregation"
    note: Optional[str] = None


class AgentDetailResponse(BaseModel):
    """Detailed response for a single agent."""

    agent: AgentHealthRecord
    recent_incidents: List[str] = Field(default_factory=list, description="Recent incident IDs")
    recent_alerts: List[str] = Field(default_factory=list, description="Recent alert IDs")
    live: bool = False
    source: str = "aggregation"
    note: Optional[str] = None


# ============================================================================
# Incidents Models
# ============================================================================


class TimelineEvent(BaseModel):
    """A single event in an incident timeline."""

    id: str = Field(default_factory=lambda: f"te-{uuid.uuid4().hex[:12]}")
    ts: datetime = Field(default_factory=datetime.utcnow)
    event_type: str = Field(description="status_change | note | action | escalation")
    actor: str
    description: str
    metadata: Optional[Dict] = None


class TimelineEventCreate(BaseModel):
    """Payload to create a timeline event."""

    event_type: str
    actor: str
    description: str
    metadata: Optional[Dict] = None


class IncidentBase(BaseModel):
    """Base incident fields."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="", max_length=5000)
    severity: IncidentSeverity = IncidentSeverity.SEV3
    status: IncidentStatus = IncidentStatus.OPEN
    affected_agents: List[str] = Field(default_factory=list)
    affected_services: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class IncidentCreate(IncidentBase):
    """Payload to create an incident."""

    pass


class IncidentUpdate(BaseModel):
    """Payload to update an incident (partial)."""

    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[IncidentSeverity] = None
    status: Optional[IncidentStatus] = None
    affected_agents: Optional[List[str]] = None
    affected_services: Optional[List[str]] = None
    owner: Optional[str] = None
    tags: Optional[List[str]] = None
    resolution_summary: Optional[str] = None


class Incident(IncidentBase):
    """Full incident record."""

    id: str = Field(default_factory=lambda: f"inc-{uuid.uuid4().hex[:12]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    detected_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    timeline: List[TimelineEvent] = Field(default_factory=list)
    resolution_summary: Optional[str] = None
    # Computed metrics
    #
    # ttd_minutes has NO writer anywhere in this codebase and IncidentCreate does
    # not expose it, so it is always None in practice. It is deliberately left
    # unpopulated rather than faked: detection latency is (onset of the real
    # condition) -> (the moment we noticed), and this system has no onset signal.
    # `detected_at` is stamped with utcnow() inside create_incident(), so any
    # detected_at - created_at would be ~0 by construction, and incidents here are
    # created only by a manual POST /incidents call, never by an alarm. Populating
    # this honestly requires an external onset timestamp (e.g. an alarm/anomaly
    # transition on a Bedrock/AgentCore metric that actually feeds incident
    # creation); no such alarm or wiring exists today. Until one does, every mean
    # derived from this field must be reported as None, not 0.0 - see
    # OperationsMetricsSummary.mttd_minutes.
    ttd_minutes: Optional[float] = Field(None, description="Time to detect (minutes)")
    ttr_minutes: Optional[float] = Field(None, description="Time to resolve (minutes)")


class IncidentResponse(BaseModel):
    """Response wrapper for a single incident."""

    incident: Incident
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class IncidentsListResponse(BaseModel):
    """Response for incidents list endpoint."""

    incidents: List[Incident] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50
    mttr_minutes: Optional[float] = Field(None, description="Mean Time To Resolve")
    mttd_minutes: Optional[float] = Field(
        None,
        description=(
            "Mean Time To Detect. Always None: detection latency is not currently "
            "measured because no incident carries a ttd_minutes value (see "
            "Incident.ttd_minutes)."
        ),
    )
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# Alerts Models
# ============================================================================


class AlertRule(BaseModel):
    """Alert rule definition."""

    id: str = Field(default_factory=lambda: f"ar-{uuid.uuid4().hex[:12]}")
    name: str
    description: str = ""
    metric_namespace: str
    metric_name: str
    dimensions: Dict[str, str] = Field(default_factory=dict)
    threshold: float
    comparison: str = Field(description="GreaterThanThreshold | LessThanThreshold | etc.")
    period_seconds: int = 300
    evaluation_periods: int = 1
    severity: AlertSeverity = AlertSeverity.MEDIUM
    enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AlertRuleCreate(BaseModel):
    """Payload to create an alert rule."""

    name: str
    description: str = ""
    metric_namespace: str
    metric_name: str
    dimensions: Dict[str, str] = Field(default_factory=dict)
    threshold: float
    comparison: str
    period_seconds: int = 300
    evaluation_periods: int = 1
    severity: AlertSeverity = AlertSeverity.MEDIUM
    enabled: bool = True


class Alert(BaseModel):
    """Active alert instance."""

    id: str
    alarm_name: str
    alarm_arn: Optional[str] = None
    state: AlertState
    severity: AlertSeverity = AlertSeverity.MEDIUM
    metric_namespace: str
    metric_name: str
    dimensions: Dict[str, str] = Field(default_factory=dict)
    state_reason: str = ""
    state_updated: Optional[datetime] = None
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    silenced_until: Optional[datetime] = None


class AlertSilence(BaseModel):
    """Alert silence definition."""

    id: str = Field(default_factory=lambda: f"as-{uuid.uuid4().hex[:12]}")
    alarm_name_pattern: str = Field(description="Glob pattern to match alarm names")
    reason: str
    created_by: str
    starts_at: datetime = Field(default_factory=datetime.utcnow)
    ends_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AlertSilenceCreate(BaseModel):
    """Payload to create an alert silence."""

    alarm_name_pattern: str
    reason: str
    # Optional, and NOT authoritative. The route records the caller from the `x-user-email`
    # header - the same header core/rbac.py:88 reads to decide the role - and that header
    # wins over this field. A body field is data the caller typed; the header is what the
    # auth layer acted on, so a caller who sends one can never attribute a silence to
    # somebody else. This is only a fallback for header-less server-to-server callers.
    created_by: Optional[str] = Field(
        None,
        description=(
            "Fallback actor for header-less server-to-server callers. The `x-user-email` "
            "request header is authoritative and overrides this; unset on both resolves "
            "to \"unknown\"."
        ),
    )
    duration_minutes: int = Field(60, ge=1, le=10080, description="Silence duration (max 7 days)")


class ActiveAlertsResponse(BaseModel):
    """Response for active alerts endpoint."""

    alerts: List[Alert] = Field(default_factory=list)
    total: int = 0
    critical_count: int = 0
    high_count: int = 0
    live: bool = False
    source: str = "cloudwatch"
    note: Optional[str] = None


class AlertRulesResponse(BaseModel):
    """Response for alert rules endpoint."""

    rules: List[AlertRule] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# SLA Models
# ============================================================================


class SLATarget(BaseModel):
    """SLA target definition."""

    id: str = Field(default_factory=lambda: f"sla-{uuid.uuid4().hex[:12]}")
    name: str
    description: str = ""
    metric_type: str = Field(description="availability | latency | error_rate | throughput")
    target_value: float = Field(description="Target value (e.g., 99.9 for availability)")
    target_unit: str = Field(description="percent | ms | count")
    measurement_window: str = Field("monthly", description="hourly | daily | weekly | monthly")
    services: List[str] = Field(default_factory=list)
    agents: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SLATargetCreate(BaseModel):
    """Payload to create an SLA target."""

    name: str
    description: str = ""
    metric_type: str = Field(description="availability | latency | error_rate | throughput")
    target_value: float = Field(description="Target value (e.g., 99.9 for availability)")
    target_unit: str = Field("percent", description="percent | ms | count")
    measurement_window: str = Field("monthly", description="hourly | daily | weekly | monthly")
    services: List[str] = Field(default_factory=list)
    agents: List[str] = Field(default_factory=list)


class SLACompliance(BaseModel):
    """SLA compliance status."""

    sla_id: str
    sla_name: str
    target_value: float
    current_value: float
    status: SLAStatus
    error_budget_remaining_pct: float = Field(100.0, description="Remaining error budget")
    measurement_start: datetime
    measurement_end: datetime
    breaches_in_window: int = 0


class SLABreach(BaseModel):
    """SLA breach record."""

    id: str = Field(default_factory=lambda: f"sb-{uuid.uuid4().hex[:12]}")
    sla_id: str
    sla_name: str
    breach_start: datetime
    breach_end: Optional[datetime] = None
    target_value: float
    actual_value: float
    impact_description: str = ""
    root_cause: Optional[str] = None
    remediation: Optional[str] = None
    # Which SLA metric breached, and how severe. Optional because no writer
    # populates them yet; consumers must render "unknown" rather than guess.
    metric_name: Optional[str] = None
    severity: Optional[str] = Field(None, description="critical | high | medium | low")
    # Acknowledgement state (mirrors Alert.acknowledged*).
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None


class SLABreachResolve(BaseModel):
    """Payload to resolve an SLA breach."""

    resolution_notes: str = ""


class SLAListResponse(BaseModel):
    """Response for SLA list endpoint."""

    slas: List[SLACompliance] = Field(default_factory=list)
    total: int = 0
    compliant_count: int = 0
    at_risk_count: int = 0
    breached_count: int = 0
    overall_compliance_pct: float = 0.0
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


class SLADetailResponse(BaseModel):
    """Response for SLA detail endpoint."""

    sla: SLATarget
    # Optional because SLACompliance has no honest "not measured" shape: current_value,
    # status and error_budget_remaining_pct are all required, and nothing in this system
    # measures any of them (see GovernOperationsService._compute_sla_compliance). The
    # alternatives were both lies - construct an SLACompliance around a stand-in
    # current_value, or 404 an SLA that demonstrably exists. Same reasoning as
    # SLABreach.metric_name / .severity above: a field no writer can populate is null and
    # the consumer renders "not measured", rather than being handed a guess.
    compliance: Optional[SLACompliance] = None
    recent_breaches: List[SLABreach] = Field(default_factory=list)
    trend: List[Dict] = Field(default_factory=list, description="Historical compliance data points")
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


class SLABreachesResponse(BaseModel):
    """Response for SLA breaches endpoint."""

    breaches: List[SLABreach] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class SLAComplianceReportResponse(BaseModel):
    """Response for SLA compliance report endpoint."""

    report_period_start: datetime
    report_period_end: datetime
    slas: List[SLACompliance] = Field(default_factory=list)
    overall_compliance_pct: float = 0.0
    total_breaches: int = 0
    # Optional, and None when no SLA was evaluated. It was `float = 100.0`, which made the
    # response report a full error budget remaining precisely when nothing had been measured -
    # the most reassuring value available for the least informative state. A note said so, but
    # a note beside a number does not stop the number being read, and the schema left the
    # service no way to say "not measured".
    avg_error_budget_remaining_pct: Optional[float] = None
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


class SLAErrorBudget(BaseModel):
    """Error budget position for a single SLA.

    `remaining_pct` is surfaced straight from the SLA compliance calculation
    (SLACompliance.error_budget_remaining_pct) rather than recomputed.
    Budget minutes are only derivable for availability SLAs; burn-rate trend,
    projected exhaustion, and history need a historical store that does not
    exist yet, so they stay unset instead of being invented.
    """

    sla_id: str
    sla_name: str
    metric_type: str
    measurement_window: str
    target_value: float
    current_value: float
    remaining_pct: float
    measurement_start: datetime
    measurement_end: datetime
    total_budget_minutes: Optional[float] = None
    used_budget_minutes: Optional[float] = None
    burn_rate: Optional[float] = None
    burn_rate_trend: Optional[str] = Field(
        None, description="increasing | stable | decreasing (needs history)"
    )
    projected_exhaustion: Optional[datetime] = None
    history: List[Dict] = Field(
        default_factory=list, description="Burn-down history points (empty until stored)"
    )


class SLAErrorBudgetsResponse(BaseModel):
    """Response for the SLA error-budget endpoint."""

    budgets: List[SLAErrorBudget] = Field(default_factory=list)
    total: int = 0
    avg_remaining_pct: Optional[float] = None
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


# ============================================================================
# On-Call Models
# ============================================================================


class OnCallPerson(BaseModel):
    """Person on call."""

    id: str
    name: str
    email: str
    phone: Optional[str] = None
    role: str = "engineer"
    escalation_level: int = 1


class OnCallShift(BaseModel):
    """On-call shift definition."""

    id: str = Field(default_factory=lambda: f"ocs-{uuid.uuid4().hex[:12]}")
    person: OnCallPerson
    start_time: datetime
    end_time: datetime
    schedule_name: str
    is_override: bool = False


class EscalationPolicy(BaseModel):
    """Escalation policy definition."""

    id: str = Field(default_factory=lambda: f"ep-{uuid.uuid4().hex[:12]}")
    name: str
    description: str = ""
    levels: List[Dict] = Field(default_factory=list, description="Escalation levels with timeouts")
    repeat_enabled: bool = False
    repeat_after_minutes: int = 30
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CurrentOnCallResponse(BaseModel):
    """Response for current on-call endpoint."""

    primary: Optional[OnCallPerson] = None
    secondary: Optional[OnCallPerson] = None
    escalation_policy: Optional[str] = None
    schedule_name: Optional[str] = None
    shift_ends_at: Optional[datetime] = None
    live: bool = False
    source: str = "pagerduty"
    note: Optional[str] = None


class OnCallScheduleResponse(BaseModel):
    """Response for on-call schedule endpoint."""

    shifts: List[OnCallShift] = Field(default_factory=list)
    week_start: datetime
    week_end: datetime
    live: bool = False
    source: str = "pagerduty"
    note: Optional[str] = None


class EscalationPoliciesResponse(BaseModel):
    """Response for escalation policies endpoint."""

    policies: List[EscalationPolicy] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "pagerduty"
    note: Optional[str] = None


# ============================================================================
# Changes Models
# ============================================================================


class ChangeRecord(BaseModel):
    """Change record for audit trail."""

    id: str = Field(default_factory=lambda: f"chg-{uuid.uuid4().hex[:12]}")
    title: str
    description: str = ""
    change_type: str = Field(description="deployment | config | infrastructure | policy")
    status: ChangeStatus = ChangeStatus.PENDING
    risk_level: str = Field("low", description="low | medium | high | critical")
    affected_services: List[str] = Field(default_factory=list)
    affected_agents: List[str] = Field(default_factory=list)
    requested_by: str
    approved_by: Optional[str] = None
    deployed_by: Optional[str] = None
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    scheduled_at: Optional[datetime] = None
    deployed_at: Optional[datetime] = None
    rollback_at: Optional[datetime] = None
    deployment_id: Optional[str] = None
    notes: str = ""


class ChangeRecordCreate(BaseModel):
    """Payload to create a change record."""

    title: str
    description: str = ""
    change_type: str
    risk_level: str = "low"
    affected_services: List[str] = Field(default_factory=list)
    affected_agents: List[str] = Field(default_factory=list)
    requested_by: str
    scheduled_at: Optional[datetime] = None
    deployment_id: Optional[str] = None
    notes: str = ""


class ChangesListResponse(BaseModel):
    """Response for changes list endpoint."""

    changes: List[ChangeRecord] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class PendingChangesResponse(BaseModel):
    """Response for pending changes endpoint."""

    changes: List[ChangeRecord] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# Metrics Models
# ============================================================================


class OperationsMetricsSummary(BaseModel):
    """Summary of key operations metrics."""

    mttr_minutes: float = Field(0.0, description="Mean Time To Resolve")
    # None whenever no incident carries a ttd_minutes value, which is always today:
    # detection latency is NOT measured by this system (Incident.ttd_minutes has no
    # writer). A hard 0.0 here read as an instant-detection "Excellent" MTTD under a
    # Live badge, so callers must render "no data" instead of a number.
    mttd_minutes: Optional[float] = Field(
        None,
        description=(
            "Mean Time To Detect in minutes. None when detection latency is not "
            "measured - which is the case today: nothing in this system records "
            "an incident's onset, so no incident carries a ttd_minutes value. "
            "Render as 'not measured', never as 0."
        ),
    )
    cfr_pct: float = Field(0.0, description="Change Failure Rate percentage")
    # Not availability in the SLO sense, and None when unmeasured. Two separate
    # problems lived in the old `float = 100.0`:
    #
    #  1. The value is a point-in-time healthy-agent ratio (FleetStatusSummary.
    #     pct_healthy), not uptime over a window. Nothing here samples health over
    #     time, so no window can be attached to it - see the field description.
    #  2. When every agent resolves to UNKNOWN health, pct_healthy is a hard 0.0.
    #     Under a Live badge that reads as a total outage, when in fact nothing was
    #     measured. The default of 100.0 had the mirror-image problem: perfect
    #     availability asserted for a fleet nobody looked at.
    #
    # Same treatment as mttd_minutes and sla_compliance_pct above/below.
    availability_pct: Optional[float] = Field(
        None,
        description=(
            "Percentage of the fleet reporting healthy RIGHT NOW, not uptime over a "
            "window - this system takes no health samples over time. None when fleet "
            "health is unmeasured (no agents discovered, or every agent's health is "
            "UNKNOWN). Render as 'not measured', never as 0 or 100."
        ),
    )
    incident_count_30d: int = 0
    change_count_30d: int = 0
    alert_count_24h: int = 0
    # None when no SLAs are defined: there is nothing to measure, so callers must
    # render "no data" rather than 0% (which reads as total non-compliance) or
    # 100% (which reads as perfect compliance).
    sla_compliance_pct: Optional[float] = Field(
        None, description="Overall SLA compliance %; None when no SLAs are defined"
    )
    measurement_period_days: int = 30


class MetricsTrendPoint(BaseModel):
    """Single data point in a trend."""

    timestamp: datetime
    value: float
    label: Optional[str] = None


class MetricsTrend(BaseModel):
    """Trend data for a single metric."""

    metric_name: str
    unit: str
    points: List[MetricsTrendPoint] = Field(default_factory=list)


class MetricsSummaryResponse(BaseModel):
    """Response for metrics summary endpoint."""

    summary: OperationsMetricsSummary
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


class MetricsTrendsResponse(BaseModel):
    """Response for metrics trends endpoint."""

    trends: List[MetricsTrend] = Field(default_factory=list)
    period_start: datetime
    period_end: datetime
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


# ============================================================================
# Capacity Models
# ============================================================================


class QuotaUsage(BaseModel):
    """Service quota with current usage."""

    quota_code: str
    quota_name: str
    service_code: str
    service_name: str
    value: float = Field(description="Quota limit")
    usage: float = Field(description="Current usage")
    usage_pct: float = Field(description="Usage as percentage of quota")
    unit: str
    adjustable: bool = False
    global_quota: bool = False
    region: str = "us-east-1"


class QuotaAlert(BaseModel):
    """Alert for quota approaching limit."""

    quota_code: str
    quota_name: str
    service_code: str
    current_usage_pct: float
    threshold_pct: float
    severity: AlertSeverity
    message: str


class CapacityQuotasResponse(BaseModel):
    """Response for capacity quotas endpoint."""

    quotas: List[QuotaUsage] = Field(default_factory=list)
    total: int = 0
    critical_count: int = Field(0, description="Quotas at >90% usage")
    warning_count: int = Field(0, description="Quotas at >75% usage")
    live: bool = False
    source: str = "service-quotas"
    note: Optional[str] = None


class CapacityAlertsResponse(BaseModel):
    """Response for capacity alerts endpoint."""

    alerts: List[QuotaAlert] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "computed"
    note: Optional[str] = None


# ============================================================================
# SSM Fleet Manager Models (READ-ONLY)
# ============================================================================
#
# These models back the read-only Systems Manager Fleet Manager view:
# managed instances, the document/runbook catalog, and command history.
# No execution (SendCommand / StartAutomationExecution) is modeled or exposed.


class SsmManagedInstance(BaseModel):
    """A Systems Manager managed instance (read-only)."""

    instance_id: str
    name: Optional[str] = None
    ping_status: str = "Unknown"
    platform_type: Optional[str] = None
    platform_name: Optional[str] = None
    agent_version: Optional[str] = None
    ip_address: Optional[str] = None
    resource_type: Optional[str] = None
    last_ping_at: Optional[datetime] = None


class SsmManagedInstancesResponse(BaseModel):
    """Response for the SSM managed-instance fleet endpoint."""

    instances: List[SsmManagedInstance] = Field(default_factory=list)
    total: int = 0
    online_count: int = 0
    live: bool = False
    source: str = "ssm"
    note: Optional[str] = None


class SsmRunbookDoc(BaseModel):
    """A Systems Manager document (Command or Automation runbook), read-only."""

    name: str
    document_type: str
    document_format: Optional[str] = None
    owner: Optional[str] = None
    platform_types: List[str] = Field(default_factory=list)
    target_type: Optional[str] = None
    default_version: Optional[str] = None


class SsmRunbooksResponse(BaseModel):
    """Response for the SSM document / runbook catalog endpoint."""

    runbooks: List[SsmRunbookDoc] = Field(default_factory=list)
    total: int = 0
    command_count: int = 0
    automation_count: int = 0
    live: bool = False
    source: str = "ssm"
    note: Optional[str] = None


class SsmCommandRecord(BaseModel):
    """A Systems Manager Run Command execution record (read-only history)."""

    command_id: str
    document_name: str
    status: str
    targets_count: int = 0
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    comment: Optional[str] = None
    error_count: Optional[int] = None


class SsmCommandHistoryResponse(BaseModel):
    """Response for the SSM command-history endpoint."""

    commands: List[SsmCommandRecord] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "ssm"
    note: Optional[str] = None
