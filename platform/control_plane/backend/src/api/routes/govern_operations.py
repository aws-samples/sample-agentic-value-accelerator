"""Govern Operations - API routes for the Operations Hub.

Live operations data for fleet health, incidents, alerts, SLAs, on-call,
changes, metrics, and capacity monitoring.

Sources: CloudWatch, Service Quotas, DynamoDB, PagerDuty (optional).
Follows the Govern route pattern: lazy service singleton, RBAC, graceful degradation.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from core import region_config, region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_operations import (
    ActiveAlertsResponse,
    AgentDetailResponse,
    AlertRule,
    AlertRuleCreate,
    AlertRulesResponse,
    AlertSilenceCreate,
    CapacityAlertsResponse,
    CapacityQuotasResponse,
    ChangeRecord,
    ChangeRecordCreate,
    ChangesListResponse,
    CurrentOnCallResponse,
    EscalationPoliciesResponse,
    FleetAgentsResponse,
    FleetStatusResponse,
    Incident,
    IncidentCreate,
    IncidentResponse,
    IncidentsListResponse,
    IncidentUpdate,
    MetricsSummaryResponse,
    MetricsTrendsResponse,
    OnCallScheduleResponse,
    PendingChangesResponse,
    SLABreach,
    SLABreachesResponse,
    SLABreachResolve,
    SLAComplianceReportResponse,
    SLADetailResponse,
    SLAErrorBudgetsResponse,
    SLAListResponse,
    SLATarget,
    SLATargetCreate,
    SsmCommandHistoryResponse,
    SsmManagedInstancesResponse,
    SsmRunbooksResponse,
    TimelineEvent,
    TimelineEventCreate,
)
from services.govern_operations_service import (
    # The write-path envelopes (Alert/AlertSilence plus the live/source/note triple) are
    # defined in the service module, not models/govern_operations.py. Importing them from
    # here is the documented interim: relocating them means deleting class definitions
    # from the service and editing its import block, which is a separate change.
    AlertAckResult,
    AlertSilenceResult,
    AlertSilencesResponse,
    GovernOperationsService,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/operations", tags=["govern-operations"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_operations", region_scope.SINGLE_REGION, prefix="/govern/operations")

_svc: Optional[GovernOperationsService] = None


def get_service() -> GovernOperationsService:
    """Lazy singleton for the Operations service."""
    global _svc
    if _svc is None:
        # table_region("GOVERN_OPERATIONS"), not settings.AWS_REGION. Those resolve to the
        # same string today only because no override is set; passing AWS_REGION directly
        # means GOVERN_OPERATIONS_TABLE_REGION and CONTROL_PLANE_TABLE_REGION are silently
        # ignored on this one path, while every sibling Govern route (govern_audit,
        # govern_compliance, govern_cost) honours them. A relocation knob that works for
        # 3 of 4 stores is worse than none: it would move the others and leave incidents
        # reading an empty table in the old region, with no error to notice.
        #
        # `region` is the incidents TABLE's home (tier 1). `govern_region` is the governed
        # fleet's (tier 2) — Bedrock/AgentCore inventory and their CloudWatch metrics. They
        # are us-east-2 and us-east-1 in the demo account and must not be collapsed.
        _svc = GovernOperationsService(
            table_name=settings.GOVERN_OPERATIONS_TABLE_NAME,
            region=region_config.table_region("GOVERN_OPERATIONS"),
            govern_region=settings.GOVERN_AWS_REGION,
        )
    return _svc


# =============================================================================
# Fleet Health Endpoints
# =============================================================================


@router.get("/fleet/status", response_model=FleetStatusResponse)
async def get_fleet_status(_=Depends(require_role(Role.VIEWER))):
    """Get aggregated fleet health status.

    Returns summary counts of healthy, degraded, and down agents with
    overall health percentage. Data sourced from Bedrock Agents and
    AgentCore runtimes with CloudWatch metrics for health scoring.
    """
    return get_service().get_fleet_status()


@router.get("/fleet/agents", response_model=FleetAgentsResponse)
async def get_fleet_agents(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=200, description="Items per page"),
    status: Optional[str] = Query(
        default=None,
        description="Filter by status: healthy | degraded | down | unknown",
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """List all agents with health metrics.

    Paginated list of agents with latency, error rate, and health scores.
    Pull from Bedrock Agents, AgentCore runtimes, and CloudWatch metrics.
    """
    return get_service().get_fleet_agents(page=page, page_size=page_size, status_filter=status)


@router.get("/fleet/agents/{agent_id}", response_model=AgentDetailResponse)
async def get_agent_detail(agent_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get detailed health information for a single agent.

    Includes health metrics, recent incidents, and recent alerts
    affecting this agent.
    """
    result = get_service().get_agent_detail(agent_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    return result


# =============================================================================
# Incidents Endpoints
# =============================================================================


@router.get("/incidents", response_model=IncidentsListResponse)
async def list_incidents(
    status: Optional[str] = Query(
        default=None,
        description="Filter by status: open | investigating | identified | monitoring | resolved",
    ),
    severity: Optional[str] = Query(
        default=None, description="Filter by severity: sev1 | sev2 | sev3 | sev4"
    ),
    days: int = Query(default=30, ge=1, le=365, description="Trailing days to include"),
    limit: int = Query(default=50, ge=1, le=200, description="Items per page"),
    page: int = Query(default=1, ge=1, description="Page number"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List incidents with filters.

    Returns incidents with MTTR/MTTD calculations. Stored in the DynamoDB table named by
    `GOVERN_OPERATIONS_TABLE_NAME` (default `fsi-control-plane-govern-operations`), in the
    region resolved by `region_config.table_region("GOVERN_OPERATIONS")`. The response
    carries `live`/`source`/`note`: `source="memory"` means a DynamoDB call failed earlier
    in this process and incidents are NOT being persisted.
    """
    return get_service().list_incidents(
        status=status, severity=severity, days=days, limit=limit, page=page
    )


@router.post("/incidents", response_model=Incident, status_code=201)
async def create_incident(
    req: IncidentCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create a new incident.

    Requires OPERATOR role. Creates incident record with initial timeline
    event and calculates detection time if available. Records the caller from the
    `x-user-email` header, or `"unknown"` when absent - `require_role` returns only
    a Role, never a principal.
    """
    # created_by="user" read like a real principal, so nobody went looking for the
    # missing attribution and every incident in the table shared one author. Same
    # header core/rbac.py:88 reads to decide the role. See acknowledge_alert below.
    return get_service().create_incident(req, created_by=x_user_email or "unknown")


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get incident detail with full timeline.

    Returns the complete incident record including all timeline events
    and computed MTTR/MTTD if resolved.
    """
    result = get_service().get_incident(incident_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return result


@router.patch("/incidents/{incident_id}", response_model=Incident)
async def update_incident(
    incident_id: str,
    update: IncidentUpdate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Update an incident.

    Requires OPERATOR role. Status changes are automatically logged
    to the timeline. Resolution updates calculate TTR. Records the caller from the
    `x-user-email` header, or `"unknown"` when absent.
    """
    result = get_service().update_incident(
        incident_id, update, updated_by=x_user_email or "unknown"
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return result


@router.post("/incidents/{incident_id}/timeline", response_model=TimelineEvent, status_code=201)
async def add_timeline_event(
    incident_id: str, event: TimelineEventCreate, _=Depends(require_role(Role.OPERATOR))
):
    """Add a timeline event to an incident.

    Requires OPERATOR role. Use for notes, actions, or escalations
    during incident response.
    """
    result = get_service().add_timeline_event(incident_id, event)
    if not result:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return result


# =============================================================================
# Alerts Endpoints
# =============================================================================


@router.get("/alerts/active", response_model=ActiveAlertsResponse)
async def get_active_alerts(_=Depends(require_role(Role.VIEWER))):
    """Get active CloudWatch alarms.

    Returns alarms in ALARM state from CloudWatch. Silenced alerts
    are marked with their silence expiration.
    """
    return get_service().get_active_alerts()


@router.get("/alerts/rules", response_model=AlertRulesResponse)
async def get_alert_rules(_=Depends(require_role(Role.VIEWER))):
    """Get custom alert rules.

    Returns alert rules stored in DynamoDB. These are custom rules
    beyond the default CloudWatch alarms.
    """
    return get_service().get_alert_rules()


@router.post("/alerts/rules", response_model=AlertRule, status_code=201)
async def create_alert_rule(req: AlertRuleCreate, _=Depends(require_role(Role.ADMIN))):
    """Create a custom alert rule.

    Requires ADMIN role. Creates a rule definition that can be used
    to create CloudWatch alarms or custom alerting logic.
    """
    return get_service().create_alert_rule(req)


# response_model is AlertAckResult, not Alert. AlertAckResult subclasses Alert, and
# FastAPI serializes a response through the DECLARED model: with Alert declared, the
# live/source/note triple the service computes was filtered out silently - no error, no
# warning - so an acknowledgement held in a dict that dies on the next restart arrived
# at the browser byte-identical to one durably written to DynamoDB, and a failed write
# rendered as a success.
@router.patch("/alerts/{alert_id}/acknowledge", response_model=AlertAckResult)
async def acknowledge_alert(
    alert_id: str,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Acknowledge an alert.

    Requires OPERATOR role. Records the caller from the `x-user-email` header, or
    `"unknown"` when absent - `require_role` returns only a Role, never a principal.

    `live`/`source`/`note` describe where the ACKNOWLEDGEMENT was stored, not the alarm:
    `source="dynamodb"` means the ack row is durable, `source="memory"` means the write
    failed and it will be lost on restart. CloudWatch is never modified either way.
    """
    result = get_service().acknowledge_alert(
        # Not the literal "user". An audit row reading acknowledged_by="user" looks like a
        # real identity, so it is worse than an obvious "unknown": nobody goes looking for
        # the missing attribution. x-user-email is the same header core/rbac.py reads to
        # decide the role, and the idiom every other actor-recording route uses
        # (api/routes/approval_requests.py, agents.py, a2a.py, govern_aidlc.py).
        alert_id,
        acknowledged_by=x_user_email or "unknown",
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return result


@router.get("/alerts/silences", response_model=AlertSilencesResponse)
async def list_silences(
    include_expired: bool = Query(
        default=False, description="Include silences whose window has already ended"
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """List stored alert silences (active only by default).

    `active_count` always counts the unexpired silences regardless of `include_expired`,
    so a caller showing history still knows how many are in force. `live=False` with
    `source="memory"` means the table read failed and only silences created in this
    process are listed - the list may be incomplete, not empty.
    """
    return get_service().list_silences(include_expired=include_expired)


# DELETE, matching govern_conformance / govern_enforcement / govern_a2a_trust, which all
# use delete-and-return-the-object. It ends the silence; it does not remove the row. The
# stored sort key embeds the ORIGINAL end time, so the service rewrites ends_at in place
# rather than delete-then-put, which would leave a window where the silence is in neither
# state. The returned record with ends_at in the past is what reports the outcome.
@router.delete("/alerts/silences/{silence_id}", response_model=AlertSilenceResult)
async def expire_silence(silence_id: str, _=Depends(require_role(Role.OPERATOR))):
    """End an alert silence now.

    Requires OPERATOR role. Idempotent: expiring an already-expired silence returns that
    record rather than 404, since its end time is already in the past. 404 is reserved
    for a `silence_id` that is not stored at all.

    `live=False` means the expiry was applied in memory only, so the silence comes back
    on restart if its original row is still in DynamoDB.
    """
    result = get_service().expire_silence(silence_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Alert silence {silence_id} not found")
    return result


# Also widened from AlertSilence to AlertSilenceResult - same silent-filtering mechanism
# as the acknowledge route above.
@router.post("/alerts/silences", response_model=AlertSilenceResult, status_code=201)
async def create_silence(
    req: AlertSilenceCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create an alert silence.

    Requires OPERATOR role. Silences matching alarms for the specified
    duration (max 7 days). Uses glob patterns for alarm name matching.

    Records the caller from the `x-user-email` header, exactly like `create_incident` and
    the acknowledge routes above. The header WINS over `req.created_by`: the header is what
    core/rbac.py:88 acts on to decide the role, while a body field is only data the caller
    typed, so a caller that sends a header can never attribute a paging suppression to
    somebody else. `req.created_by` is a fallback for header-less server-to-server callers,
    and `"unknown"` when neither is present.

    `source="memory"` in the response means the silence was NOT persisted: it applies to
    this process only and is lost on restart. The CloudWatch alarms keep evaluating and
    their own actions (SNS, paging) are untouched in every case - this suppresses the
    alarm inside AVA, it does not disable it at AWS.
    """
    # This route used to read created_by straight off the body while its siblings read the
    # header, so the same screen in the same session attributed two writes two different
    # ways - and a body value silently overrode the identity RBAC had just authorized.
    return get_service().create_silence(
        req, created_by=x_user_email or req.created_by or "unknown"
    )


# =============================================================================
# SLA Endpoints
# =============================================================================


@router.get("/sla", response_model=SLAListResponse)
async def list_slas(_=Depends(require_role(Role.VIEWER))):
    """List SLAs with compliance status.

    Returns all SLA targets with current compliance computed from
    CloudWatch metrics. Includes error budget remaining.
    """
    return get_service().list_slas()


@router.get("/sla/breaches", response_model=SLABreachesResponse)
async def get_sla_breaches(
    days: int = Query(default=30, ge=1, le=365, description="Trailing days to include"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get active and recent SLA breaches.

    Returns breach records with root cause and remediation notes
    if available.
    """
    return get_service().get_sla_breaches(days=days)


@router.get("/sla/compliance", response_model=SLAComplianceReportResponse)
async def get_sla_compliance_report(
    days: int = Query(default=30, ge=1, le=365, description="Report period in days"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get SLA compliance report.

    Summary report of all SLAs with overall compliance percentage,
    total breaches, and average error budget remaining.
    """
    return get_service().get_sla_compliance_report(days=days)


@router.get("/sla/error-budgets", response_model=SLAErrorBudgetsResponse)
async def get_sla_error_budgets(_=Depends(require_role(Role.VIEWER))):
    """Get error-budget position per SLA.

    Surfaces the error budget already computed by the SLA compliance
    calculation. Budget minutes are only returned for availability SLAs;
    burn-rate trend and burn-down history need a historical store that does
    not exist yet and are returned unset rather than invented.
    """
    return get_service().get_sla_error_budgets()


@router.post("/sla", response_model=SLATarget, status_code=201)
async def create_sla(req: SLATargetCreate, _=Depends(require_role(Role.ADMIN))):
    """Create an SLA target definition.

    Requires ADMIN role (SLA targets are governance definitions, like alert
    rules). Persisted to the operations DynamoDB table under the SLA partition.
    """
    return get_service().create_sla(req)


@router.patch("/sla/breaches/{breach_id}/acknowledge", response_model=SLABreach)
async def acknowledge_sla_breach(
    breach_id: str,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Acknowledge an SLA breach.

    Requires OPERATOR role. Records the caller from `x-user-email`, or `"unknown"` when
    the header is absent - same attribution as the alert acknowledgement above.
    """
    result = get_service().acknowledge_sla_breach(
        breach_id, acknowledged_by=x_user_email or "unknown"
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"SLA breach {breach_id} not found")
    return result


@router.patch("/sla/breaches/{breach_id}/resolve", response_model=SLABreach)
async def resolve_sla_breach(
    breach_id: str, req: SLABreachResolve, _=Depends(require_role(Role.OPERATOR))
):
    """Resolve an SLA breach.

    Requires OPERATOR role. Sets the breach end time and stores the
    resolution notes as remediation.
    """
    result = get_service().resolve_sla_breach(breach_id, resolution_notes=req.resolution_notes)
    if not result:
        raise HTTPException(status_code=404, detail=f"SLA breach {breach_id} not found")
    return result


@router.get("/sla/{sla_id}", response_model=SLADetailResponse)
async def get_sla_detail(sla_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get SLA detail.

    Full SLA definition with current compliance status, recent
    breaches, and historical compliance trend.
    """
    result = get_service().get_sla_detail(sla_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"SLA {sla_id} not found")
    return result


# =============================================================================
# On-Call Endpoints
# =============================================================================


@router.get("/oncall/current", response_model=CurrentOnCallResponse)
async def get_current_oncall(_=Depends(require_role(Role.VIEWER))):
    """Get current on-call personnel.

    Returns primary and secondary on-call with shift end time.
    Integrates with PagerDuty if PAGERDUTY_API_KEY is configured,
    otherwise falls back to DynamoDB schedule.
    """
    return get_service().get_current_oncall()


@router.get("/oncall/schedule", response_model=OnCallScheduleResponse)
async def get_oncall_schedule(
    weeks: int = Query(default=1, ge=1, le=4, description="Weeks to include"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get weekly on-call schedule.

    Returns shifts for the specified number of weeks with
    override information.
    """
    return get_service().get_oncall_schedule(weeks=weeks)


@router.get("/oncall/policies", response_model=EscalationPoliciesResponse)
async def get_escalation_policies(_=Depends(require_role(Role.VIEWER))):
    """Get escalation policies.

    Returns configured escalation policies with level definitions
    and timeout settings.
    """
    return get_service().get_escalation_policies()


# =============================================================================
# Changes Endpoints
# =============================================================================


@router.get("/changes", response_model=ChangesListResponse)
async def list_changes(
    days: int = Query(default=30, ge=1, le=365, description="Trailing days to include"),
    limit: int = Query(default=50, ge=1, le=200, description="Items per page"),
    page: int = Query(default=1, ge=1, description="Page number"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get change log.

    Returns change records for deployments, config changes, and
    infrastructure modifications.
    """
    return get_service().list_changes(days=days, limit=limit, page=page)


@router.post("/changes", response_model=ChangeRecord, status_code=201)
async def create_change(req: ChangeRecordCreate, _=Depends(require_role(Role.OPERATOR))):
    """Create a change record.

    Requires OPERATOR role. Records a planned or completed change
    for audit trail and change correlation.
    """
    return get_service().create_change(req)


@router.get("/changes/pending", response_model=PendingChangesResponse)
async def get_pending_changes(_=Depends(require_role(Role.VIEWER))):
    """Get pending change approvals.

    Returns changes awaiting approval, sorted by request time.
    """
    return get_service().get_pending_changes()


# =============================================================================
# Metrics Endpoints
# =============================================================================


@router.get("/metrics/summary", response_model=MetricsSummaryResponse)
async def get_metrics_summary(_=Depends(require_role(Role.VIEWER))):
    """Get key operations metrics.

    Returns MTTR, MTTD, CFR (Change Failure Rate), availability,
    and counts for the trailing 30 days.
    """
    return get_service().get_metrics_summary()


@router.get("/metrics/trends", response_model=MetricsTrendsResponse)
async def get_metrics_trends(
    days: int = Query(default=30, ge=7, le=90, description="Trailing days for trend"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get historical metric trends.

    Returns trend data for incident count and MTTR over the
    specified period.
    """
    return get_service().get_metrics_trends(days=days)


# =============================================================================
# Capacity Endpoints
# =============================================================================


@router.get("/capacity/quotas", response_model=CapacityQuotasResponse)
async def get_capacity_quotas(
    service_code: str = Query(
        default="bedrock", description="AWS service code: bedrock | sagemaker | lambda | etc."
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get service quotas with current usage.

    Returns quota limits and current usage from Service Quotas API
    and CloudWatch metrics.
    """
    return get_service().get_capacity_quotas(service_code=service_code)


@router.get("/capacity/alerts", response_model=CapacityAlertsResponse)
async def get_capacity_alerts(
    threshold_pct: float = Query(
        default=75.0, ge=50.0, le=100.0, description="Alert threshold percentage"
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get quota alerts.

    Returns alerts for quotas exceeding the specified usage
    threshold percentage.
    """
    return get_service().get_capacity_alerts(threshold_pct=threshold_pct)


# =============================================================================
# SSM Fleet Manager Endpoints (READ-ONLY)
#
# These endpoints are strictly read-only. They call only describe_instance_
# information, list_documents, and list_commands. No execution APIs
# (SendCommand / StartAutomationExecution / any mutation) are exposed.
# =============================================================================


@router.get("/ssm/managed-instances", response_model=SsmManagedInstancesResponse)
async def get_ssm_managed_instances(_=Depends(require_role(Role.VIEWER))):
    """List Systems Manager managed instances (READ-ONLY).

    Returns the SSM managed-instance fleet from describe_instance_information
    in the govern region, including ping status, platform, agent version, and
    last check-in time. No execution APIs are exposed by this endpoint.
    """
    return get_service().get_ssm_managed_instances()


@router.get("/ssm/runbooks", response_model=SsmRunbooksResponse)
async def get_ssm_runbooks(_=Depends(require_role(Role.VIEWER))):
    """List Systems Manager documents / runbooks (READ-ONLY).

    Returns Command and Automation documents (Self + Amazon owned) from
    list_documents, with command/automation counts. This is a catalog view
    only; running a document is not exposed.
    """
    return get_service().get_ssm_runbooks()


@router.get("/ssm/command-history", response_model=SsmCommandHistoryResponse)
async def get_ssm_command_history(
    days: int = Query(default=7, ge=1, le=90, description="Trailing days of command history"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get Systems Manager Run Command execution history (READ-ONLY).

    Returns past command invocations from list_commands over the trailing
    window. History only; issuing new commands is not exposed.
    """
    return get_service().get_ssm_command_history(days=days)
