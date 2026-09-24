"""Govern Operations service - live operations data from AWS + DynamoDB.

Provides fleet health monitoring, incident management, alerts, SLAs, on-call,
change tracking, metrics, and capacity monitoring.

Sources:
  - CloudWatch: Agent metrics, alarms, fleet health
  - Service Quotas: Capacity/quota usage
  - DynamoDB: Incidents, alert rules, SLAs, changes, on-call schedule
  - PagerDuty API: On-call (optional, with DynamoDB fallback)

Follows the Govern service pattern: lazy clients, TTL caching, graceful
degradation with live/source/note flags.
"""

from __future__ import annotations

import calendar
import fnmatch
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core import safe_fetch
from core.safe_fetch import SafeFetchError
from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load, invalidate, invalidate_prefix
from models.govern_operations import (
    ActiveAlertsResponse,
    AgentDetailResponse,
    AgentHealthMetrics,
    AgentHealthRecord,
    AgentHealthStatus,
    Alert,
    AlertRule,
    AlertRuleCreate,
    AlertRulesResponse,
    AlertSeverity,
    AlertSilence,
    AlertSilenceCreate,
    AlertState,
    CapacityAlertsResponse,
    CapacityQuotasResponse,
    ChangeRecord,
    ChangeRecordCreate,
    ChangesListResponse,
    ChangeStatus,
    CurrentOnCallResponse,
    EscalationPoliciesResponse,
    EscalationPolicy,
    FleetAgentsResponse,
    FleetStatusResponse,
    FleetStatusSummary,
    Incident,
    IncidentCreate,
    IncidentResponse,
    # IncidentSeverity was used by the severity filter in _fetch_incidents but never
    # imported, so GET /govern/operations/incidents?severity=... raised NameError -
    # which the surrounding `except ValueError` does not catch - and 500'd.
    IncidentSeverity,
    IncidentsListResponse,
    IncidentStatus,
    IncidentUpdate,
    MetricsSummaryResponse,
    MetricsTrend,
    MetricsTrendPoint,
    MetricsTrendsResponse,
    OnCallPerson,
    OnCallScheduleResponse,
    OnCallShift,
    OperationsMetricsSummary,
    PendingChangesResponse,
    QuotaAlert,
    QuotaUsage,
    SLABreach,
    SLABreachesResponse,
    SLACompliance,
    SLAComplianceReportResponse,
    SLADetailResponse,
    SLAErrorBudget,
    SLAErrorBudgetsResponse,
    SLAListResponse,
    SLAStatus,
    SLATarget,
    SLATargetCreate,
    SsmCommandHistoryResponse,
    SsmCommandRecord,
    SsmManagedInstance,
    SsmManagedInstancesResponse,
    SsmRunbookDoc,
    SsmRunbooksResponse,
    TimelineEvent,
    TimelineEventCreate,
)

logger = logging.getLogger(__name__)

# Cache TTLs
_TTL_FLEET = 60  # Fleet health changes frequently
_TTL_INCIDENTS = 30  # Incidents need quick updates
_TTL_ALERTS = 30  # Alerts are time-sensitive
_TTL_SLAS = 300  # SLAs computed periodically
_TTL_ONCALL = 300  # On-call changes less frequently
_TTL_CHANGES = 60  # Changes moderate frequency
_TTL_METRICS = 300  # Metrics computed periodically
_TTL_CAPACITY = 300  # Quotas change slowly
_TTL_SSM = 60  # SSM fleet/command state changes moderately
_TTL_SSM_DOCS = 300  # SSM document catalog changes slowly

# How long a failed DynamoDB call keeps this service on its in-memory arm before the
# next call is allowed to re-probe the table. Both extremes are wrong, which is why
# there is a constant here at all:
#
#   0s (re-probe every request) turns one bad config into a latency storm. Against a
#   table that is genuinely absent or denied, every read and write pays a boto3 round
#   trip plus botocore's retries before failing, on the hot path, forever.
#
#   Infinity (the previous behaviour: a one-way latch, set False and never reset) means
#   a single throttle or network blip pins the whole process to the in-memory arm until
#   restart. That flag is shared by every partition on this table, so one failed SLA
#   write silently stopped incidents from persisting AND made the incidents endpoint
#   report the store as unreachable while it was healthy.
#
# 60s bounds the outage to roughly one cache TTL's worth of requests while capping the
# cost of a genuinely-absent table at about one failed call per minute.
_TABLE_RETRY_COOLDOWN_SECONDS = 60

# Why no SLA in this system has a measured current value, shared by every response that
# would otherwise have to invent one. See _compute_sla_compliance for the archaeology.
#
# One constant rather than a per-metric_type reason because the reason is currently
# identical for all four metric types SLATarget declares (availability, latency,
# error_rate, throughput): none of them is sampled anywhere. If a real measurement is
# wired for one type later, _compute_sla_compliance returns a value for that type and
# the callers stop appending this text for it - the arms are already split that way.
_SLA_NO_MEASUREMENT_NOTE = (
    "SLA compliance is not measured anywhere in this system yet. An SLA target names a "
    "metric_type and a target_value, but nothing samples the target population over the "
    "declared measurement window: SLATarget.services / SLATarget.agents have no mapping "
    "to CloudWatch dimensions and no writer populates them, and the only agent metrics "
    "this service reads (_get_agent_metrics) are a fixed 24h snapshot keyed by AgentId, "
    "which cannot answer a monthly or weekly window. Until that sampling exists these "
    "SLAs are definitions with no measurement attached, and are reported as unevaluated "
    "rather than being filled with a plausible value."
)

# Forward-progress guard on the Query paging loop in _query_read. With `Limit` set to the
# remaining ceiling on every page, a non-empty page always advances, so the item ceiling
# already bounds the page count; this only exists so a pathological empty-page-with-a-key
# response cannot spin. Hitting it is reported as a truncated read, never as a complete one.
_MAX_QUERY_PAGES = 50

# Ceiling for the scan-by-id lookups that have no usable sort key to address directly
# (`get_incident`: sk is "{created_at}#{id}", so the id alone cannot build a Key). Higher
# than the display ceilings because a miss here is not a smaller list - it is a 404 for a
# record that exists, and update/resolve both route through it.
_MAX_LOOKUP_SCAN = 5000


class _StoreRead(NamedTuple):
    """One DynamoDB partition read, keeping empty / truncated / failed distinguishable.

    `_query_items` answered all three with a bare `[]`, so every caller had to guess which
    had happened - and the guess they all made, `live = len(items) > 0`, picked wrong for
    two of the three. See _store_provenance.
    """

    items: List[dict]
    failed: bool = False
    truncated: bool = False

    @property
    def complete(self) -> bool:
        """True only when the whole partition was read, so a count of it is a real total."""
        return not self.failed and not self.truncated


def _to_ddb(value: Any) -> Any:
    """Convert Python types to DynamoDB-compatible types."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value: Any) -> Any:
    """Convert DynamoDB types back to Python types."""
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


def _parse_datetime(value: Any) -> Optional[datetime]:
    """Parse datetime from various formats."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(value[:26].rstrip("Z"), fmt.replace("%z", ""))
            except ValueError:
                continue
    return None


# =============================================================================
# Write-path result envelopes
#
# These carry the live/source/note triple back from the alert mutations, so a
# caller can tell "written to DynamoDB" from "held in a dict that dies on the next
# restart". They live here rather than in models/govern_operations.py only because
# that module is owned elsewhere in this change; moving them there later is a pure
# relocation (nothing but the import path changes).
#
# AlertAckResult/AlertSilenceResult SUBCLASS the models the existing routes already
# declare as response_model. That is deliberate: until those routes are widened,
# FastAPI serializes these down to Alert/AlertSilence and the endpoints keep
# working (the triple is simply dropped) instead of 500-ing on a shape mismatch
# mid-rollout.
# =============================================================================


class AlertAckResult(Alert):
    """An acknowledged alert, plus where the acknowledgement was actually stored.

    `live=True` here means one specific thing: the acknowledgement was durably
    written to the operations DynamoDB table. It is NOT a claim about the CloudWatch
    alarm, which is never modified - see acknowledge_alert().
    """

    live: bool = False
    source: str = Field("memory", description="dynamodb | memory | not-configured")
    note: Optional[str] = None


class AlertSilenceResult(AlertSilence):
    """A silence, plus where it was actually stored. `live=True` means persisted."""

    live: bool = False
    source: str = Field("memory", description="dynamodb | memory | not-configured")
    note: Optional[str] = None


class AlertSilencesResponse(BaseModel):
    """Stored alert silences with provenance."""

    silences: List[AlertSilence] = Field(default_factory=list)
    total: int = 0
    active_count: int = 0
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class GovernOperationsService:
    """Service for Operations Hub data."""

    # DynamoDB partition keys
    PK_INCIDENT = "INCIDENT"
    PK_ALERT_RULE = "ALERT_RULE"
    PK_ALERT_SILENCE = "ALERT_SILENCE"
    PK_ALERT_ACK = "ALERT_ACK"
    PK_SLA = "SLA"
    PK_SLA_BREACH = "SLA_BREACH"
    PK_ONCALL = "ONCALL"
    PK_ONCALL_POLICY = "ONCALL_POLICY"
    PK_CHANGE = "CHANGE"

    def __init__(
        self,
        table_name: str,
        region: str = "us-east-1",
        govern_region: Optional[str] = None,
        pagerduty_api_key: Optional[str] = None,
    ):
        self.table_name = table_name
        self.region = region
        # Region where the governed fleet lives (SSM managed instances,
        # documents, and command history). Falls back to `region` when unset.
        self.govern_region = govern_region or region
        self.pagerduty_api_key = pagerduty_api_key or os.getenv("PAGERDUTY_API_KEY")

        # Lazy clients
        self._dynamodb = None
        self._table = None
        self._cloudwatch = None
        self._service_quotas = None
        self._bedrock_agent = None
        self._agentcore = None
        self._ssm_client = None

        # In-memory fallback when DynamoDB not configured
        self._mem_incidents: List[Incident] = []
        self._mem_alert_rules: List[AlertRule] = []
        self._mem_silences: List[AlertSilence] = []
        self._mem_slas: List[SLATarget] = []
        self._mem_breaches: List[SLABreach] = []
        self._mem_oncall_schedule: List[OnCallShift] = []
        self._mem_policies: List[EscalationPolicy] = []
        self._mem_changes: List[ChangeRecord] = []
        # Alarm-key -> acknowledgement record, used only when the table write failed.
        self._mem_alert_acks: Dict[str, dict] = {}
        # Tri-state health of the operations table: None=not tried, True=last call
        # succeeded, False=last call failed. Paired with _table_failed_at so False
        # decays after _TABLE_RETRY_COOLDOWN_SECONDS instead of latching for the
        # process lifetime.
        self._table_ok: Optional[bool] = None
        self._table_failed_at: Optional[float] = None

    # =========================================================================
    # Lazy AWS Clients
    # =========================================================================

    def _ddb(self):
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb", region_name=self.region)
        return self._dynamodb

    def _get_table(self):
        if self._table is None and self.table_name:
            self._table = self._ddb().Table(self.table_name)
        return self._table

    # The four clients below talk to the GOVERNED fleet, not to the control plane, so they
    # belong in govern_region alongside _ssm(). They used to be built from self.region - the
    # region of the incidents TABLE - which is the same one-field-two-meanings bug fixed in
    # GovernComplianceService and GovernCostService. It failed silently rather than loudly:
    # list_agents against us-east-2 succeeds and returns the 1 agent that happens to live
    # there instead of us-east-1's 17 (7 Bedrock agents + 10 AgentCore runtimes, measured),
    # so the Operations Hub reported a 1-agent fleet under live=True, and every CloudWatch
    # health metric was read from a region with no datapoints and scored as healthy silence.
    def _cw(self):
        if self._cloudwatch is None:
            self._cloudwatch = boto3.client("cloudwatch", region_name=self.govern_region)
        return self._cloudwatch

    def _sq(self):
        if self._service_quotas is None:
            self._service_quotas = boto3.client("service-quotas", region_name=self.govern_region)
        return self._service_quotas

    def _bedrock_agent_client(self):
        if self._bedrock_agent is None:
            self._bedrock_agent = boto3.client("bedrock-agent", region_name=self.govern_region)
        return self._bedrock_agent

    def _agentcore_client(self):
        if self._agentcore is None:
            self._agentcore = boto3.client("bedrock-agentcore-control", region_name=self.govern_region)
        return self._agentcore

    def _ssm(self):
        # SSM managed instances / documents / commands live in the govern
        # region, which may differ from the control-plane region.
        if self._ssm_client is None:
            self._ssm_client = boto3.client("ssm", region_name=self.govern_region)
        return self._ssm_client

    # =========================================================================
    # DynamoDB Helpers
    # =========================================================================

    def _table_available(self) -> bool:
        """Whether a DynamoDB call should be attempted right now.

        False only for an unconfigured table, or for the cool-off window after a
        failure. Once _TABLE_RETRY_COOLDOWN_SECONDS has elapsed this returns True
        again so the next caller re-probes: a throttle, a brief network partition, or
        a table created after the process started all recover on their own instead of
        needing a restart. Uses monotonic time so an NTP step cannot extend or skip
        the cool-off.
        """
        if not self.table_name:
            return False
        if self._table_ok is not False:
            return True
        if self._table_failed_at is None:
            return True
        return (time.monotonic() - self._table_failed_at) >= _TABLE_RETRY_COOLDOWN_SECONDS

    def _mark_table_ok(self) -> None:
        """Record that the table answered - clears any pending cool-off."""
        self._table_ok = True
        self._table_failed_at = None

    def _mark_table_failed(self) -> None:
        """Record a failure and start the cool-off before the next probe."""
        self._table_ok = False
        self._table_failed_at = time.monotonic()

    def _put_item(self, item: dict) -> bool:
        """Put item to DynamoDB, returns True on success."""
        if not self._table_available():
            return False
        try:
            self._get_table().put_item(Item=_to_ddb(item))
            self._mark_table_ok()
            return True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"DynamoDB put_item failed: {e}")
            self._mark_table_failed()
            return False

    def _query_read(
        self, pk: str, sk_prefix: Optional[str] = None, max_items: int = 1000
    ) -> _StoreRead:
        """Read a partition, paging until `max_items` or the partition is exhausted.

        DynamoDB's `Limit` is a cap on how much ONE Query request reads, not on the result
        set. A Query that hits it comes back with `LastEvaluatedKey` set and the rest of the
        partition simply absent. The previous single-shot version passed `Limit=limit` and
        dropped `LastEvaluatedKey` on the floor, so every caller that renders
        `total=len(items)` was publishing a page size as a total - the DynamoDB form of the
        capped-read bug fixed across the AWS reads this round. DynamoDB also cuts a page
        short at 1 MB regardless of `Limit`, so this could truncate well below the caller's
        own ceiling with nothing saying so.

        `max_items` is still honoured - these are display lists, and a ceiling on them is a
        deliberate bound rather than a defect. What changed is that reaching it now sets
        `truncated`, so the caller can say the number is a floor instead of asserting it as
        a total.

        Each page asks for one item MORE than the ceiling allows. That extra row is what
        makes `truncated` exact: without it, a partition holding exactly `max_items` rows
        comes back with a `LastEvaluatedKey` (DynamoDB sets one whenever it stopped on
        `Limit`, even when the next page would be empty) and would be reported as a floor
        when the count is in fact a complete total. A caveat that does not apply is its own
        kind of dishonesty, and an unfalsifiable one.
        """
        if not self._table_available():
            # Unconfigured, or inside the post-failure cool-off. Either way no call was made,
            # so this is not a fact about the partition. `failed` keeps it from being read as
            # an empty one; _store_provenance splits the two causes apart.
            return _StoreRead(items=[], failed=True)

        items: List[dict] = []
        start_key: Optional[dict] = None
        try:
            for _ in range(_MAX_QUERY_PAGES):
                kwargs: Dict[str, Any] = {
                    "KeyConditionExpression": Key("pk").eq(pk),
                    "ScanIndexForward": False,
                    # Never ask for more than the ceiling plus the one probe row: rows past
                    # it are read capacity paid for and then thrown away.
                    "Limit": max_items - len(items) + 1,
                }
                if sk_prefix:
                    kwargs["KeyConditionExpression"] &= Key("sk").begins_with(sk_prefix)
                if start_key:
                    kwargs["ExclusiveStartKey"] = start_key
                resp = self._get_table().query(**kwargs)
                items.extend(_from_ddb(item) for item in resp.get("Items", []))
                start_key = resp.get("LastEvaluatedKey")
                if not start_key or len(items) > max_items:
                    break
            self._mark_table_ok()
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"DynamoDB query failed: {e}")
            self._mark_table_failed()
            return _StoreRead(items=[], failed=True)

        # Two ways to be short of the partition: the probe row came back, or the page guard
        # ran out with a key still pending. Both mean the count below is a floor.
        truncated = len(items) > max_items or bool(start_key)
        if truncated:
            logger.info(
                "DynamoDB partition '%s' has more than the %d-row ceiling; count is a floor.",
                pk, max_items,
            )
        return _StoreRead(items=items[:max_items], truncated=truncated)

    def _query_items(self, pk: str, sk_prefix: Optional[str] = None, limit: int = 1000) -> List[dict]:
        """Rows only, for callers that neither publish a count nor report provenance.

        Prefer `_query_read` anywhere the row count or the store's reachability reaches the
        UI: this signature cannot say whether `[]` is an empty partition, a failed call, or
        a page cap, and the callers that tried to infer it from `len(items)` all got it
        wrong in the same way.
        """
        return self._query_read(pk, sk_prefix, max_items=limit).items

    def _store_provenance(
        self, read: _StoreRead, subject: str, unsaved: str
    ) -> Tuple[str, bool, Optional[str]]:
        """Report (source, live, note) for a store read without collapsing its four outcomes.

        This replaces `live = len(items) > 0`, which folded four states into two and named
        the wrong one for two of them. An empty-but-reachable table was badged live=False /
        source="memory" / note=None - byte-identical to a table that is missing, denied, or
        throttled - and nothing told the reader which had happened. Zero SLA breaches and
        zero pending changes are the DESIRABLE states, so the states most likely to be
        misreported were the healthy ones.

        It also quietly defeated the response cache: `get_or_load(..., should_cache=lambda
        r: r.live)` refuses to cache a live=False payload, so a measured zero re-issued its
        DynamoDB query on every single request for as long as the store stayed empty.

        A measured zero is measured data. `source` and `note` describe emptiness; `live`
        never does.

        The four outcomes, in the order they are tested:
          1. rows returned            -> live=True,  source="dynamodb" (floor note if capped)
          2. no table configured      -> live=False, source="not-configured"
          3. the read failed          -> live=False, source="memory", note names it
          4. read succeeded, 0 rows   -> live=True,  source="dynamodb", note says the zero
                                         is measured, not a failed lookup

        `subject` is the plural noun for the rows ("alert rules"); `unsaved` names what an
        in-memory fallback is holding onto ("Alert rules created now").
        """
        if read.items:
            note = None
            if read.truncated:
                note = (
                    f"Showing the first {len(read.items)} {subject} - the store holds more, "
                    "so this count is a floor rather than a total."
                )
            return "dynamodb", True, note

        # Before `read.failed`, because a missing table name is also why no call was made.
        if not self.table_name:
            return "not-configured", False, (
                "Operations store not configured - set GOVERN_OPERATIONS_TABLE_NAME. "
                f"{unsaved} are held in memory and lost on restart."
            )

        if read.failed:
            # Hedged on the CAUSE, and the hedge is real: _query_read collapses the boto3
            # error to a log line, so this arm genuinely cannot tell a missing table from a
            # denied one from a throttled one. NOT hedged on recovery - the table is
            # re-probed once the cool-off elapses, so a transient failure clears by itself.
            return "memory", False, (
                f"Operations store unreachable - the most recent DynamoDB call against "
                f"'{self.table_name}' in {self.region} failed (commonly: not provisioned in "
                "that region, access denied, or throttling; the error is not distinguished "
                f"here). Re-probed roughly every {_TABLE_RETRY_COOLDOWN_SECONDS}s, so a "
                f"transient failure clears without a restart. {unsaved} are held in memory "
                "and lost on restart."
            )

        return "dynamodb", True, (
            f"No {subject} recorded in the Operations store - a measured zero from a table "
            "that answered, not a failed lookup."
        )

    def _store_rows(
        self, read: _StoreRead, parse, mem: List[Any], subject: str, unsaved: str
    ) -> Tuple[List[Any], str, bool, Optional[str]]:
        """Rows plus provenance for a store-backed list read: (rows, source, live, note).

        Two things this does that no call site should be repeating by hand.

        First, it only substitutes the in-memory list when the read did NOT succeed. The
        obvious-looking `rows = parse(read.items) if read.items else mem.copy()` has a hole
        that the four arms open up: a table that answered with zero rows is live, so an
        unpersisted row sitting in `mem` would have been served under a Live badge - the
        exact defect `live = len(items) > 0` was fixed to remove, reintroduced from the
        other side.

        Second, when the read DID succeed it unions any unpersisted rows in rather than
        choosing between the two lists, following _load_silences and _load_alert_acks. A row
        reaches `mem` only when a `_put_item` failed, so it is real operator action that the
        table does not have. Dropping it the moment the table answers again would make an
        acknowledged breach reappear as new, or a just-created alert rule vanish, with
        nothing saying why. `live` stays True - the read WAS a measurement - and the note
        carries the caveat.
        """
        source, live, note = self._store_provenance(read, subject, unsaved)
        if not live:
            return mem.copy(), source, live, note

        rows: List[Any] = [parse(item) for item in read.items]
        known = {r.id for r in rows}
        unpersisted = [r for r in mem if r.id not in known]
        if unpersisted:
            rows = rows + unpersisted
            caveat = (
                f"{len(unpersisted)} of these {subject} were never written to "
                f"'{self.table_name}' and will be lost on restart."
            )
            note = f"{note} {caveat}" if note else caveat
        return rows, source, live, note

    def _get_item(self, pk: str, sk: str) -> Optional[dict]:
        """Get a single item from DynamoDB."""
        if not self._table_available():
            return None
        try:
            resp = self._get_table().get_item(Key={"pk": pk, "sk": sk})
            self._mark_table_ok()
            item = resp.get("Item")
            return _from_ddb(item) if item else None
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"DynamoDB get_item failed: {e}")
            self._mark_table_failed()
            return None

    def _update_item(self, pk: str, sk: str, updates: dict) -> bool:
        """Update item in DynamoDB, returns True on success."""
        if not self._table_available():
            return False
        try:
            update_expr_parts = []
            expr_values = {}
            expr_names = {}
            for i, (key, value) in enumerate(updates.items()):
                attr_name = f"#attr{i}"
                attr_value = f":val{i}"
                expr_names[attr_name] = key
                expr_values[attr_value] = _to_ddb(value)
                update_expr_parts.append(f"{attr_name} = {attr_value}")

            self._get_table().update_item(
                Key={"pk": pk, "sk": sk},
                UpdateExpression="SET " + ", ".join(update_expr_parts),
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
            self._mark_table_ok()
            return True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"DynamoDB update_item failed: {e}")
            self._mark_table_failed()
            return False

    # =========================================================================
    # Fleet Health
    # =========================================================================

    def get_fleet_status(self) -> FleetStatusResponse:
        """Get aggregated fleet health status."""
        cache_key = f"ops:fleet:status:{self.govern_region}"
        result, cached_at = get_or_load(
            cache_key, _TTL_FLEET, self._fetch_fleet_status, should_cache=lambda r: r.live
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_fleet_status(self) -> FleetStatusResponse:
        """Fetch and aggregate fleet health from AWS APIs."""
        agents, live, source = self._fetch_all_agents_health()

        summary = FleetStatusSummary(
            total=len(agents),
            healthy=sum(1 for a in agents if a.status == AgentHealthStatus.HEALTHY),
            degraded=sum(1 for a in agents if a.status == AgentHealthStatus.DEGRADED),
            down=sum(1 for a in agents if a.status == AgentHealthStatus.DOWN),
            unknown=sum(1 for a in agents if a.status == AgentHealthStatus.UNKNOWN),
        )

        if summary.total > 0:
            summary.pct_healthy = round((summary.healthy / summary.total) * 100, 1)
            summary.avg_health_score = round(sum(a.health_score for a in agents) / summary.total, 1)

        return FleetStatusResponse(
            summary=summary,
            last_updated=datetime.utcnow(),
            live=live,
            source=source,
        )

    def get_fleet_agents(
        self, page: int = 1, page_size: int = 50, status_filter: Optional[str] = None
    ) -> FleetAgentsResponse:
        """Get paginated list of agents with health metrics."""
        cache_key = f"ops:fleet:agents:{self.govern_region}:{page}:{page_size}:{status_filter or 'all'}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_FLEET,
            lambda: self._fetch_fleet_agents(page, page_size, status_filter),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_fleet_agents(
        self, page: int, page_size: int, status_filter: Optional[str]
    ) -> FleetAgentsResponse:
        agents, live, source = self._fetch_all_agents_health()

        # Filter by status if specified
        if status_filter:
            try:
                status = AgentHealthStatus(status_filter)
                agents = [a for a in agents if a.status == status]
            except ValueError:
                pass

        total = len(agents)
        start = (page - 1) * page_size
        end = start + page_size
        paginated = agents[start:end]

        return FleetAgentsResponse(
            agents=paginated,
            total=total,
            page=page,
            page_size=page_size,
            live=live,
            source=source,
        )

    def get_agent_detail(self, agent_id: str) -> Optional[AgentDetailResponse]:
        """Get detailed health information for a single agent."""
        agents, live, source = self._fetch_all_agents_health()

        agent = next((a for a in agents if a.agent_id == agent_id), None)
        if not agent:
            return None

        # Fetch related incidents and alerts
        incidents_resp = self._fetch_incidents(limit=10)
        recent_incident_ids = [
            inc.id
            for inc in incidents_resp.incidents
            if agent_id in inc.affected_agents
        ][:5]

        return AgentDetailResponse(
            agent=agent,
            recent_incidents=recent_incident_ids,
            recent_alerts=[],  # Would need to filter alerts by agent
            live=live,
            source=source,
        )

    def _fetch_all_agents_health(self) -> Tuple[List[AgentHealthRecord], bool, str]:
        """Fetch agents from all sources with health metrics."""
        agents: List[AgentHealthRecord] = []
        sources = []
        live = False

        # Fetch from Bedrock Agents
        try:
            client = self._bedrock_agent_client()
            paginator = client.get_paginator("list_agents")
            for page in paginator.paginate():
                for a in page.get("agentSummaries", []):
                    agent_id = a["agentId"]
                    metrics = self._get_agent_metrics(agent_id)
                    status = self._compute_health_status(metrics)
                    health_score = self._compute_health_score(metrics, status)

                    agents.append(
                        AgentHealthRecord(
                            agent_id=f"bedrock-{agent_id}",
                            agent_name=a.get("agentName", agent_id),
                            platform="bedrock-agent",
                            status=status,
                            health_score=health_score,
                            metrics=metrics,
                            environment="prod",
                            region=self.govern_region,
                        )
                    )
            sources.append(f"{len([a for a in agents if a.platform == 'bedrock-agent'])} Bedrock")
            live = True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Bedrock Agents unavailable: {e}")
            sources.append("Bedrock unavailable")

        # Fetch from AgentCore
        try:
            client = self._agentcore_client()
            paginator = client.get_paginator("list_agent_runtimes")
            for page in paginator.paginate():
                for r in page.get("agentRuntimes", []):
                    agent_id = r["agentRuntimeId"]
                    metrics = self._get_agent_metrics(agent_id, namespace="AgentCore")
                    status = self._compute_health_status(metrics)
                    health_score = self._compute_health_score(metrics, status)

                    agents.append(
                        AgentHealthRecord(
                            agent_id=f"agentcore-{agent_id}",
                            agent_name=r.get("agentRuntimeName", agent_id),
                            platform="agentcore",
                            status=status,
                            health_score=health_score,
                            metrics=metrics,
                            environment="prod",
                            region=self.govern_region,
                        )
                    )
            ac_count = len([a for a in agents if a.platform == "agentcore"])
            sources.append(f"{ac_count} AgentCore")
            live = True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"AgentCore unavailable: {e}")
            sources.append("AgentCore unavailable")

        source_note = " | ".join(sources) if sources else "No sources available"
        return agents, live, source_note

    def _get_agent_metrics(
        self, agent_id: str, namespace: str = "AWS/Bedrock"
    ) -> AgentHealthMetrics:
        """Get CloudWatch metrics for an agent."""
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=24)

            # Get latency p50
            resp = self._cw().get_metric_statistics(
                Namespace=namespace,
                MetricName="InvocationLatency",
                Dimensions=[{"Name": "AgentId", "Value": agent_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,
                Statistics=["Average"],
                ExtendedStatistics=["p50", "p99"],
            )
            datapoints = resp.get("Datapoints", [])
            latency_p50 = 0.0
            latency_p99 = 0.0
            if datapoints:
                dp = datapoints[0]
                latency_p50 = dp.get("ExtendedStatistics", {}).get("p50", dp.get("Average", 0))
                latency_p99 = dp.get("ExtendedStatistics", {}).get("p99", latency_p50 * 2)

            # Get invocation count and error rate
            resp_count = self._cw().get_metric_statistics(
                Namespace=namespace,
                MetricName="Invocations",
                Dimensions=[{"Name": "AgentId", "Value": agent_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,
                Statistics=["Sum"],
            )
            invocations = int(
                resp_count.get("Datapoints", [{}])[0].get("Sum", 0)
                if resp_count.get("Datapoints")
                else 0
            )

            resp_errors = self._cw().get_metric_statistics(
                Namespace=namespace,
                MetricName="Errors",
                Dimensions=[{"Name": "AgentId", "Value": agent_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,
                Statistics=["Sum"],
            )
            errors = int(
                resp_errors.get("Datapoints", [{}])[0].get("Sum", 0)
                if resp_errors.get("Datapoints")
                else 0
            )

            error_rate = (errors / invocations * 100) if invocations > 0 else 0.0
            success_rate = 100.0 - error_rate

            return AgentHealthMetrics(
                latency_p50_ms=latency_p50,
                latency_p99_ms=latency_p99,
                error_rate_pct=round(error_rate, 2),
                invocations_24h=invocations,
                success_rate_pct=round(success_rate, 2),
            )
        except (BotoCoreError, ClientError) as e:
            logger.debug(f"Could not get metrics for {agent_id}: {e}")
            return AgentHealthMetrics()

    def _compute_health_status(self, metrics: AgentHealthMetrics) -> AgentHealthStatus:
        """Compute health status from metrics."""
        if metrics.invocations_24h == 0:
            return AgentHealthStatus.UNKNOWN

        if metrics.error_rate_pct > 10 or metrics.latency_p99_ms > 30000:
            return AgentHealthStatus.DOWN
        if metrics.error_rate_pct > 5 or metrics.latency_p99_ms > 10000:
            return AgentHealthStatus.DEGRADED
        return AgentHealthStatus.HEALTHY

    def _compute_health_score(
        self, metrics: AgentHealthMetrics, status: AgentHealthStatus
    ) -> int:
        """Compute health score 0-100."""
        if status == AgentHealthStatus.UNKNOWN:
            return 50
        if status == AgentHealthStatus.DOWN:
            return max(0, 30 - int(metrics.error_rate_pct))
        if status == AgentHealthStatus.DEGRADED:
            return max(40, 70 - int(metrics.error_rate_pct * 2))

        # Healthy: base 80, adjust for error rate and latency
        score = 80
        score += min(10, int(metrics.success_rate_pct - 95))  # +10 for >95% success
        score += min(10, max(0, int((1000 - metrics.latency_p50_ms) / 100)))  # +10 for low latency
        return min(100, max(0, score))

    # =========================================================================
    # Incidents
    # =========================================================================

    def create_incident(self, req: IncidentCreate, created_by: Optional[str] = None) -> Incident:
        """Create a new incident."""
        incident = Incident(
            **req.model_dump(),
            created_by=created_by,
            detected_at=datetime.utcnow(),
        )

        # Add initial timeline event
        incident.timeline.append(
            TimelineEvent(
                event_type="status_change",
                actor=created_by or "system",
                description=f"Incident created with status {incident.status.value}",
            )
        )

        # Store in DynamoDB
        item = {
            "pk": self.PK_INCIDENT,
            "sk": f"{incident.created_at.isoformat()}#{incident.id}",
            "id": incident.id,
            "data": json.dumps(incident.model_dump(mode="json")),
        }
        if not self._put_item(item):
            self._mem_incidents.insert(0, incident)

        invalidate_prefix(f"ops:incidents:{self.table_name}:")
        return incident

    def get_incident(self, incident_id: str) -> Optional[IncidentResponse]:
        """Get a single incident by ID.

        A linear walk rather than a GetItem because the sort key is
        "{created_at}#{id}" and the id alone cannot build a Key. That makes the read
        ceiling load-bearing in a way the display lists' ceilings are not: a miss here is
        not a shorter list, it is a 404 for a record that exists, and update_incident /
        resolve_incident both route through this method. Hence _MAX_LOOKUP_SCAN rather than
        the 500 this used to pass, and a warning if even that is not enough - a silent None
        would look exactly like a deleted incident.
        """
        read = self._query_read(self.PK_INCIDENT, max_items=_MAX_LOOKUP_SCAN)
        for item in read.items:
            if item.get("id") == incident_id:
                incident = Incident.model_validate(json.loads(item["data"]))
                return IncidentResponse(incident=incident, live=True, source="dynamodb")

        # Fallback to memory
        incident = next((i for i in self._mem_incidents if i.id == incident_id), None)
        if incident:
            return IncidentResponse(incident=incident, live=False, source="memory")

        if read.truncated:
            logger.warning(
                "Incident %s not found within the first %d rows of the INCIDENT partition, "
                "which was truncated - reporting not-found for a record that may exist.",
                incident_id, _MAX_LOOKUP_SCAN,
            )
        return None

    def update_incident(
        self, incident_id: str, update: IncidentUpdate, updated_by: Optional[str] = None
    ) -> Optional[Incident]:
        """Update an existing incident."""
        resp = self.get_incident(incident_id)
        if not resp:
            return None

        incident = resp.incident
        update_data = update.model_dump(exclude_none=True)

        # Track status changes in timeline
        if "status" in update_data and update_data["status"] != incident.status:
            new_status = update_data["status"]
            incident.timeline.append(
                TimelineEvent(
                    event_type="status_change",
                    actor=updated_by or "system",
                    description=f"Status changed from {incident.status.value} to {new_status.value}",
                )
            )

            # Calculate TTR if resolved
            if new_status == IncidentStatus.RESOLVED:
                incident.resolved_at = datetime.utcnow()
                if incident.detected_at:
                    incident.ttr_minutes = (
                        incident.resolved_at - incident.detected_at
                    ).total_seconds() / 60

        # Apply updates
        for key, value in update_data.items():
            setattr(incident, key, value)
        incident.updated_at = datetime.utcnow()

        # Persist
        item = {
            "pk": self.PK_INCIDENT,
            "sk": f"{incident.created_at.isoformat()}#{incident.id}",
            "id": incident.id,
            "data": json.dumps(incident.model_dump(mode="json")),
        }
        if not self._put_item(item):
            # Update in memory
            for i, mem_inc in enumerate(self._mem_incidents):
                if mem_inc.id == incident_id:
                    self._mem_incidents[i] = incident
                    break

        invalidate_prefix(f"ops:incidents:{self.table_name}:")
        return incident

    def add_timeline_event(
        self, incident_id: str, event: TimelineEventCreate
    ) -> Optional[TimelineEvent]:
        """Add a timeline event to an incident."""
        resp = self.get_incident(incident_id)
        if not resp:
            return None

        incident = resp.incident
        timeline_event = TimelineEvent(**event.model_dump())
        incident.timeline.append(timeline_event)
        incident.updated_at = datetime.utcnow()

        # Persist
        item = {
            "pk": self.PK_INCIDENT,
            "sk": f"{incident.created_at.isoformat()}#{incident.id}",
            "id": incident.id,
            "data": json.dumps(incident.model_dump(mode="json")),
        }
        if not self._put_item(item):
            for i, mem_inc in enumerate(self._mem_incidents):
                if mem_inc.id == incident_id:
                    self._mem_incidents[i] = incident
                    break

        invalidate_prefix(f"ops:incidents:{self.table_name}:")
        return timeline_event

    def list_incidents(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        days: int = 30,
        limit: int = 50,
        page: int = 1,
    ) -> IncidentsListResponse:
        """List incidents with filters."""
        cache_key = f"ops:incidents:{self.table_name}:{status or 'all'}:{severity or 'all'}:{days}:{limit}:{page}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_INCIDENTS,
            lambda: self._fetch_incidents(status, severity, days, limit, page),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_incidents(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        days: int = 30,
        limit: int = 50,
        page: int = 1,
    ) -> IncidentsListResponse:
        """Fetch incidents from storage."""
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Try DynamoDB. The four arms this used to spell out inline now live in
        # _store_provenance, which six other read paths in this file needed verbatim; the
        # archaeology for why `live = len(items) > 0` is wrong is recorded there. Folding
        # them together also picked up the truncation caveat this site never had: the read
        # is capped at 1000 rows and `total` below was published as an exact count.
        read = self._query_read(self.PK_INCIDENT, max_items=1000)
        incidents, source, live, store_note = self._store_rows(
            read,
            lambda item: Incident.model_validate(json.loads(item["data"])),
            self._mem_incidents,
            "incidents",
            "Incidents created now",
        )

        # Filter
        filtered = []
        for inc in incidents:
            if inc.created_at < cutoff:
                continue
            if status:
                try:
                    if inc.status != IncidentStatus(status):
                        continue
                except ValueError:
                    pass
            if severity:
                try:
                    if inc.severity != IncidentSeverity(severity):
                        continue
                except ValueError:
                    pass
            filtered.append(inc)

        # Sort newest first
        filtered.sort(key=lambda x: x.created_at, reverse=True)

        # Calculate MTTR/MTTD
        resolved = [i for i in filtered if i.resolved_at and i.ttr_minutes]
        mttr = sum(i.ttr_minutes for i in resolved) / len(resolved) if resolved else None
        # MTTD stays None unless some incident actually carries a ttd_minutes.
        # Nothing writes that field today (see Incident.ttd_minutes), so `detected`
        # is always empty and MTTD is reported as "not measured" rather than 0.
        detected = [i for i in filtered if i.ttd_minutes is not None]
        mttd = (
            sum(i.ttd_minutes for i in detected) / len(detected) if detected else None
        )

        # Paginate
        total = len(filtered)
        start = (page - 1) * limit
        paginated = filtered[start : start + limit]

        # total=0 under live=True has two causes and the reader has to be able to tell them
        # apart: nothing is stored (already described by _store_provenance), or rows are
        # stored and the window/status/severity filters excluded all of them. The query is
        # unwindowed and unfiltered; everything above ran locally.
        if live and incidents and not filtered:
            window = (
                f"{len(incidents)} incident(s) are stored but none matches the requested "
                f"window ({days}d) and filters, so the count of 0 is a real zero."
            )
            store_note = f"{store_note} {window}" if store_note else window

        return IncidentsListResponse(
            incidents=paginated,
            total=total,
            page=page,
            page_size=limit,
            mttr_minutes=round(mttr, 1) if mttr else None,
            mttd_minutes=round(mttd, 1) if mttd is not None else None,
            live=live,
            source=source,
            note=store_note,
        )

    # =========================================================================
    # Alerts
    # =========================================================================

    def get_active_alerts(self) -> ActiveAlertsResponse:
        """Get active CloudWatch alarms."""
        cache_key = f"ops:alerts:active:{self.govern_region}"
        result, cached_at = get_or_load(
            cache_key, _TTL_ALERTS, self._fetch_active_alerts, should_cache=lambda r: r.live
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_active_alerts(self) -> ActiveAlertsResponse:
        """Fetch active alarms from CloudWatch, stamped with stored acknowledgements."""
        try:
            resp = self._cw().describe_alarms(StateValue="ALARM", MaxRecords=100)
            alarms = resp.get("MetricAlarms", [])

            # Get silences to check
            silences = self._get_active_silences()
            # Acknowledgements are AVA-side records (CloudWatch has no ack concept), so
            # they are read back from DynamoDB and stamped on. ack_note is not folded
            # into `live`: the alarm list itself is still measured from CloudWatch, and
            # flipping it to live=False because a secondary store is down would badge
            # real alarms as mock. The note carries the degradation instead.
            acks, ack_note = self._load_alert_acks()

            alerts = []
            for alarm in alarms:
                alarm_name = alarm.get("AlarmName", "")

                # Check if silenced
                silenced_until = None
                for silence in silences:
                    if fnmatch.fnmatch(alarm_name, silence.alarm_name_pattern):
                        silenced_until = silence.ends_at
                        break

                state_updated = alarm.get("StateUpdatedTimestamp")
                ack = self._resolve_ack(acks.get(self._alert_ack_sk(alarm_name)), state_updated)

                alerts.append(
                    Alert(
                        # The alarm NAME, not the alarm ARN. The ARN carries the AWS
                        # account id, and this id field was being returned unmasked
                        # right next to a masked alarm_arn - a masking bypass. The name
                        # is unique per account+region, so it is a stable key for the
                        # acknowledge path without leaking the account.
                        id=alarm_name or mask_account_id(alarm.get("AlarmArn")) or "",
                        alarm_name=alarm_name,
                        alarm_arn=mask_account_id(alarm.get("AlarmArn")),
                        state=AlertState.ALARM,
                        severity=self._infer_alert_severity(alarm_name),
                        metric_namespace=alarm.get("Namespace", ""),
                        metric_name=alarm.get("MetricName", ""),
                        dimensions={
                            d["Name"]: d["Value"] for d in alarm.get("Dimensions", [])
                        },
                        state_reason=alarm.get("StateReason", ""),
                        state_updated=state_updated,
                        acknowledged=ack is not None,
                        acknowledged_by=(ack or {}).get("acknowledged_by"),
                        acknowledged_at=_parse_datetime((ack or {}).get("acknowledged_at")),
                        silenced_until=silenced_until,
                    )
                )

            critical = sum(1 for a in alerts if a.severity == AlertSeverity.CRITICAL)
            high = sum(1 for a in alerts if a.severity == AlertSeverity.HIGH)

            return ActiveAlertsResponse(
                alerts=alerts,
                total=len(alerts),
                critical_count=critical,
                high_count=high,
                live=True,
                source="cloudwatch",
                note=ack_note,
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"CloudWatch alarms unavailable: {e}")
            return ActiveAlertsResponse(
                alerts=[],
                total=0,
                live=False,
                source="cloudwatch-unavailable",
                note="CloudWatch alarms unreachable - check credentials.",
            )

    def _infer_alert_severity(self, alarm_name: str) -> AlertSeverity:
        """Infer severity from alarm name patterns."""
        name_lower = alarm_name.lower()
        if "critical" in name_lower or "sev1" in name_lower:
            return AlertSeverity.CRITICAL
        if "high" in name_lower or "sev2" in name_lower:
            return AlertSeverity.HIGH
        if "low" in name_lower or "sev4" in name_lower:
            return AlertSeverity.LOW
        return AlertSeverity.MEDIUM

    def get_alert_rules(self) -> AlertRulesResponse:
        """Get custom alert rules from DynamoDB.

        An account that has simply not defined any custom alert rules yet is the expected
        state here, not a degraded one, so it is the state the old `live = len(items) > 0`
        was most likely to misreport. See _store_provenance for the four arms.
        """
        read = self._query_read(self.PK_ALERT_RULE, max_items=200)
        rules, source, live, note = self._store_rows(
            read,
            lambda item: AlertRule.model_validate(json.loads(item["data"])),
            self._mem_alert_rules,
            "alert rules",
            "Alert rules created now",
        )
        return AlertRulesResponse(
            rules=rules, total=len(rules), live=live, source=source, note=note
        )

    def create_alert_rule(self, req: AlertRuleCreate) -> AlertRule:
        """Create a new alert rule."""
        rule = AlertRule(**req.model_dump())

        item = {
            "pk": self.PK_ALERT_RULE,
            "sk": rule.id,
            "id": rule.id,
            "data": json.dumps(rule.model_dump(mode="json")),
        }
        if not self._put_item(item):
            self._mem_alert_rules.append(rule)

        return rule

    # -------------------------------------------------------------------------
    # Alert acknowledgements
    #
    # CloudWatch has no acknowledgement primitive: an alarm has a state, a reason,
    # and a history, and nothing else that an operator can set to mean "seen, being
    # handled". The only AWS API that would change anything here is SetAlarmState,
    # and that is NOT an acknowledgement - it forcibly rewrites the alarm's state,
    # firing (or clearing) every action attached to it and being overwritten again on
    # the next metric evaluation. Using it would suppress real pages and corrupt the
    # alarm history, so it is deliberately not called anywhere in this service.
    #
    # An acknowledgement is therefore an AVA-side record: a durable row in the
    # operations DynamoDB table keyed to the alarm, written on ack and read back when
    # the alert list is built. That is a real write that survives a restart, and it
    # never claims the AWS alarm changed.
    # -------------------------------------------------------------------------

    def _alert_ack_sk(self, alarm_name: str) -> str:
        """Sort key for one alarm's acknowledgement.

        Region-qualified because CloudWatch alarm names are unique per account+region
        only; if the govern region set ever fans out, two regions can each have an
        alarm named "Bedrock-Errors" and they must not share an acknowledgement.
        """
        return f"{self.govern_region}#{alarm_name}"

    def _load_alert_acks(self) -> Tuple[Dict[str, dict], Optional[str]]:
        """Stored acknowledgements keyed by sort key, plus a degradation note.

        The note is not None whenever the returned map may be incomplete, so the
        caller can say "ack state unknown" instead of silently showing every alarm as
        unacknowledged - which would invite a second operator to re-ack it.

        A read capped at 500 rows broke exactly that invariant, silently: the acks past the
        cap were simply absent from the map, every alarm they covered rendered as
        unacknowledged, and `note` stayed None to say the map was complete. Hence
        _MAX_LOOKUP_SCAN and the truncation caveat below.
        """
        if not self.table_name:
            return dict(self._mem_alert_acks), (
                "Acknowledgements are not being persisted: no operations table is "
                "configured (set GOVERN_OPERATIONS_TABLE_NAME). They are held in memory "
                "and lost on restart."
            )

        read = self._query_read(self.PK_ALERT_ACK, max_items=_MAX_LOOKUP_SCAN)
        items = read.items
        if self._table_ok is False:
            return dict(self._mem_alert_acks), (
                f"Acknowledgement state may be incomplete: reading '{self.table_name}' in "
                f"{self.region} failed, so only acknowledgements made in this process are "
                "shown."
            )

        acks = {item["sk"]: item for item in items if item.get("sk")}
        # Acks that only ever reached memory (a write that failed) still reflect real
        # operator action, so they are merged in - but the caller is told they are not
        # durable rather than being shown a clean-looking list.
        unpersisted = [k for k in self._mem_alert_acks if k not in acks]
        for key in unpersisted:
            acks[key] = self._mem_alert_acks[key]
        caveats: List[str] = []
        if unpersisted:
            caveats.append(
                f"{len(unpersisted)} acknowledgement(s) were never written to "
                f"'{self.table_name}' and will be lost on restart."
            )
        if read.truncated:
            caveats.append(
                f"Only the first {len(read.items)} stored acknowledgement(s) were read - "
                "more exist, so an alarm shown as unacknowledged here may already have been "
                "acknowledged by someone else."
            )
        return acks, (" ".join(caveats) if caveats else None)

    @staticmethod
    def _resolve_ack(ack: Optional[dict], state_updated: Any) -> Optional[dict]:
        """Return the ack only if it still applies to the alarm's CURRENT firing.

        An acknowledgement is scoped to the transition it was made against. If the
        alarm has changed state since (recovered and re-fired), the stored ack is
        stale and the alert must show as unacknowledged again - otherwise silencing a
        flapping alarm once would hide every later firing of it forever.
        """
        if not ack:
            return None
        acked_epoch = ack.get("alarm_state_epoch")
        if acked_epoch is None or not isinstance(state_updated, datetime):
            # Nothing to compare against; the ack stands.
            return ack
        try:
            # +1s of slack: the epoch round-trips through DynamoDB as a Decimal, and a
            # sub-second difference here is the same transition, not a new one.
            if state_updated.timestamp() > float(acked_epoch) + 1.0:
                return None
        except (TypeError, ValueError):
            return ack
        return ack

    def _find_alert(self, alerts: List[Alert], alert_id: str) -> Optional[Alert]:
        """Match a caller-supplied alert id against the live alarm list.

        Accepts the alarm name (the current `Alert.id`) and also the tail of a
        CloudWatch alarm ARN, so a client still holding the previous ARN-shaped id
        gets its alarm instead of a misleading 404.
        """
        wanted = (alert_id or "").strip()
        if not wanted:
            return None
        arn_tail = wanted.rsplit(":alarm:", 1)[-1]
        for a in alerts:
            if wanted in (a.id, a.alarm_name) or a.alarm_name == arn_tail:
                return a
        return None

    def acknowledge_alert(
        self, alert_id: str, acknowledged_by: str
    ) -> Optional[AlertAckResult]:
        """Record an acknowledgement for a firing CloudWatch alarm.

        Returns None when no alarm currently in ALARM state matches `alert_id` (the
        route turns that into a 404). The returned live/source/note describe the
        acknowledgement's own storage, NOT the alarm: source="dynamodb" means the row
        is durable, source="memory" means the write failed and the acknowledgement
        will not survive a restart. The CloudWatch alarm is never modified.
        """
        resp = self.get_active_alerts()
        # Do not mutate `alert` in place: get_active_alerts hands back the object the
        # TTL cache still holds, so stamping the ack onto it would write into the cache
        # and make an unpersisted ack look real until the entry expired.
        alert = self._find_alert(resp.alerts, alert_id)
        if not alert:
            return None

        acked_at = datetime.utcnow()
        record = {
            "pk": self.PK_ALERT_ACK,
            "sk": self._alert_ack_sk(alert.alarm_name),
            "id": alert.alarm_name,
            "alarm_name": alert.alarm_name,
            "alarm_region": self.govern_region,
            "acknowledged_by": acknowledged_by,
            "acknowledged_at": acked_at.isoformat(),
            # The transition this ack applies to. See _resolve_ack.
            "alarm_state_updated": (
                alert.state_updated.isoformat() if alert.state_updated else None
            ),
            "alarm_state_epoch": (
                alert.state_updated.timestamp() if alert.state_updated else None
            ),
        }

        persisted = self._put_item(record)
        if persisted:
            live, source = True, "dynamodb"
            note = (
                f"Acknowledgement stored in '{self.table_name}' ({self.region}) and will "
                "survive a restart. The CloudWatch alarm in "
                f"{self.govern_region} is unchanged - CloudWatch has no acknowledgement "
                "API, so this is an AVA record against the alarm's current firing. It "
                "clears automatically if the alarm changes state again."
            )
        else:
            self._mem_alert_acks[record["sk"]] = record
            live = False
            source = "memory" if self.table_name else "not-configured"
            reason = (
                f"the write to '{self.table_name}' in {self.region} failed"
                if self.table_name
                else "no operations table is configured (GOVERN_OPERATIONS_TABLE_NAME)"
            )
            note = (
                f"NOT persisted: {reason}. The acknowledgement is held in memory only and "
                "will be lost on restart. The CloudWatch alarm is unchanged either way."
            )

        # The alert list caches acknowledgement state, so it has to be dropped or the
        # UI would keep showing the alarm as unacknowledged for up to _TTL_ALERTS.
        invalidate(f"ops:alerts:active:{self.govern_region}")

        return AlertAckResult(
            **{
                **alert.model_dump(),
                "acknowledged": True,
                "acknowledged_by": acknowledged_by,
                "acknowledged_at": acked_at,
                "live": live,
                "source": source,
                "note": note,
            }
        )

    # -------------------------------------------------------------------------
    # Alert silences
    #
    # Also AVA-side. CloudWatch cannot suppress an alarm without disabling its
    # actions (DisableAlarmActions), which is a different, more destructive thing: it
    # is not time-bounded, it is invisible in the alarm's state, and forgetting to
    # re-enable it silently disarms production paging. A silence here is a stored,
    # expiring pattern that this service applies when it builds the alert list.
    # -------------------------------------------------------------------------

    def create_silence(
        self, req: AlertSilenceCreate, created_by: Optional[str] = None
    ) -> AlertSilenceResult:
        """Create an alert silence, reporting where it was actually stored.

        `created_by` is the actor the ROUTE resolved (x-user-email header first, then
        req.created_by), matching create_incident's signature. It is preferred over
        req.created_by, which is now Optional and only a fallback for header-less callers.
        """
        # No None may reach storage. created_by is not part of the sort key
        # (f"{ends_at}#{id}"), but it is serialized into the row's `data` blob and
        # AlertSilence.created_by is a required str: a None would raise a ValidationError
        # here, before the write, so the silence would simply not happen. A row that
        # somehow stored null would then fail model_validate in _load_silences and be
        # dropped as "malformed" - suppressing nothing while looking created.
        actor = created_by or req.created_by or "unknown"
        silence = AlertSilence(
            alarm_name_pattern=req.alarm_name_pattern,
            reason=req.reason,
            created_by=actor,
            ends_at=datetime.utcnow() + timedelta(minutes=req.duration_minutes),
        )

        item = {
            "pk": self.PK_ALERT_SILENCE,
            "sk": f"{silence.ends_at.isoformat()}#{silence.id}",
            "id": silence.id,
            "data": json.dumps(silence.model_dump(mode="json")),
        }
        persisted = self._put_item(item)
        if persisted:
            live, source = True, "dynamodb"
            note = (
                f"Silence stored in '{self.table_name}' ({self.region}) and will survive a "
                f"restart. It suppresses matching alarms in AVA until "
                f"{silence.ends_at.isoformat()}Z; the CloudWatch alarms keep evaluating and "
                "their own actions (SNS, paging) are untouched."
            )
        else:
            self._mem_silences.append(silence)
            live = False
            source = "memory" if self.table_name else "not-configured"
            reason = (
                f"the write to '{self.table_name}' in {self.region} failed"
                if self.table_name
                else "no operations table is configured (GOVERN_OPERATIONS_TABLE_NAME)"
            )
            note = (
                f"NOT persisted: {reason}. The silence applies to this process only and "
                "will be lost on restart."
            )

        invalidate(f"ops:alerts:active:{self.govern_region}")

        return AlertSilenceResult(
            **{**silence.model_dump(), "live": live, "source": source, "note": note}
        )

    def _load_silences(self) -> Tuple[List[AlertSilence], List[str], bool, Optional[str]]:
        """All stored silences with provenance.

        Returns (silences, ddb_sort_keys, live, note). `ddb_sort_keys` is positional
        with `silences` and is "" for a silence that only exists in memory, so a
        writer knows whether there is a row to update.

        Silences from the in-memory fallback are UNIONED with the table's rather than
        being an either/or: a silence created while DynamoDB was down still represents
        real operator intent, and dropping it the moment the table recovered would
        resume the noise it was created to stop, with nothing in the response saying
        why. They expire on their own via ends_at.

        Reads to _MAX_LOOKUP_SCAN, not the 200 this used to pass, because expire_silence
        finds its target by walking this list: a silence past the ceiling could not be
        ended, and the 404 that produced looked exactly like one that had already expired.
        A truncated read is disclosed rather than swallowed - list_silences publishes
        `total`, so a page size would otherwise be presented as a count.
        """
        read = self._query_read(self.PK_ALERT_SILENCE, max_items=_MAX_LOOKUP_SCAN)
        silences: List[AlertSilence] = []
        keys: List[str] = []
        malformed = 0
        for item in read.items:
            try:
                silences.append(AlertSilence.model_validate(json.loads(item["data"])))
                keys.append(item.get("sk") or "")
            except (KeyError, ValueError):
                # Skipping the row is right - one bad row must not 500 the endpoint - but it
                # was only ever logged, so `total` under-reported under a Live badge and an
                # alarm the dropped row silences rendered as un-silenced. Counted and
                # disclosed below; a log line is not visible to whoever reads the response.
                malformed += 1
                logger.warning("Skipping malformed silence row: %s", item.get("sk"))

        known = {s.id for s in silences}
        unpersisted = [s for s in self._mem_silences if s.id not in known]
        silences.extend(unpersisted)
        keys.extend("" for _ in unpersisted)

        if not self.table_name:
            return silences, keys, False, (
                "Silences are not being persisted: no operations table is configured "
                "(set GOVERN_OPERATIONS_TABLE_NAME)."
            )
        if self._table_ok is False:
            return silences, keys, False, (
                f"Silence list may be incomplete: reading '{self.table_name}' in "
                f"{self.region} failed, so only silences created in this process are shown."
            )
        caveats: List[str] = []
        if unpersisted:
            caveats.append(
                f"{len(unpersisted)} silence(s) were never written to '{self.table_name}' "
                "and will be lost on restart."
            )
        if malformed:
            caveats.append(
                f"{malformed} stored silence row(s) could not be parsed and are omitted, so "
                "an alarm shown here as un-silenced may in fact be silenced."
            )
        if read.truncated:
            # Appended, not assigned: a truncated read and a failed write are independent,
            # and a reader deciding whether a given alarm is silenced needs both.
            caveats.append(
                f"Only the first {len(read.items)} stored silence(s) were read - more exist, "
                "so this list is incomplete and a silence missing from it may still be active."
            )
        return silences, keys, True, (" ".join(caveats) if caveats else None)

    def list_silences(self, include_expired: bool = False) -> AlertSilencesResponse:
        """List stored alert silences (active by default)."""
        silences, _, live, note = self._load_silences()
        now = datetime.utcnow()
        active = [s for s in silences if s.ends_at > now]
        shown = silences if include_expired else active
        shown = sorted(shown, key=lambda s: s.ends_at, reverse=True)

        # Same window-empty distinction the incident, change and breach lists carry: a
        # total of 0 has two causes, and "nothing was ever silenced" reads very differently
        # from "everything that was silenced has since expired, so those alarms are live
        # again". Appended so a truncation or unpersisted-write caveat is not overwritten.
        if live and silences and not shown:
            expired = (
                f"{len(silences)} silence(s) are stored and all have expired, so no alarm is "
                "currently silenced."
            )
            note = f"{note} {expired}" if note else expired

        return AlertSilencesResponse(
            silences=shown,
            total=len(shown),
            active_count=len(active),
            live=live,
            source="dynamodb" if live else ("memory" if self.table_name else "not-configured"),
            note=note,
        )

    def expire_silence(self, silence_id: str) -> Optional[AlertSilenceResult]:
        """End a silence now. Returns None if no such silence is stored."""
        silences, keys, _, _ = self._load_silences()
        found = next(
            ((s, keys[i]) for i, s in enumerate(silences) if s.id == silence_id), None
        )
        if not found:
            return None
        silence, sort_key = found

        now = datetime.utcnow()
        if silence.ends_at > now:
            silence.ends_at = now

        persisted = False
        if sort_key:
            # The sort key embeds the ORIGINAL end time, so the row is updated in place
            # rather than re-keyed: the sk is only an ordering hint, and whether a
            # silence is still in force is decided by the ends_at inside `data`. A
            # delete-then-put would briefly leave the silence in neither state.
            persisted = self._update_item(
                self.PK_ALERT_SILENCE,
                sort_key,
                {"data": json.dumps(silence.model_dump(mode="json"))},
            )
        if not persisted:
            for i, existing in enumerate(self._mem_silences):
                if existing.id == silence.id:
                    self._mem_silences[i] = silence
                    break
            else:
                self._mem_silences.append(silence)

        invalidate(f"ops:alerts:active:{self.govern_region}")

        if persisted:
            note = f"Silence ended in '{self.table_name}' ({self.region})."
            source, live = "dynamodb", True
        else:
            source = "memory" if self.table_name else "not-configured"
            live = False
            note = (
                "NOT persisted: the expiry was applied in memory only, so the silence "
                "returns on restart if its original row is still stored."
                if sort_key
                else "This silence only ever existed in memory; it has been ended there."
            )
        return AlertSilenceResult(
            **{**silence.model_dump(), "live": live, "source": source, "note": note}
        )

    def _get_active_silences(self) -> List[AlertSilence]:
        """Get currently active silences."""
        silences, _, _, _ = self._load_silences()
        now = datetime.utcnow()
        return [s for s in silences if s.ends_at > now]

    # =========================================================================
    # SLAs
    # =========================================================================

    def list_slas(self) -> SLAListResponse:
        """List SLAs with compliance status."""
        cache_key = f"ops:slas:list:{self.table_name}"
        result, cached_at = get_or_load(
            cache_key, _TTL_SLAS, self._fetch_slas, should_cache=lambda r: r.live
        )
        return self._add_cache_stamp(result, cached_at)

    def _load_sla_targets(self) -> Tuple[List[SLATarget], bool, str, Optional[str]]:
        """Load SLA target definitions from DynamoDB, falling back to memory.

        Returns (targets, live, source, note) so every SLA read reports the same
        provenance. The `note` was added when this dropped `if items:` for the four arms
        in _store_provenance: the old form reported an account that simply has not defined
        any SLA targets as live=False / source="memory", which is what an unreachable table
        looks like, and there was no field in which to say which had happened.
        """
        read = self._query_read(self.PK_SLA, max_items=100)
        targets, source, live, note = self._store_rows(
            read,
            lambda item: SLATarget.model_validate(json.loads(item["data"])),
            self._mem_slas,
            "SLA targets",
            "SLA targets created now",
        )
        return targets, live, source, note

    def create_sla(self, req: SLATargetCreate) -> SLATarget:
        """Create an SLA target definition."""
        sla = SLATarget(**req.model_dump())

        item = {
            "pk": self.PK_SLA,
            "sk": sla.id,
            "id": sla.id,
            "data": json.dumps(sla.model_dump(mode="json")),
        }
        if not self._put_item(item):
            self._mem_slas.append(sla)

        invalidate(f"ops:slas:list:{self.table_name}")
        invalidate(f"ops:metrics:summary:{self.table_name}")
        return sla

    def _fetch_slas(self) -> SLAListResponse:
        """Fetch SLA targets and their compliance, omitting any that cannot be measured.

        An SLA whose compliance is None is dropped from `slas` rather than being emitted
        with a stand-in value. That is what makes the omission observable: `total` counts
        rows the caller can trust, the note names how many were dropped and why, and
        _compute_metrics_summary already keys off `sla_resp.slas` being empty to report
        sla_compliance_pct=None, so the honest zero propagates without a second edit.
        """
        sla_targets, targets_live, source, store_note = self._load_sla_targets()

        compliances: List[SLACompliance] = []
        unmeasured: List[str] = []
        for sla in sla_targets:
            compliance = self._compute_sla_compliance(sla)
            if compliance is None:
                unmeasured.append(f"{sla.name} ({sla.metric_type})")
            else:
                compliances.append(compliance)

        compliant = sum(1 for c in compliances if c.status == SLAStatus.COMPLIANT)
        at_risk = sum(1 for c in compliances if c.status == SLAStatus.AT_RISK)
        breached = sum(1 for c in compliances if c.status == SLAStatus.BREACHED)

        overall = (compliant / len(compliances) * 100) if compliances else 0.0

        # `live` has to answer "is this response a measurement", and that is not the same
        # question as "did the target store answer".
        #
        #   no targets at all      -> targets_live. Nothing to comply with is a real
        #                             finding about a reachable store.
        #   some evaluated         -> targets_live. The rows present are measured.
        #   targets, none evaluated-> False, unconditionally. Every number below is then a
        #                             schema-required placeholder and the response
        #                             describes nothing that was measured, so it must not
        #                             carry a Live badge no matter how the store behaved.
        #
        # The caveat that used to sit here - `targets_live` being False for a measured zero,
        # because _load_sla_targets inferred live from `if items:` - is gone: that loader now
        # goes through _store_provenance, so "no SLA targets defined" against a reachable
        # table reports live=True and says so in `store_note`.
        live = targets_live if (not sla_targets or compliances) else False

        notes: List[str] = []
        if store_note:
            notes.append(store_note)
        if unmeasured:
            shown = ", ".join(unmeasured[:5])
            if len(unmeasured) > 5:
                shown = f"{shown}, +{len(unmeasured) - 5} more"
            notes.append(
                f"{len(unmeasured)} of {len(sla_targets)} SLA target(s) could not be "
                f"evaluated and are omitted from `slas`: {shown}."
            )
            notes.append(_SLA_NO_MEASUREMENT_NOTE)
        if sla_targets and not compliances:
            notes.append(
                "NOT A MEASUREMENT: overall_compliance_pct=0.0 and the compliant / "
                "at_risk / breached counts of 0 below are placeholders required by the "
                "response schema, not findings - nothing was evaluated."
            )
        elif not sla_targets:
            notes.append("No SLA targets are defined, so there is nothing to evaluate.")

        return SLAListResponse(
            slas=compliances,
            total=len(compliances),
            compliant_count=compliant,
            at_risk_count=at_risk,
            breached_count=breached,
            overall_compliance_pct=round(overall, 1),
            live=live,
            source=source,
            note=" ".join(notes) if notes else None,
        )

    def get_sla_detail(self, sla_id: str) -> Optional[SLADetailResponse]:
        """Get detailed SLA information.

        Provenance comes from _load_sla_targets, same as list_slas. This used to run
        its own DynamoDB query, fall back to _mem_slas on a miss, and then report
        `live=True` either way - so a seeded in-memory SLA served the detail view under
        a Live badge. Going through the shared loader also keeps detail and list
        consistent: an SLA the list cannot show is no longer reachable via detail.

        `compliance` is None when it cannot be measured, and `live` is then False. It is
        NOT a 404: the SLA definition exists and is returned, only its evaluation is
        missing, and "SLA not found" would be a different and false statement. Returning
        the definition with compliance=None is why SLADetailResponse.compliance had to
        become Optional - there is no SLACompliance instance that is honest here, because
        current_value / status / error_budget_remaining_pct are all required and all
        unknowable (see _compute_sla_compliance).
        """
        sla_targets, targets_live, source, store_note = self._load_sla_targets()

        sla = next((s for s in sla_targets if s.id == sla_id), None)
        if not sla:
            return None

        compliance = self._compute_sla_compliance(sla)
        breaches = self._get_sla_breaches(sla_id)

        notes: List[str] = []
        if store_note:
            # Replaces a flat "Seeded SLA definition - no SLA targets are stored in DynamoDB
            # yet.", which was the wrong statement in two of the four store states and could
            # not be right in all of them: it named seeding as the cause whether the table
            # was absent, unreadable, or simply readable and empty.
            notes.append(store_note)
        if compliance is None:
            window_start, window_end = self._sla_window(sla)
            notes.append(
                f"compliance is null: this SLA's {sla.measurement_window} window "
                f"({window_start.isoformat(timespec='seconds')} to "
                f"{window_end.isoformat(timespec='seconds')}) has no measured "
                f"{sla.metric_type} value. {_SLA_NO_MEASUREMENT_NOTE}"
            )

        return SLADetailResponse(
            sla=sla,
            compliance=compliance,
            recent_breaches=breaches[:5],
            # Both halves have to hold: the definition came from the live store AND its
            # compliance was actually evaluated. Either one missing makes the response
            # something other than a measurement.
            live=targets_live and compliance is not None,
            source=source,
            note=" ".join(notes) if notes else None,
        )

    @staticmethod
    def _sla_window(sla: SLATarget) -> Tuple[datetime, datetime]:
        """(start, end) of an SLA's current measurement window.

        Kept - this part was never fabricated. The window is derived from
        sla.measurement_window and the clock, both of which are real.
        """
        now = datetime.utcnow()
        if sla.measurement_window == "monthly":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif sla.measurement_window == "weekly":
            start = now - timedelta(days=now.weekday())
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        elif sla.measurement_window == "daily":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now - timedelta(hours=1)
        return start, now

    def _compute_sla_compliance(self, sla: SLATarget) -> Optional[SLACompliance]:
        """Compliance for one SLA, or None when it cannot be measured.

        Returns None today for every SLA and every metric_type. That is the honest
        answer, and it is a behaviour change from what this used to do:

            if sla.metric_type == "availability":
                current_value = 99.95            # Simulated
            elif sla.metric_type == "latency":
                current_value = 150              # ms
            elif sla.metric_type == "error_rate":
                current_value = 0.1              # %
            else:
                current_value = sla.target_value

        Three literals and a tautology, and then ~40 lines of real-looking arithmetic on
        top of them: a COMPLIANT/AT_RISK/BREACHED verdict, and an error budget computed
        as (allowed_downtime - actual_downtime) / allowed_downtime. Every one of those
        derived figures inherited the literal. 99.95 clears any availability target up to
        99.95, so an availability SLA was structurally incapable of reporting anything but
        COMPLIANT, with an error budget that moved only when the operator edited the
        TARGET. The `else current_value = sla.target_value` arm is the same defect stated
        outright - throughput SLAs were declared exactly on target, by construction.

        What made it invisible: it never raised, never logged, and the numbers were
        chosen to look plausible. `_load_sla_targets` reports live=True as soon as one SLA
        row exists in DynamoDB, and `_fetch_slas` passed that live straight through, so
        the first SLA anyone created would have put 99.95% availability and a green
        compliance badge on the dashboard under a Live badge. The reference account has 0
        rows in the SLA partition of fsi-control-plane-govern-operations (measured just
        now, us-east-2), which is the only reason this has not shipped a false green yet -
        the defect is latent, not absent, and one POST /govern/operations/sla arms it.

        Why None rather than computing it: see _SLA_NO_MEASUREMENT_NOTE. Deriving a value
        from _get_agent_metrics was considered and rejected - it is a fixed 24h snapshot
        that cannot answer a monthly window, its error_rate is 0.0 whenever invocations
        are 0, and its failure path returns an all-zero AgentHealthMetrics(). Feeding that
        in would report "0% error rate, COMPLIANT" for an SLA whose agents emitted no
        datapoints at all, which is the same class of defect wearing a CloudWatch call as
        a disguise. A missing measurement pipeline is not fixable by relabelling.

        Callers must treat None as "not evaluated": omit the row, drop `live` to False,
        and name _SLA_NO_MEASUREMENT_NOTE. They must NOT substitute a default.
        """
        return None

    def get_sla_breaches(self, days: int = 30) -> SLABreachesResponse:
        """Get SLA breaches in the time window.

        Provenance is read off `_table_ok`, not off the row count. This method used to
        open with

            items = self._query_items(self.PK_SLA_BREACH, limit=200)
            live = len(items) > 0

        which is the same three-states-into-two conflation already removed from
        _fetch_incidents, and it was worse here because zero breaches is the DESIRABLE
        state. An account with no SLA breaches is a healthy account, and it reported
        live=False, source="memory", note=None - identical to an account whose
        operations table is missing, denied, or throttled. Measured just now against
        the reference account: the SLA_BREACH partition of
        fsi-control-plane-govern-operations in us-east-2 returns Count=0 with the table
        ACTIVE and readable, so the old code badged a true, healthy, measured zero as
        an in-memory fallback and told the reader nothing about which it was.

        Downstream the conflation was load-bearing, not cosmetic:
        GovernPostureScoreService._calc_incident_response has to EXCLUDE SLA breaches
        from its denominator whenever this method reports live=False, precisely because
        it cannot tell empty from unreachable from out here - see the comment there.
        With the four arms below, live=True now means "the table answered", so that
        exclusion can be narrowed to the genuinely unknown cases.

        The four outcomes live in _store_provenance, which every store-backed read in this
        file now shares; they are, in the order they are tested:
          1. rows returned            -> live=True,  source="dynamodb"
          2. no table configured      -> live=False, source="not-configured"
          3. the query failed         -> live=False, source="memory", note names it
          4. query succeeded, 0 rows  -> live=True,  source="dynamodb", note says the
                                         zero is measured, not a failed lookup
        """
        read = self._query_read(self.PK_SLA_BREACH, max_items=200)
        # The union of unpersisted in-memory breaches into a live list, which used to be
        # spelled out here, is now what _store_rows does for every entity in this file - a
        # row lands in _mem_breaches only when a _put_item failed, so it is real operator
        # action (an acknowledgement or a resolution) the table does not have.
        breaches, source, live, store_note = self._store_rows(
            read,
            lambda item: SLABreach.model_validate(json.loads(item["data"])),
            self._mem_breaches,
            "SLA breaches",
            "Breach acknowledgements made now",
        )
        caveats = [store_note] if store_note else []

        cutoff = datetime.utcnow() - timedelta(days=days)
        filtered = [b for b in breaches if b.breach_start >= cutoff]
        filtered.sort(key=lambda x: x.breach_start, reverse=True)

        # total=0 under live=True has two causes and the caller must be able to tell them
        # apart: nothing is stored (already described above), or rows are stored but all of
        # them predate the window. Without this the second case looks like the first.
        #
        # Appended rather than assigned: overwriting `store_note` here used to drop the
        # unpersisted-rows caveat whenever both applied, which is the case where a reader
        # most needs both.
        if live and breaches and not filtered:
            caveats.append(
                f"{len(breaches)} SLA breach(es) are stored but none started within the "
                f"last {days} days, so the window count of 0 is a real zero."
            )

        return SLABreachesResponse(
            breaches=filtered,
            total=len(filtered),
            live=live,
            source=source,
            note=" ".join(caveats) if caveats else None,
        )

    def _get_sla_breaches(self, sla_id: str) -> List[SLABreach]:
        """Get breaches for a specific SLA."""
        resp = self.get_sla_breaches(days=90)
        return [b for b in resp.breaches if b.sla_id == sla_id]

    def _find_breach(self, breach_id: str) -> Tuple[Optional[SLABreach], Optional[str]]:
        """Locate a breach by id.

        Returns (breach, ddb_sort_key). The sort key is None when the record
        only exists in the in-memory fallback, so writers know where to persist.

        The ceiling is _MAX_LOOKUP_SCAN rather than the 200 the display list uses, for the
        same reason as get_incident: this is a lookup, not a page, and a walk that stops
        short does not return a shorter list - it returns the wrong answer. Here that is
        worse than a 404. A truncated miss falls through to _mem_breaches and then
        _persist_breach is handed sort_key=None, so acknowledging a breach past the ceiling
        would APPEND a second, in-memory copy while the real DynamoDB row stayed
        unacknowledged. Both callers (acknowledge_sla_breach, resolve_sla_breach) route here.
        """
        read = self._query_read(self.PK_SLA_BREACH, max_items=_MAX_LOOKUP_SCAN)
        for item in read.items:
            if item.get("id") == breach_id:
                return SLABreach.model_validate(json.loads(item["data"])), item.get("sk")

        if read.truncated:
            logger.warning(
                "Breach %s not found within the first %d rows of the SLA_BREACH partition, "
                "which was truncated - treating as unstored, which risks a duplicate write.",
                breach_id,
                _MAX_LOOKUP_SCAN,
            )

        breach = next((b for b in self._mem_breaches if b.id == breach_id), None)
        return breach, None

    def _persist_breach(self, breach: SLABreach, sort_key: Optional[str]) -> None:
        """Write a breach back to its original store (DynamoDB or memory)."""
        if sort_key is not None:
            item = {
                "pk": self.PK_SLA_BREACH,
                "sk": sort_key,
                "id": breach.id,
                "data": json.dumps(breach.model_dump(mode="json")),
            }
            if self._put_item(item):
                return

        for i, existing in enumerate(self._mem_breaches):
            if existing.id == breach.id:
                self._mem_breaches[i] = breach
                return
        self._mem_breaches.append(breach)

    def acknowledge_sla_breach(
        self, breach_id: str, acknowledged_by: str
    ) -> Optional[SLABreach]:
        """Acknowledge an SLA breach."""
        breach, sort_key = self._find_breach(breach_id)
        if not breach:
            return None

        breach.acknowledged = True
        breach.acknowledged_by = acknowledged_by
        breach.acknowledged_at = datetime.utcnow()
        self._persist_breach(breach, sort_key)
        return breach

    def resolve_sla_breach(
        self, breach_id: str, resolution_notes: str = ""
    ) -> Optional[SLABreach]:
        """Resolve an SLA breach.

        Sets the breach end time (which is what makes a breach 'resolved') and
        records the resolution notes as remediation.
        """
        breach, sort_key = self._find_breach(breach_id)
        if not breach:
            return None

        if breach.breach_end is None:
            breach.breach_end = datetime.utcnow()
        if resolution_notes:
            breach.remediation = resolution_notes
        self._persist_breach(breach, sort_key)
        return breach

    @staticmethod
    def _window_total_minutes(measurement_window: str, start: datetime) -> Optional[float]:
        """Total length of a measurement window in minutes."""
        if measurement_window == "hourly":
            return 60.0
        if measurement_window == "daily":
            return 1440.0
        if measurement_window == "weekly":
            return 7 * 1440.0
        if measurement_window == "monthly":
            return calendar.monthrange(start.year, start.month)[1] * 1440.0
        return None

    def get_sla_error_budgets(self) -> SLAErrorBudgetsResponse:
        """Surface the error-budget position for every SLA that has one.

        A budget row is emitted only for an SLA whose compliance was actually measured.
        SLAErrorBudget.current_value and .remaining_pct are both required floats, so
        there is no shape in which an unmeasured SLA can appear here honestly - it is
        omitted, and the note says how many were omitted and why.

        This used to emit a row for EVERY target, reading current_value and
        error_budget_remaining_pct straight out of the simulated compliance object. The
        old docstring was candid about it ("measured values behind each budget are still
        simulated pending CloudWatch wiring") and the response was pinned live=False,
        which was the right instinct and still not enough: the budget MINUTES were then
        derived from the simulated remaining_pct, so
        used_budget_minutes = total * (100 - 99.95-derived budget) / 100 produced a
        specific, plottable burn figure - "3.4 of 21.6 minutes consumed" - for an SLA
        nothing had measured. A caveat in a note does not make a fabricated number safe
        to chart; a MockDataBadge on an invented burn-down is still an invented
        burn-down. Omitting the row is the only version that cannot be misread.
        """
        targets, targets_live, source, store_note = self._load_sla_targets()

        budgets: List[SLAErrorBudget] = []
        unmeasured: List[str] = []
        for sla in targets:
            compliance = self._compute_sla_compliance(sla)
            if compliance is None:
                unmeasured.append(f"{sla.name} ({sla.metric_type})")
                continue

            window_minutes = self._window_total_minutes(
                sla.measurement_window, compliance.measurement_start
            )

            total_minutes: Optional[float] = None
            used_minutes: Optional[float] = None
            if sla.metric_type == "availability" and window_minutes is not None:
                # Allowed downtime for the window is the only budget that can be
                # expressed in minutes; latency/error-rate budgets cannot.
                total_minutes = round(window_minutes * (100 - sla.target_value) / 100, 2)
                consumed_pct = max(0.0, 100.0 - compliance.error_budget_remaining_pct)
                used_minutes = round(total_minutes * consumed_pct / 100, 2)

            budgets.append(
                SLAErrorBudget(
                    sla_id=sla.id,
                    sla_name=sla.name,
                    metric_type=sla.metric_type,
                    measurement_window=sla.measurement_window,
                    target_value=sla.target_value,
                    current_value=compliance.current_value,
                    remaining_pct=compliance.error_budget_remaining_pct,
                    measurement_start=compliance.measurement_start,
                    measurement_end=compliance.measurement_end,
                    total_budget_minutes=total_minutes,
                    used_budget_minutes=used_minutes,
                )
            )

        avg_remaining = (
            round(sum(b.remaining_pct for b in budgets) / len(budgets), 1) if budgets else None
        )

        notes: List[str] = []
        if store_note:
            # Was "SLA targets are held in memory (DynamoDB unavailable)." gated on
            # `not targets_live and targets`, which asserted unavailability for the
            # not-configured case too and said nothing at all when the table answered with
            # zero rows. _load_sla_targets now reports which of the four it actually was.
            notes.append(store_note)
        if not targets:
            notes.append("No SLAs defined - nothing to budget.")
        if unmeasured:
            shown = ", ".join(unmeasured[:5])
            if len(unmeasured) > 5:
                shown = f"{shown}, +{len(unmeasured) - 5} more"
            notes.append(
                f"{len(unmeasured)} of {len(targets)} SLA target(s) have no error budget "
                f"and are omitted: {shown}."
            )
            notes.append(_SLA_NO_MEASUREMENT_NOTE)

        return SLAErrorBudgetsResponse(
            budgets=budgets,
            total=len(budgets),
            avg_remaining_pct=avg_remaining,
            # Rows that survive the loop are real measurements, so this is no longer
            # pinned False. Same three arms as _fetch_slas, deliberately identical so the
            # list and the budget view cannot disagree about provenance: no targets is a
            # measured zero (live follows the store), some budgets computed is measured,
            # and targets-with-no-budgets is not a measurement at all.
            live=targets_live if (not targets or budgets) else False,
            # Unconditional, like _fetch_slas. The comment above says the two views must not
            # disagree about provenance, and `source if budgets else "none"` broke exactly
            # that: with no SLA targets defined, /sla reported source="dynamodb" while
            # /sla/error-budgets reported source="none" from the same read of the same table.
            # "none" was also self-contradictory next to live=True, which is what that state
            # now correctly reports - a measurement sourced from nowhere. `source` names where
            # the input came from; whether anything could be computed from it is `live`'s job.
            source=source,
            note=" ".join(notes) if notes else None,
        )

    def get_sla_compliance_report(self, days: int = 30) -> SLAComplianceReportResponse:
        """Generate SLA compliance report.

        Every SLA figure here is forwarded from list_slas rather than recomputed, so the
        report inherits that method's honesty gating: with no SLA evaluated, `slas` is
        empty and `live` is False.

        The one number this method computes itself is avg_error_budget_remaining_pct, and it
        used to carry a fabricated floor: SLAComplianceReportResponse declared it
        `float = 100.0`, so with nothing to average the response reported a 100% error budget
        remaining - the most reassuring possible value for the case where nothing was
        measured. `live=False` plus a note was all that stood against it, and a note beside a
        number does not stop the number being read. The field is now Optional and this method
        forwards the None through, so "not measured" is expressible rather than approximated.
        """
        slas_resp = self.list_slas()
        breaches_resp = self.get_sla_breaches(days=days)

        now = datetime.utcnow()
        start = now - timedelta(days=days)

        avg_error_budget = (
            sum(s.error_budget_remaining_pct for s in slas_resp.slas) / len(slas_resp.slas)
            if slas_resp.slas
            else None
        )

        notes: List[str] = []
        if avg_error_budget is None:
            notes.append(
                "No SLA was evaluated, so avg_error_budget_remaining_pct is null rather than "
                "a stand-in value, and overall_compliance_pct=0.0 below is a placeholder "
                "required by the response schema, not a finding."
            )
        if slas_resp.note:
            notes.append(slas_resp.note)
        if breaches_resp.note:
            notes.append(f"Breach store: {breaches_resp.note}")

        return SLAComplianceReportResponse(
            report_period_start=start,
            report_period_end=now,
            slas=slas_resp.slas,
            overall_compliance_pct=slas_resp.overall_compliance_pct,
            total_breaches=breaches_resp.total,
            avg_error_budget_remaining_pct=(
                round(avg_error_budget, 1) if avg_error_budget is not None else None
            ),
            # Both stores have to be measurements for the report to be one: the breach
            # count is as much a part of this report as the compliance rows, and
            # get_sla_breaches can now say honestly whether it measured its zero.
            live=slas_resp.live and breaches_resp.live,
            source="computed",
            note=" ".join(notes) if notes else None,
        )

    # =========================================================================
    # On-Call
    # =========================================================================

    def get_current_oncall(self) -> CurrentOnCallResponse:
        """Get current on-call personnel."""
        cache_key = f"ops:oncall:current:{self.region}"
        result, cached_at = get_or_load(
            cache_key, _TTL_ONCALL, self._fetch_current_oncall, should_cache=lambda r: r.live
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_current_oncall(self) -> CurrentOnCallResponse:
        """Fetch current on-call from PagerDuty, falling back to the DynamoDB rota."""
        caveats: List[str] = []
        if self.pagerduty_api_key:
            try:
                return self._fetch_pagerduty_oncall()
            except Exception as e:
                # This fall-through used to be silent. With a key configured, the note
                # below resolved to None, so a PagerDuty outage was published as a clean
                # DynamoDB read - and the rota a reader then acted on was the locally
                # stored one, which is a different answer from the authoritative rota.
                # %r, not the raw message: this arm also catches failures raised while
                # reading PagerDuty's response, whose text quotes that response back. A
                # CR/LF in it would forge a second log line; repr escapes both.
                logger.warning("PagerDuty unavailable: %r", e)
                caveats.append(
                    "PagerDuty is configured but did not answer, so this is the locally "
                    "stored rota rather than the live PagerDuty one."
                )
        else:
            caveats.append("Configure PAGERDUTY_API_KEY for live PagerDuty integration.")

        read = self._query_read(self.PK_ONCALL, max_items=100)
        shifts, source, live, store_note = self._store_rows(
            read,
            lambda item: OnCallShift.model_validate(json.loads(item["data"])),
            self._mem_oncall_schedule,
            "on-call shifts",
            "Shifts created now",
        )
        if store_note:
            caveats.append(store_note)

        now = datetime.utcnow()
        current_shifts = [s for s in shifts if s.start_time <= now <= s.end_time]
        current_shifts.sort(key=lambda s: (s.is_override, s.person.escalation_level))

        # A stored rota with nobody covering this hour is a real measurement, and the only
        # one a reader can act on ("we have a gap right now"). `live = len(shifts) > 0` said
        # the opposite, and got the other direction wrong too: whenever a failed write had
        # left rows in _mem_oncall_schedule it badged that unpersisted memory as live.
        if live and shifts and not current_shifts:
            caveats.append(
                f"{len(shifts)} shift(s) are stored but none covers the current time, so "
                "nobody is on call right now."
            )

        primary = current_shifts[0].person if current_shifts else None
        secondary = current_shifts[1].person if len(current_shifts) > 1 else None
        shift_ends = current_shifts[0].end_time if current_shifts else None

        return CurrentOnCallResponse(
            primary=primary,
            secondary=secondary,
            schedule_name=current_shifts[0].schedule_name if current_shifts else None,
            shift_ends_at=shift_ends,
            live=live,
            source=source,
            note=" ".join(caveats) if caveats else None,
        )

    def _fetch_pagerduty_oncall(self) -> CurrentOnCallResponse:
        """Fetch on-call from PagerDuty API."""
        url = "https://api.pagerduty.com/oncalls?time_zone=UTC"
        # safe_fetch rather than urlopen: urllib's redirect handler carries
        # Authorization onto whatever host a 302 names, so one redirect off
        # api.pagerduty.com would hand this token to that host. fetch drops the
        # header when the origin changes, and refuses a non-2xx the way urlopen did.
        try:
            data = safe_fetch.fetch_json(
                url,
                headers={
                    "Authorization": f"Token token={self.pagerduty_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
        except SafeFetchError as e:
            # The caller logs str(e), which is only the stable reason; the transport
            # specifics live in .detail and are the part worth diagnosing from. %r on
            # detail because it can quote an upstream-supplied string.
            #
            # Re-raising is what keeps the fall-back honest: _fetch_current_oncall
            # publishes the stored rota with a caveat rather than an empty live answer.
            # That covers safe_fetch's response_too_large too - a body cut at the cap is
            # not a shorter rota, it is an unanswered call.
            logger.warning("PagerDuty fetch refused: %s (%r)", e.reason, e.detail)
            raise

        oncalls = data.get("oncalls", [])
        if not oncalls:
            return CurrentOnCallResponse(live=True, source="pagerduty")

        primary_oncall = oncalls[0]
        user = primary_oncall.get("user", {})
        primary = OnCallPerson(
            id=user.get("id", ""),
            name=user.get("name", ""),
            email=user.get("email", ""),
            escalation_level=primary_oncall.get("escalation_level", 1),
        )

        secondary = None
        if len(oncalls) > 1:
            sec_oncall = oncalls[1]
            sec_user = sec_oncall.get("user", {})
            secondary = OnCallPerson(
                id=sec_user.get("id", ""),
                name=sec_user.get("name", ""),
                email=sec_user.get("email", ""),
                escalation_level=sec_oncall.get("escalation_level", 2),
            )

        return CurrentOnCallResponse(
            primary=primary,
            secondary=secondary,
            schedule_name=primary_oncall.get("schedule", {}).get("summary"),
            shift_ends_at=_parse_datetime(primary_oncall.get("end")),
            live=True,
            source="pagerduty",
        )

    def get_oncall_schedule(self, weeks: int = 1) -> OnCallScheduleResponse:
        """Get on-call schedule for the week."""
        now = datetime.utcnow()
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(weeks=weeks)

        read = self._query_read(self.PK_ONCALL, max_items=100)
        shifts, source, live, note = self._store_rows(
            read,
            lambda item: OnCallShift.model_validate(json.loads(item["data"])),
            self._mem_oncall_schedule,
            "on-call shifts",
            "Shifts created now",
        )

        # Filter to the week
        filtered = [
            s
            for s in shifts
            if s.start_time < week_end and s.end_time > week_start
        ]
        filtered.sort(key=lambda s: s.start_time)

        # An empty week drawn from a non-empty rota is its own state, and without this it
        # reads as the empty-store case _store_provenance already describes. The query above
        # is unwindowed; the week filter runs here. Appended, not assigned, so an
        # unpersisted-rows caveat from _store_rows survives alongside it.
        if live and shifts and not filtered:
            window = (
                f"{len(shifts)} shift(s) are stored but none falls in the requested week, "
                "so this empty week is a real zero."
            )
            note = f"{note} {window}" if note else window

        return OnCallScheduleResponse(
            shifts=filtered,
            week_start=week_start,
            week_end=week_end,
            live=live,
            source=source,
            note=note,
        )

    def get_escalation_policies(self) -> EscalationPoliciesResponse:
        """Get escalation policies."""
        read = self._query_read(self.PK_ONCALL_POLICY, max_items=50)
        policies, source, live, note = self._store_rows(
            read,
            lambda item: EscalationPolicy.model_validate(json.loads(item["data"])),
            self._mem_policies,
            "escalation policies",
            "Policies created now",
        )
        return EscalationPoliciesResponse(
            policies=policies,
            total=len(policies),
            live=live,
            source=source,
            note=note,
        )

    # =========================================================================
    # Changes
    # =========================================================================

    def create_change(
        self, req: ChangeRecordCreate
    ) -> ChangeRecord:
        """Create a change record."""
        change = ChangeRecord(**req.model_dump())

        item = {
            "pk": self.PK_CHANGE,
            "sk": f"{change.requested_at.isoformat()}#{change.id}",
            "id": change.id,
            "data": json.dumps(change.model_dump(mode="json")),
        }
        if not self._put_item(item):
            self._mem_changes.insert(0, change)

        invalidate_prefix(f"ops:changes:{self.table_name}:")
        return change

    def list_changes(
        self, days: int = 30, limit: int = 50, page: int = 1
    ) -> ChangesListResponse:
        """List change records."""
        cache_key = f"ops:changes:{self.table_name}:{days}:{limit}:{page}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_CHANGES,
            lambda: self._fetch_changes(days, limit, page),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_changes(
        self, days: int, limit: int, page: int
    ) -> ChangesListResponse:
        cutoff = datetime.utcnow() - timedelta(days=days)

        read = self._query_read(self.PK_CHANGE, max_items=500)
        changes, source, live, note = self._store_rows(
            read,
            lambda item: ChangeRecord.model_validate(json.loads(item["data"])),
            self._mem_changes,
            "change records",
            "Change records created now",
        )

        # Filter and sort
        filtered = [c for c in changes if c.requested_at >= cutoff]
        filtered.sort(key=lambda x: x.requested_at, reverse=True)

        total = len(filtered)
        start = (page - 1) * limit
        paginated = filtered[start : start + limit]

        # Rows exist but all predate the window. Distinct from an empty store, which
        # _store_provenance has already described, and from an unreadable one. Appended so
        # an unpersisted-rows caveat from _store_rows is not lost.
        if live and changes and not filtered:
            window = (
                f"{len(changes)} change record(s) are stored but none was requested within "
                f"the last {days} days, so the window count of 0 is a real zero."
            )
            note = f"{note} {window}" if note else window

        return ChangesListResponse(
            changes=paginated,
            total=total,
            page=page,
            page_size=limit,
            live=live,
            source=source,
            note=note,
        )

    def get_pending_changes(self) -> PendingChangesResponse:
        """Get changes pending approval."""
        read = self._query_read(self.PK_CHANGE, max_items=200)
        changes, source, live, note = self._store_rows(
            read,
            lambda item: ChangeRecord.model_validate(json.loads(item["data"])),
            self._mem_changes,
            "change records",
            "Change records created now",
        )

        pending = [c for c in changes if c.status == ChangeStatus.PENDING]
        pending.sort(key=lambda x: x.requested_at)

        # Nothing awaiting approval is the DESIRABLE state on this endpoint, so it is the
        # one the old `live = len(items) > 0` was most likely to badge as a broken store.
        # An empty approval queue drawn from stored rows is a measurement, not a fallback.
        if live and changes and not pending:
            empty_queue = (
                f"{len(changes)} change record(s) are stored and none is awaiting approval, "
                "so the empty queue is a real zero."
            )
            note = f"{note} {empty_queue}" if note else empty_queue

        return PendingChangesResponse(
            changes=pending, total=len(pending), live=live, source=source, note=note
        )

    # =========================================================================
    # Metrics
    # =========================================================================

    def get_metrics_summary(self) -> MetricsSummaryResponse:
        """Get summary of key operations metrics."""
        cache_key = f"ops:metrics:summary:{self.table_name}"
        result, cached_at = get_or_load(
            cache_key, _TTL_METRICS, self._compute_metrics_summary, should_cache=lambda r: r.live
        )
        return self._add_cache_stamp(result, cached_at)

    def _compute_metrics_summary(self) -> MetricsSummaryResponse:
        """Compute operations metrics from incidents, changes, alerts."""
        # Get incidents for MTTR/MTTD
        incidents_resp = self._fetch_incidents(days=30)
        resolved = [
            i for i in incidents_resp.incidents if i.resolved_at and i.ttr_minutes
        ]
        mttr = sum(i.ttr_minutes for i in resolved) / len(resolved) if resolved else 0.0

        # MTTD. None when no incident carries a ttd_minutes value - which is always,
        # since nothing writes that field (see Incident.ttd_minutes). Reporting 0.0
        # here made the UI render a green "Excellent" 0-minute detection time under a
        # Live badge for a quantity this system never measures.
        detected = [i for i in incidents_resp.incidents if i.ttd_minutes is not None]
        mttd = (
            sum(i.ttd_minutes for i in detected) / len(detected) if detected else None
        )

        # Get changes for CFR
        changes_resp = self._fetch_changes(days=30, limit=500, page=1)
        total_changes = len(changes_resp.changes)
        failed_changes = sum(
            1 for c in changes_resp.changes if c.status == ChangeStatus.ROLLED_BACK
        )
        cfr = (failed_changes / total_changes * 100) if total_changes > 0 else 0.0

        # Get alerts for 24h count
        alerts_resp = self.get_active_alerts()

        # Get SLA compliance. With no SLAs defined there is nothing to measure,
        # so report None instead of 0% (which would read as total non-compliance
        # under a Live badge driven by incidents/changes).
        sla_resp = self._fetch_slas()
        sla_compliance = sla_resp.overall_compliance_pct if sla_resp.slas else None

        # Fleet health right now - NOT availability over the 30-day window the rest of
        # this summary uses. pct_healthy is a snapshot ratio; nothing samples agent
        # health over time, so there is no window to report it against.
        #
        # None when there is nothing to measure: no agents discovered, or every agent
        # resolved to UNKNOWN health (which is the current state - the CloudWatch health
        # probe finds no datapoints, so every agent lands in `unknown`). Sending the
        # resulting 0.0 through would render a 0% total-outage figure under a Live badge
        # for a fleet whose health was never actually determined.
        fleet_resp = self._fetch_fleet_status()
        fleet = fleet_resp.summary
        availability = (
            None
            if fleet.total == 0 or fleet.unknown >= fleet.total
            else fleet.pct_healthy
        )

        summary = OperationsMetricsSummary(
            mttr_minutes=round(mttr, 1),
            mttd_minutes=round(mttd, 1) if mttd is not None else None,
            cfr_pct=round(cfr, 1),
            availability_pct=round(availability, 1) if availability is not None else None,
            incident_count_30d=incidents_resp.total,
            change_count_30d=total_changes,
            alert_count_24h=alerts_resp.total,
            sla_compliance_pct=sla_compliance,
        )

        return MetricsSummaryResponse(
            summary=summary,
            live=incidents_resp.live or changes_resp.live,
            source="computed",
        )

    def get_metrics_trends(self, days: int = 30) -> MetricsTrendsResponse:
        """Get historical trends for key metrics."""
        cache_key = f"ops:metrics:trends:{self.table_name}:{days}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_METRICS,
            lambda: self._compute_metrics_trends(days),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _compute_metrics_trends(self, days: int) -> MetricsTrendsResponse:
        """Compute historical trends."""
        now = datetime.utcnow()
        start = now - timedelta(days=days)

        # Get all incidents in range
        incidents_resp = self._fetch_incidents(days=days, limit=1000)

        # Group incidents by day for trend
        incident_by_day: Dict[str, int] = defaultdict(int)
        for inc in incidents_resp.incidents:
            day = inc.created_at.strftime("%Y-%m-%d")
            incident_by_day[day] += 1

        incident_trend = MetricsTrend(
            metric_name="incident_count",
            unit="count",
            points=[
                MetricsTrendPoint(
                    timestamp=datetime.strptime(day, "%Y-%m-%d"),
                    value=float(count),
                )
                for day, count in sorted(incident_by_day.items())
            ],
        )

        # MTTR trend (weekly buckets)
        mttr_by_week: Dict[str, List[float]] = defaultdict(list)
        for inc in incidents_resp.incidents:
            if inc.ttr_minutes:
                week = (inc.created_at - timedelta(days=inc.created_at.weekday())).strftime(
                    "%Y-%m-%d"
                )
                mttr_by_week[week].append(inc.ttr_minutes)

        mttr_trend = MetricsTrend(
            metric_name="mttr",
            unit="minutes",
            points=[
                MetricsTrendPoint(
                    timestamp=datetime.strptime(week, "%Y-%m-%d"),
                    value=round(sum(vals) / len(vals), 1),
                )
                for week, vals in sorted(mttr_by_week.items())
            ],
        )

        return MetricsTrendsResponse(
            trends=[incident_trend, mttr_trend],
            period_start=start,
            period_end=now,
            live=incidents_resp.live,
            source="computed",
        )

    # =========================================================================
    # Capacity
    # =========================================================================

    def get_capacity_quotas(
        self, service_code: str = "bedrock"
    ) -> CapacityQuotasResponse:
        """Get service quotas with usage."""
        cache_key = f"ops:capacity:quotas:{self.govern_region}:{service_code}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_CAPACITY,
            lambda: self._fetch_capacity_quotas(service_code),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_capacity_quotas(self, service_code: str) -> CapacityQuotasResponse:
        """Fetch quotas from Service Quotas API."""
        try:
            quotas = []
            paginator = self._sq().get_paginator("list_service_quotas")

            for page in paginator.paginate(ServiceCode=service_code):
                for q in page.get("Quotas", []):
                    quota_value = q.get("Value", 0)

                    # Get usage if available
                    usage = 0.0
                    if q.get("UsageMetric"):
                        try:
                            usage = self._get_quota_usage(q["UsageMetric"])
                        except Exception:
                            pass

                    usage_pct = (usage / quota_value * 100) if quota_value > 0 else 0

                    quotas.append(
                        QuotaUsage(
                            quota_code=q.get("QuotaCode", ""),
                            quota_name=q.get("QuotaName", ""),
                            service_code=service_code,
                            service_name=q.get("ServiceName", service_code),
                            value=quota_value,
                            usage=usage,
                            usage_pct=round(usage_pct, 1),
                            unit=q.get("Unit", "None"),
                            adjustable=q.get("Adjustable", False),
                            global_quota=q.get("GlobalQuota", False),
                            region=self.govern_region,
                        )
                    )

            # Sort by usage percentage descending
            quotas.sort(key=lambda x: x.usage_pct, reverse=True)

            critical = sum(1 for q in quotas if q.usage_pct >= 90)
            warning = sum(1 for q in quotas if 75 <= q.usage_pct < 90)

            return CapacityQuotasResponse(
                quotas=quotas,
                total=len(quotas),
                critical_count=critical,
                warning_count=warning,
                live=True,
                source="service-quotas",
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Service Quotas unavailable: {e}")
            return CapacityQuotasResponse(
                quotas=[],
                total=0,
                live=False,
                source="service-quotas-unavailable",
                note="Service Quotas API unreachable - check credentials.",
            )

    def _get_quota_usage(self, usage_metric: dict) -> float:
        """Get current usage for a quota from CloudWatch."""
        namespace = usage_metric.get("MetricNamespace", "")
        metric_name = usage_metric.get("MetricName", "")
        dimensions = [
            {"Name": k, "Value": v}
            for k, v in usage_metric.get("MetricDimensions", {}).items()
        ]

        resp = self._cw().get_metric_statistics(
            Namespace=namespace,
            MetricName=metric_name,
            Dimensions=dimensions,
            StartTime=datetime.utcnow() - timedelta(hours=1),
            EndTime=datetime.utcnow(),
            Period=3600,
            Statistics=["Maximum"],
        )

        datapoints = resp.get("Datapoints", [])
        if datapoints:
            return datapoints[0].get("Maximum", 0)
        return 0.0

    def get_capacity_alerts(self, threshold_pct: float = 75.0) -> CapacityAlertsResponse:
        """Get alerts for quotas approaching limits."""
        quotas_resp = self.get_capacity_quotas()

        alerts = []
        for q in quotas_resp.quotas:
            if q.usage_pct >= threshold_pct:
                severity = (
                    AlertSeverity.CRITICAL
                    if q.usage_pct >= 90
                    else AlertSeverity.HIGH
                    if q.usage_pct >= 80
                    else AlertSeverity.MEDIUM
                )

                alerts.append(
                    QuotaAlert(
                        quota_code=q.quota_code,
                        quota_name=q.quota_name,
                        service_code=q.service_code,
                        current_usage_pct=q.usage_pct,
                        threshold_pct=threshold_pct,
                        severity=severity,
                        message=f"{q.quota_name} at {q.usage_pct}% of limit ({q.usage}/{q.value} {q.unit})",
                    )
                )

        alerts.sort(key=lambda x: x.current_usage_pct, reverse=True)

        return CapacityAlertsResponse(
            alerts=alerts, total=len(alerts), live=quotas_resp.live, source="computed"
        )

    # =========================================================================
    # SSM Fleet Manager (READ-ONLY)
    #
    # These methods surface the Systems Manager fleet for governance review:
    # managed instances, the document/runbook catalog, and Run Command
    # history. They are strictly read-only: only describe_instance_information,
    # list_documents, and list_commands are called. No send_command,
    # start_automation_execution, or any other mutating SSM API is used.
    # =========================================================================

    def get_ssm_managed_instances(self) -> SsmManagedInstancesResponse:
        """List SSM managed instances (read-only)."""
        cache_key = f"ops:ssm:instances:{self.govern_region}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_SSM,
            self._fetch_ssm_managed_instances,
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_ssm_managed_instances(self) -> SsmManagedInstancesResponse:
        """Fetch managed instances via describe_instance_information."""
        try:
            instances: List[SsmManagedInstance] = []
            paginator = self._ssm().get_paginator("describe_instance_information")
            for page in paginator.paginate():
                for info in page.get("InstanceInformationList", []):
                    instances.append(
                        SsmManagedInstance(
                            instance_id=info.get("InstanceId", ""),
                            name=info.get("Name") or info.get("ComputerName"),
                            ping_status=info.get("PingStatus", "Unknown"),
                            platform_type=info.get("PlatformType"),
                            platform_name=info.get("PlatformName"),
                            agent_version=info.get("AgentVersion"),
                            ip_address=info.get("IPAddress"),
                            resource_type=info.get("ResourceType"),
                            last_ping_at=info.get("LastPingDateTime"),
                        )
                    )
            online = sum(1 for i in instances if i.ping_status == "Online")
            return SsmManagedInstancesResponse(
                instances=instances,
                total=len(instances),
                online_count=online,
                live=True,
                source="ssm",
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"SSM describe_instance_information unavailable: {e}")
            return SsmManagedInstancesResponse(
                instances=[],
                total=0,
                online_count=0,
                live=False,
                source="ssm-unavailable",
                note="SSM managed instances unreachable - check credentials/permissions.",
            )

    def get_ssm_runbooks(self) -> SsmRunbooksResponse:
        """List SSM documents / runbooks (read-only)."""
        cache_key = f"ops:ssm:runbooks:{self.govern_region}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_SSM_DOCS,
            self._fetch_ssm_runbooks,
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_ssm_runbooks(self) -> SsmRunbooksResponse:
        """Fetch Command/Automation documents via list_documents.

        Includes Self- and Amazon-owned Command and Automation documents,
        capped to keep the catalog response bounded.
        """
        max_docs = 250
        try:
            docs: List[SsmRunbookDoc] = []
            for owner in ("Self", "Amazon"):
                if len(docs) >= max_docs:
                    break
                paginator = self._ssm().get_paginator("list_documents")
                page_iter = paginator.paginate(
                    Filters=[
                        {"Key": "Owner", "Values": [owner]},
                        {"Key": "DocumentType", "Values": ["Command", "Automation"]},
                    ]
                )
                for page in page_iter:
                    for d in page.get("DocumentIdentifiers", []):
                        docs.append(
                            SsmRunbookDoc(
                                name=d.get("Name", ""),
                                document_type=d.get("DocumentType", ""),
                                document_format=d.get("DocumentFormat"),
                                owner=mask_account_id(d.get("Owner")),
                                platform_types=d.get("PlatformTypes", []) or [],
                                target_type=d.get("TargetType"),
                                default_version=d.get("DocumentVersion"),
                            )
                        )
                        if len(docs) >= max_docs:
                            break
                    if len(docs) >= max_docs:
                        break

            command_count = sum(1 for d in docs if d.document_type == "Command")
            automation_count = sum(1 for d in docs if d.document_type == "Automation")
            note = None
            if len(docs) >= max_docs:
                note = (
                    f"Showing first {max_docs} Command/Automation documents "
                    "(Self + Amazon owned)."
                )
            return SsmRunbooksResponse(
                runbooks=docs,
                total=len(docs),
                command_count=command_count,
                automation_count=automation_count,
                live=True,
                source="ssm",
                note=note,
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"SSM list_documents unavailable: {e}")
            return SsmRunbooksResponse(
                runbooks=[],
                total=0,
                command_count=0,
                automation_count=0,
                live=False,
                source="ssm-unavailable",
                note="SSM document catalog unreachable - check credentials/permissions.",
            )

    def get_ssm_command_history(self, days: int = 7) -> SsmCommandHistoryResponse:
        """Get SSM Run Command execution history (read-only)."""
        cache_key = f"ops:ssm:commands:{self.govern_region}:{days}"
        result, cached_at = get_or_load(
            cache_key,
            _TTL_SSM,
            lambda: self._fetch_ssm_command_history(days),
            should_cache=lambda r: r.live,
        )
        return self._add_cache_stamp(result, cached_at)

    def _fetch_ssm_command_history(self, days: int) -> SsmCommandHistoryResponse:
        """Fetch command invocations via list_commands over the window."""
        try:
            invoked_after = (datetime.utcnow() - timedelta(days=days)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            commands: List[SsmCommandRecord] = []
            paginator = self._ssm().get_paginator("list_commands")
            page_iter = paginator.paginate(
                Filters=[{"key": "InvokedAfter", "value": invoked_after}]
            )
            for page in page_iter:
                for c in page.get("Commands", []):
                    targets = c.get("TargetCount")
                    if targets is None:
                        targets = len(c.get("InstanceIds", []) or [])
                    commands.append(
                        SsmCommandRecord(
                            command_id=c.get("CommandId", ""),
                            document_name=c.get("DocumentName", ""),
                            status=c.get("Status", "Unknown"),
                            targets_count=int(targets or 0),
                            requested_at=c.get("RequestedDateTime"),
                            completed_at=None,  # not provided by list_commands
                            comment=c.get("Comment") or None,
                            error_count=c.get("ErrorCount"),
                        )
                    )
            commands.sort(
                key=lambda x: x.requested_at.timestamp() if x.requested_at else 0.0,
                reverse=True,
            )
            return SsmCommandHistoryResponse(
                commands=commands,
                total=len(commands),
                live=True,
                source="ssm",
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"SSM list_commands unavailable: {e}")
            return SsmCommandHistoryResponse(
                commands=[],
                total=0,
                live=False,
                source="ssm-unavailable",
                note="SSM command history unreachable - check credentials/permissions.",
            )

    # =========================================================================
    # Helpers
    # =========================================================================

    def _add_cache_stamp(self, result, cached_at: float):
        """Add cache timestamp to response."""
        if not getattr(result, "live", False):
            return result
        age = time.time() - cached_at
        if age < 2:
            return result
        stamp = f"Cached {int(age)}s ago"
        # ttl_cache hands back the object it still holds, so mutating result.note
        # would append a stamp per hit and grow the cached note without bound.
        # model_copy swaps only this top-level scalar, leaving the cache entry intact.
        note = f"{result.note} - {stamp}" if result.note else stamp
        return result.model_copy(update={"note": note})
