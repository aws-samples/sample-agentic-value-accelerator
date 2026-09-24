"""Reachability probes for every data source the Govern UI names.

WHY THIS EXISTS
---------------
The "AWS Data Sources" panel on the Govern landing page used to render 47 of its
50 rows from a hardcoded `status: 'live'` literal, so a visitor was told
"47/50 connected" about their own AWS account before any AWS call was made. This
module replaces those literals with one real call per source.

WHY THE PROBES DO NOT REUSE THE SERVICES' `.live` FLAG
-----------------------------------------------------
Every Govern service already returns an honest-degrade triple (live/source/note),
so forwarding `.live` looks like the obvious implementation. It is wrong here,
for two independent reasons:

1. `.live` answers "do I have data to display", not "is this integration
   reachable". Eighteen of the fifty services set `live=False` on a call that
   SUCCEEDED and returned zero rows — e.g. `govern_models_service.get_runtime_metrics`
   returns `live=False, source="no-data"` after a perfectly successful
   `cloudwatch:ListMetrics`. Forwarding that paints a working integration as
   disconnected, which is the opposite error from the one we are fixing.
2. The services deliberately swallow `ClientError` into a `live=False` fallback.
   By the time the route sees the object, "reachable but empty" and
   "AccessDenied" have collapsed into the same value and cannot be recovered.
   Measured example: all five AVA control-plane endpoints return HTTP 200 `[]`
   for a DynamoDB table that does not exist in the configured region, because
   `ResourceNotFoundException` is caught and rendered as "no items". Probing the
   service method would inherit that fail-open; probing the store does not.

So each probe here issues the single cheapest account-scoped call it can and
lets the exception propagate to `_classify`, which is the only place a status is
decided. There is no code path that can report a source connected without a
completed AWS call.

EVERY MAPPING IN THIS FILE WAS VERIFIED AGAINST A LIVE ACCOUNT
--------------------------------------------------------------
The client name, operation, parameter shape, and response key of all fifty
probes were executed against a real account before being written down, because
several plausible-looking guesses were wrong in ways only a live call reveals:
`health:DescribeEventAggregates` takes a lower-case `aggregateField`,
`config:DescribeConfigRules` has no `Limit`, `ce:GetCostAndUsageWithResources`
rejects a query without `RESOURCE_ID` in Filter or GroupBy, and the AgentCore
metric namespace is `AWS/Bedrock-AgentCore` (hyphenated), not
`AWS/BedrockAgentCore`.

COST
----
Forty-six of the fifty probes are free. The four Cost Explorer probes are billed
at $0.01 per request, so they carry a six-hour TTL (`_BILLED_TTL`) and the
endpoint reports `billed_usd` for the calls it actually made. Cost Explorer
reachability changes on the order of months; paying $0.04 every six hours to say
so honestly is the trade, and `/refresh` can force it for an operator.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    DataNotFoundError,
    NoCredentialsError,
    UnknownServiceError,
)

from core import region_config
from core.config import settings

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Status contract
# --------------------------------------------------------------------------

# `status` is the only source of truth. There is deliberately no boolean `live`
# field: a single boolean cannot separate "reachable and empty" (which counts as
# connected) from "reachable but the service is switched off" (which does not),
# and it was the coercion of exactly that boolean that produced the fail-open
# this module replaces.
STATUS_CONNECTED = "connected"              # call returned, >= 1 record
STATUS_CONNECTED_EMPTY = "connected_empty"  # call returned, 0 records — still connected
STATUS_DEGRADED = "degraded"                # fan-out: some sub-calls reached, some raised
STATUS_ACCESS_DENIED = "access_denied"      # authorization failure — our IAM gap
STATUS_NOT_ENABLED = "not_enabled"          # customer has not enabled/subscribed the service
STATUS_ERROR = "error"                      # anything else: throttle, timeout, unprovisioned
STATUS_NOT_PROBED = "not_probed"            # no probe registered, or no reachability signal

# Statuses that count toward the connected numerator. `connected_empty` is in
# here on purpose: a successful call that returns zero rows means the integration
# works and the estate is clean, which must not read as a broken pipe.
CONNECTED_STATUSES = frozenset({STATUS_CONNECTED, STATUS_CONNECTED_EMPTY})

# Every status, in display order. `summarize()` seeds its tally from this so the
# response always carries all seven keys — a status that happens to be absent
# reports an explicit 0 rather than vanishing and forcing callers to guess.
ALL_STATUSES: tuple[str, ...] = (
    STATUS_CONNECTED,
    STATUS_CONNECTED_EMPTY,
    STATUS_DEGRADED,
    STATUS_ACCESS_DENIED,
    STATUS_NOT_ENABLED,
    STATUS_ERROR,
    STATUS_NOT_PROBED,
)

# Read the structured error code, never the message. Message text is unstable
# across services and regions; the code is contractual.
DENIAL_CODES = frozenset({
    "AccessDenied",
    "AccessDeniedError",
    "AccessDeniedException",
    "AuthorizationError",
    "MissingAuthenticationToken",
    "NotAuthorized",
    "UnauthorizedAccess",
    "UnauthorizedOperation",
    "UnrecognizedClientException",
})

NOT_ENABLED_CODES = frozenset({
    "AWSOrganizationsNotInUseException",
    "BadRequestException",
    "DataUnavailableException",
    "InvalidAccessException",
    "MacieNotEnabledException",
    "OptInRequiredException",
    "OrganizationsNotInUseException",
    "SubscriptionRequiredException",
})

# Deliberately NOT in NOT_ENABLED_CODES. "The thing you named does not exist" is
# not the same claim as "you have not switched this service on", and conflating
# them hides a real defect: the four AVA control-plane tables raise
# ResourceNotFoundException because they are not provisioned in the configured
# region, which is ours to fix, not a customer opt-in. It maps to `error` with a
# `provision-resource` hint so it reads as broken rather than as switched off.
NOT_PROVISIONED_CODES = frozenset({
    "NoSuchEntity",
    "ResourceNotFoundException",
})

RETRYABLE_CODES = frozenset({
    "RequestLimitExceeded",
    "ThrottledException",
    "Throttling",
    "ThrottlingException",
    "TooManyRequestsException",
})

# Some services report "not enabled" as AccessDenied with an explanatory message
# (Macie is the standard example). Matching the message is only ever allowed to
# move a source from one non-green status to another non-green status — it can
# never promote anything to connected — so a false match cannot cause an
# overclaim, only a less precise remediation hint.
_NOT_ENABLED_HINTS = (
    "not enabled",
    "not subscribed",
    "is not authorized to perform this operation because the service is not",
    "no such subscription",
    "must enable",
)


# --------------------------------------------------------------------------
# Error sanitisation
# --------------------------------------------------------------------------

# Raw boto3 messages routinely embed the caller's ARN and 12-digit account id,
# e.g. "User: arn:aws:sts::<12-digit-account>:assumed-role/<role>/... is not
# authorized". The previous route returned `str(e)[:200]` straight into a
# VIEWER-visible field, publishing account identifiers to anyone who could load
# the page. Redact before the string leaves this module.
_ARN_RE = re.compile(r"arn:aws[a-z0-9-]*:[^\s\"'\\]+")
_ACCOUNT_RE = re.compile(r"\b\d{12}\b")


def sanitize_error(message: str, limit: int = 240) -> str:
    """Strip account identifiers out of an AWS error message."""
    redacted = _ARN_RE.sub("<arn>", message or "")
    redacted = _ACCOUNT_RE.sub("<account>", redacted)
    redacted = " ".join(redacted.split())
    return redacted[:limit]


# --------------------------------------------------------------------------
# Probe primitives
# --------------------------------------------------------------------------


class ProbeNotEnabled(Exception):
    """Raised by a probe when the call succeeded but proved the service is off.

    Used where a 200 response carries the disablement in its body rather than in
    an error code — Compute Optimizer's enrollment status and Bedrock's
    invocation-logging configuration both work this way.
    """


class ProbeUnsupported(Exception):
    """Raised when no reachability signal can be produced for this source."""


@dataclass(frozen=True)
class ProbeReading:
    """What a successful probe observed.

    `exact_count` is populated only when the single call returns the COMPLETE
    set. For `MaxResults=1` samples and for paginated page-one reads it stays
    None, because a page length is not a total: `cloudwatch:ListMetrics` returns
    exactly 500 on this account, which is the page cap, not the metric count.
    Reporting that as a total would trade one fabricated number for another.
    """

    found: bool
    exact_count: Optional[int] = None
    unit: Optional[str] = None
    detail: Optional[str] = None
    subcalls_reached: Optional[int] = None
    subcalls_total: Optional[int] = None


# Region selector. The control plane and the governed fleet are deliberately in
# different regions here (AWS_REGION=us-east-2, GOVERN_AWS_REGION=us-east-1), so
# a probe pointed at the wrong one reports a real resource as missing. Each spec
# states which plane it belongs to rather than inheriting an ambient default.
REGION_GOVERN = "govern"    # governed AI resources (Bedrock, AgentCore, SageMaker)
REGION_CONTROL = "control"  # AVA's own control-plane stores
REGION_GLOBAL = "global"    # services with a single global endpoint

_GLOBAL_REGION = "us-east-1"

_FREE_TTL = 300      # 5 min for the 46 free probes
_BILLED_TTL = 21600  # 6 h for the 4 Cost Explorer probes ($0.01 each)
_FAILURE_TTL = 60    # never pin a transient failure for a full TTL


@dataclass(frozen=True)
class ProbeSpec:
    source_id: str          # matches the id rendered by DataSourceIndicator.tsx
    group: str
    label: str
    api: str                # the exact AWS API this probe calls
    boto_service: str
    region_kind: str
    call: Callable[[object], ProbeReading]
    #: For REGION_CONTROL DynamoDB probes: the settings prefix of the table being
    #: probed ("GUARDRAILS" for GUARDRAILS_TABLE_NAME). Lets the probe follow a
    #: per-table region override instead of assuming the control-plane default.
    table_key: Optional[str] = None
    #: When True, zero records is proof the service is switched off rather than
    #: proof of a clean estate — e.g. zero GuardDuty detectors or zero Detective
    #: graphs means the service was never enabled in this region.
    zero_means_not_enabled: bool = False
    billed_usd: float = 0.0
    read_timeout: int = 10
    ttl: int = _FREE_TTL


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _day(offset: int) -> str:
    return (_now() + timedelta(days=offset)).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------
# boto3 client pool
# --------------------------------------------------------------------------

_clients: dict[tuple[str, str, int], object] = {}
_clients_lock = threading.Lock()
_account_id: Optional[str] = None
_account_lock = threading.Lock()


def _resolve_region(kind: str, table_key: Optional[str] = None) -> str:
    if kind == REGION_GOVERN:
        return settings.GOVERN_AWS_REGION or settings.AWS_REGION
    if kind == REGION_CONTROL:
        # A control-plane DynamoDB table can be relocated one table at a time
        # (GUARDRAILS_TABLE_REGION and friends), so probe the table's own home
        # region rather than the control-plane default. Probing the default is how
        # the guardrails table - provisioned, populated, and reachable - reported
        # as a hard error on the status page.
        if table_key:
            return region_config.table_region(table_key)
        return region_config.control_region()
    return _GLOBAL_REGION


def _client(service: str, region: str, read_timeout: int):
    """Cached boto3 client with a bounded timeout.

    A probe that hangs must not stall the whole status endpoint, so every client
    caps connect/read time and retries at most twice. Clients are cached because
    construction parses a JSON service model, which is far more expensive than
    the call itself.
    """
    key = (service, region, read_timeout)
    with _clients_lock:
        existing = _clients.get(key)
        if existing is not None:
            return existing
    cfg = BotoConfig(
        connect_timeout=4,
        read_timeout=read_timeout,
        retries={"max_attempts": 2, "mode": "standard"},
    )
    built = boto3.client(service, region_name=region, config=cfg)
    with _clients_lock:
        return _clients.setdefault(key, built)


def _caller_account() -> str:
    """Account id for APIs that require it as a parameter (Budgets).

    Held in memory only. It is never placed in a probe result — see
    `sanitize_error`, which strips account ids out of anything user-visible.
    """
    global _account_id
    with _account_lock:
        if _account_id is None:
            _account_id = _client("sts", _GLOBAL_REGION, 10).get_caller_identity()["Account"]
        return _account_id


# --------------------------------------------------------------------------
# Probe implementations
# --------------------------------------------------------------------------
#
# Each returns a ProbeReading on success and raises on failure. None of them
# catch ClientError: classification is _classify's job, and a probe that
# swallowed its own error would reintroduce the fail-open this module exists to
# remove.


def _sample(records: list, unit: str, exact: Optional[int] = None) -> ProbeReading:
    return ProbeReading(found=len(records) > 0, exact_count=exact, unit=unit)


# --- Amazon Bedrock -------------------------------------------------------

def _p_bedrock_models(c) -> ProbeReading:
    models = c.list_foundation_models().get("modelSummaries", [])
    # ListFoundationModels is not paginated, so this length IS the total.
    return ProbeReading(found=bool(models), exact_count=len(models), unit="models")


def _p_bedrock_runtime(c) -> ProbeReading:
    m = c.list_metrics(Namespace="AWS/Bedrock", MetricName="Invocations").get("Metrics", [])
    return _sample(m, "invocation metrics")


def _p_bedrock_guardrails(c) -> ProbeReading:
    return _sample(c.list_guardrails(maxResults=1).get("guardrails", []), "guardrails")


def _p_bedrock_evals(c) -> ProbeReading:
    return _sample(c.list_evaluation_jobs(maxResults=1).get("jobSummaries", []), "evaluation jobs")


def _p_bedrock_kbs(c) -> ProbeReading:
    return _sample(c.list_knowledge_bases(maxResults=1).get("knowledgeBaseSummaries", []), "knowledge bases")


def _p_bedrock_agents(c) -> ProbeReading:
    return _sample(c.list_agents(maxResults=1).get("agentSummaries", []), "agents")


def _p_bedrock_flows(c) -> ProbeReading:
    return _sample(c.list_flows(maxResults=1).get("flowSummaries", []), "flows")


def _p_bedrock_prompts(c) -> ProbeReading:
    return _sample(c.list_prompts(maxResults=1).get("promptSummaries", []), "prompts")


def _p_bedrock_invocation_logs(c) -> ProbeReading:
    # A 200 with no loggingConfig means Bedrock is reachable but model-invocation
    # logging was never switched on. That is a customer configuration gap, not an
    # empty result set, so it is not_enabled rather than connected_empty.
    cfg = c.get_model_invocation_logging_configuration().get("loggingConfig")
    if not cfg:
        raise ProbeNotEnabled("Bedrock model-invocation logging is not enabled in this region")
    destinations = [k for k in ("cloudWatchConfig", "s3Config") if cfg.get(k)]
    return ProbeReading(
        found=True,
        unit="log destinations",
        detail=f"logging to {', '.join(d.replace('Config', '') for d in destinations)}"
        if destinations else None,
    )


# --- Bedrock AgentCore ----------------------------------------------------

def _p_agentcore_runtimes(c) -> ProbeReading:
    return _sample(c.list_agent_runtimes(maxResults=1).get("agentRuntimes", []), "runtimes")


def _p_agentcore_memory(c) -> ProbeReading:
    return _sample(c.list_memories(maxResults=1).get("memories", []), "memory stores")


def _p_agentcore_gateways(c) -> ProbeReading:
    return _sample(c.list_gateways(maxResults=1).get("items", []), "gateways")


def _p_agentcore_policies(c) -> ProbeReading:
    return _sample(c.list_policy_engines(maxResults=1).get("items", []), "policy engines")


def _p_agentcore_identities(c) -> ProbeReading:
    return _sample(c.list_workload_identities(maxResults=1).get("workloadIdentities", []), "workload identities")


def _p_agentcore_registry(c) -> ProbeReading:
    # ListRegistryRecords requires a registryId, so it cannot be an account-scoped
    # reachability check. ListRegistries takes no required parameter and is the
    # correct entry point.
    return _sample(c.list_registries(maxResults=1).get("registries", []), "registries")


def _p_agentcore_metrics(c) -> ProbeReading:
    # Namespace is hyphenated. "AWS/BedrockAgentCore" silently returns zero
    # metrics, which would have rendered a working integration as empty.
    m = c.list_metrics(Namespace="AWS/Bedrock-AgentCore").get("Metrics", [])
    return _sample(m, "runtime metrics")


def _p_verified_permissions(c) -> ProbeReading:
    return _sample(c.list_policy_stores(maxResults=1).get("policyStores", []), "policy stores")


# --- Amazon SageMaker -----------------------------------------------------

def _p_sagemaker_registry(c) -> ProbeReading:
    return _sample(c.list_model_packages(MaxResults=1).get("ModelPackageSummaryList", []), "model packages")


def _p_sagemaker_cards(c) -> ProbeReading:
    return _sample(c.list_model_cards(MaxResults=1).get("ModelCardSummaries", []), "model cards")


def _p_sagemaker_endpoints(c) -> ProbeReading:
    return _sample(c.list_endpoints(MaxResults=1).get("Endpoints", []), "endpoints")


def _p_sagemaker_monitor(c) -> ProbeReading:
    return _sample(c.list_monitoring_schedules(MaxResults=1).get("MonitoringScheduleSummaries", []), "monitoring schedules")


# --- Security services ----------------------------------------------------

def _p_securityhub(c) -> ProbeReading:
    return _sample(c.get_findings(MaxResults=1).get("Findings", []), "findings")


def _p_guardduty(c) -> ProbeReading:
    return _sample(c.list_detectors(MaxResults=1).get("DetectorIds", []), "detectors")


def _p_inspector(c) -> ProbeReading:
    # batch_get_account_status with no accountIds returns the caller's own status,
    # which distinguishes ENABLED from DISABLED without an AccessDenied guess.
    accounts = c.batch_get_account_status().get("accounts", [])
    enabled = [a for a in accounts if a.get("state", {}).get("status") == "ENABLED"]
    if accounts and not enabled:
        raise ProbeNotEnabled("Inspector is not enabled for this account")
    return ProbeReading(found=bool(enabled), unit="enabled accounts")


def _p_macie(c) -> ProbeReading:
    status = c.get_macie_session().get("status")
    if status != "ENABLED":
        raise ProbeNotEnabled(f"Macie session status is {status or 'unknown'}")
    return ProbeReading(found=True, unit="session")


def _p_access_analyzer(c) -> ProbeReading:
    return _sample(c.list_analyzers(maxResults=1).get("analyzers", []), "analyzers")


def _p_detective(c) -> ProbeReading:
    return _sample(c.list_graphs(MaxResults=1).get("GraphList", []), "behavior graphs")


# --- Observability --------------------------------------------------------

def _p_cloudwatch_metrics(c) -> ProbeReading:
    # Unfiltered ListMetrics answers "can we read CloudWatch metrics at all",
    # which is a different question from the AWS/Bedrock-scoped probe above.
    return _sample(c.list_metrics().get("Metrics", []), "metrics")


def _p_cloudwatch_logs(c) -> ProbeReading:
    return _sample(c.describe_log_groups(limit=1).get("logGroups", []), "log groups")


def _p_cloudtrail(c) -> ProbeReading:
    return _sample(c.lookup_events(MaxResults=1).get("Events", []), "events")


def _p_xray(c) -> ProbeReading:
    now = _now()
    summaries = c.get_trace_summaries(
        StartTime=now - timedelta(minutes=15), EndTime=now
    ).get("TraceSummaries", [])
    return ProbeReading(
        found=bool(summaries), unit="traces",
        detail="15-minute window" if not summaries else None,
    )


def _p_cloudtrail_lake(c) -> ProbeReading:
    return _sample(c.list_event_data_stores(MaxResults=1).get("EventDataStores", []), "event data stores")


def _p_aws_health(c) -> ProbeReading:
    # aggregateField is lower-case on this API, and there is no MaxResults.
    aggs = c.describe_event_aggregates(aggregateField="eventTypeCategory").get("eventAggregates", [])
    return ProbeReading(found=bool(aggs), exact_count=len(aggs), unit="event categories")


def _p_service_quotas(c) -> ProbeReading:
    return _sample(c.list_service_quotas(ServiceCode="bedrock", MaxResults=1).get("Quotas", []), "Bedrock quotas")


# --- Compliance & Config --------------------------------------------------

def _p_config(c) -> ProbeReading:
    recorders = c.describe_configuration_recorders().get("ConfigurationRecorders", [])
    if not recorders:
        raise ProbeNotEnabled("AWS Config has no configuration recorder in this region")
    return ProbeReading(found=True, exact_count=len(recorders), unit="configuration recorders")


def _p_config_rules(c) -> ProbeReading:
    # DescribeConfigRules has no Limit parameter; page one is the whole set on
    # accounts under the pagination threshold, so exact_count stays unset.
    rules = c.describe_config_rules().get("ConfigRules", [])
    return _sample(rules, "config rules")


def _p_resource_tags(c) -> ProbeReading:
    return _sample(c.get_resources(ResourcesPerPage=1).get("ResourceTagMappingList", []), "tagged resources")


def _p_security_lake(c) -> ProbeReading:
    region = _resolve_region(REGION_GOVERN)
    return _sample(c.list_data_lakes(regions=[region]).get("dataLakes", []), "data lakes")


def _p_trusted_advisor(c) -> ProbeReading:
    checks = c.describe_trusted_advisor_checks(language="en").get("checks", [])
    return ProbeReading(found=bool(checks), exact_count=len(checks), unit="checks")


# --- Cost management (the four `ce` probes are billed) --------------------

def _p_cost_explorer(c) -> ProbeReading:
    r = c.get_cost_and_usage(
        TimePeriod={"Start": _day(-2), "End": _day(0)},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
    ).get("ResultsByTime", [])
    return ProbeReading(found=bool(r), exact_count=len(r), unit="daily periods")


def _p_cost_resources(c) -> ProbeReading:
    # GetCostAndUsageWithResources rejects any query without RESOURCE_ID in the
    # Filter or GroupBy, and only supports the trailing 14 days.
    r = c.get_cost_and_usage_with_resources(
        TimePeriod={"Start": _day(-2), "End": _day(-1)},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
        Filter={"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock"]}},
        GroupBy=[{"Type": "DIMENSION", "Key": "RESOURCE_ID"}],
    ).get("ResultsByTime", [])
    return ProbeReading(found=bool(r), unit="resource-level periods")


def _p_cost_forecast(c) -> ProbeReading:
    # Raises DataUnavailableException when the account lacks enough history,
    # which _classify maps to not_enabled rather than a red error.
    total = c.get_cost_forecast(
        TimePeriod={"Start": _day(1), "End": _day(30)},
        Metric="UNBLENDED_COST",
        Granularity="MONTHLY",
    ).get("Total")
    return ProbeReading(found=bool(total), unit="forecast")


def _p_cost_anomalies(c) -> ProbeReading:
    a = c.get_anomalies(
        DateInterval={"StartDate": _day(-30), "EndDate": _day(0)}
    ).get("Anomalies", [])
    return _sample(a, "anomalies")


def _p_budgets(c) -> ProbeReading:
    return _sample(
        c.describe_budgets(AccountId=_caller_account(), MaxResults=1).get("Budgets", []),
        "budgets",
    )


def _p_compute_optimizer(c) -> ProbeReading:
    status = c.get_enrollment_status().get("status")
    if status != "Active":
        raise ProbeNotEnabled(f"Compute Optimizer enrollment status is {status or 'unknown'}")
    return ProbeReading(found=True, unit="enrollment")


# --- AVA control-plane stores --------------------------------------------
#
# These probe DynamoDB directly rather than calling the AVA service methods,
# because those methods catch ResourceNotFoundException and return an empty
# list. Measured: all four of /api/v1/deployments, /prioritization,
# /business-cases and /service-approval/runs return HTTP 200 `[]` against a
# table that does not exist in the configured region. Probing the service would
# report a missing table as "reachable, no records".

def _ddb_probe(table_attr: str, unit: str) -> Callable[[object], ProbeReading]:
    def probe(c) -> ProbeReading:
        table = getattr(settings, table_attr, "") or ""
        if not table:
            raise ProbeUnsupported(f"{table_attr} is not configured")
        # Select=COUNT with Limit=1 costs a single eventually-consistent read and
        # answers found/empty without pulling any item content. describe_table's
        # ItemCount is not usable here: it is refreshed roughly every six hours.
        try:
            resp = c.scan(TableName=table, Limit=1, Select="COUNT")
        except ClientError as exc:
            # Re-raise, not swallow: only the message is rewritten, so the error
            # code still drives classification. DynamoDB's bare "Requested
            # resource not found" gives an operator nothing to act on; naming the
            # table and region does, and this is the failure mode that actually
            # occurs (these tables are missing from the configured region).
            if _err_code(exc) == "ResourceNotFoundException":
                exc.response["Error"]["Message"] = (
                    f"DynamoDB table '{table}' does not exist in {c.meta.region_name}"
                )
            raise
        return ProbeReading(found=resp.get("Count", 0) > 0, unit=unit)

    return probe


# --------------------------------------------------------------------------
# The registry
# --------------------------------------------------------------------------

PROBE_SPECS: tuple[ProbeSpec, ...] = (
    # --- Amazon Bedrock (9) ---
    ProbeSpec("bedrock-models", "bedrock", "Foundation Models", "bedrock:ListFoundationModels",
              "bedrock", REGION_GOVERN, _p_bedrock_models),
    ProbeSpec("bedrock-runtime", "bedrock", "Runtime Metrics", "cloudwatch:ListMetrics (AWS/Bedrock)",
              "cloudwatch", REGION_GOVERN, _p_bedrock_runtime),
    ProbeSpec("bedrock-guardrails", "bedrock", "Guardrails", "bedrock:ListGuardrails",
              "bedrock", REGION_GOVERN, _p_bedrock_guardrails),
    ProbeSpec("bedrock-evals", "bedrock", "Model Evaluations", "bedrock:ListEvaluationJobs",
              "bedrock", REGION_GOVERN, _p_bedrock_evals),
    ProbeSpec("bedrock-kbs", "bedrock", "Knowledge Bases", "bedrock-agent:ListKnowledgeBases",
              "bedrock-agent", REGION_GOVERN, _p_bedrock_kbs),
    ProbeSpec("bedrock-agents", "bedrock", "Bedrock Agents", "bedrock-agent:ListAgents",
              "bedrock-agent", REGION_GOVERN, _p_bedrock_agents),
    ProbeSpec("bedrock-flows", "bedrock", "Flows", "bedrock-agent:ListFlows",
              "bedrock-agent", REGION_GOVERN, _p_bedrock_flows),
    ProbeSpec("bedrock-prompts", "bedrock", "Managed Prompts", "bedrock-agent:ListPrompts",
              "bedrock-agent", REGION_GOVERN, _p_bedrock_prompts),
    ProbeSpec("bedrock-invocation-logs", "bedrock", "Invocation Logging",
              "bedrock:GetModelInvocationLoggingConfiguration",
              "bedrock", REGION_GOVERN, _p_bedrock_invocation_logs),

    # --- Bedrock AgentCore (8) ---
    ProbeSpec("agentcore-runtimes", "agentcore", "Agent Runtimes", "bedrock-agentcore:ListAgentRuntimes",
              "bedrock-agentcore-control", REGION_GOVERN, _p_agentcore_runtimes),
    ProbeSpec("agentcore-memory", "agentcore", "Memory Stores", "bedrock-agentcore:ListMemories",
              "bedrock-agentcore-control", REGION_GOVERN, _p_agentcore_memory),
    ProbeSpec("agentcore-gateways", "agentcore", "Gateways", "bedrock-agentcore:ListGateways",
              "bedrock-agentcore-control", REGION_GOVERN, _p_agentcore_gateways),
    ProbeSpec("agentcore-policies", "agentcore", "Policy Engines", "bedrock-agentcore:ListPolicyEngines",
              "bedrock-agentcore-control", REGION_GOVERN, _p_agentcore_policies),
    ProbeSpec("agentcore-identities", "agentcore", "Workload Identities",
              "bedrock-agentcore:ListWorkloadIdentities",
              "bedrock-agentcore-control", REGION_GOVERN, _p_agentcore_identities),
    ProbeSpec("agentcore-registry", "agentcore", "Agent Registry", "agent-registry:ListRegistries",
              "agent-registry-control", REGION_GOVERN, _p_agentcore_registry),
    ProbeSpec("agentcore-metrics", "agentcore", "Runtime Metrics",
              "cloudwatch:ListMetrics (AWS/Bedrock-AgentCore)",
              "cloudwatch", REGION_GOVERN, _p_agentcore_metrics),
    ProbeSpec("verified-permissions", "agentcore", "Verified Permissions",
              "verifiedpermissions:ListPolicyStores",
              "verifiedpermissions", REGION_GOVERN, _p_verified_permissions),

    # --- Amazon SageMaker (4) ---
    ProbeSpec("sagemaker-registry", "sagemaker", "Model Registry", "sagemaker:ListModelPackages",
              "sagemaker", REGION_GOVERN, _p_sagemaker_registry),
    ProbeSpec("sagemaker-cards", "sagemaker", "Model Cards", "sagemaker:ListModelCards",
              "sagemaker", REGION_GOVERN, _p_sagemaker_cards),
    ProbeSpec("sagemaker-endpoints", "sagemaker", "Endpoints", "sagemaker:ListEndpoints",
              "sagemaker", REGION_GOVERN, _p_sagemaker_endpoints),
    ProbeSpec("sagemaker-monitor", "sagemaker", "Model Monitor", "sagemaker:ListMonitoringSchedules",
              "sagemaker", REGION_GOVERN, _p_sagemaker_monitor),

    # --- Security services (6) ---
    ProbeSpec("securityhub", "security", "Security Hub", "securityhub:GetFindings",
              "securityhub", REGION_GOVERN, _p_securityhub, read_timeout=20),
    ProbeSpec("guardduty", "security", "GuardDuty", "guardduty:ListDetectors",
              "guardduty", REGION_GOVERN, _p_guardduty, zero_means_not_enabled=True),
    ProbeSpec("inspector", "security", "Inspector", "inspector2:BatchGetAccountStatus",
              "inspector2", REGION_GOVERN, _p_inspector),
    ProbeSpec("macie", "security", "Macie", "macie2:GetMacieSession",
              "macie2", REGION_GOVERN, _p_macie),
    ProbeSpec("access-analyzer", "security", "IAM Access Analyzer", "access-analyzer:ListAnalyzers",
              "accessanalyzer", REGION_GOVERN, _p_access_analyzer, zero_means_not_enabled=True),
    ProbeSpec("detective", "security", "Detective", "detective:ListGraphs",
              "detective", REGION_GOVERN, _p_detective, zero_means_not_enabled=True),

    # --- Observability (7) ---
    ProbeSpec("cloudwatch-metrics", "observability", "CloudWatch Metrics", "cloudwatch:ListMetrics",
              "cloudwatch", REGION_GOVERN, _p_cloudwatch_metrics),
    ProbeSpec("cloudwatch-logs", "observability", "CloudWatch Logs", "logs:DescribeLogGroups",
              "logs", REGION_GOVERN, _p_cloudwatch_logs),
    ProbeSpec("cloudtrail", "observability", "CloudTrail", "cloudtrail:LookupEvents",
              "cloudtrail", REGION_GOVERN, _p_cloudtrail),
    ProbeSpec("xray", "observability", "X-Ray", "xray:GetTraceSummaries",
              "xray", REGION_GOVERN, _p_xray),
    ProbeSpec("cloudtrail-lake", "observability", "CloudTrail Lake", "cloudtrail:ListEventDataStores",
              "cloudtrail", REGION_GOVERN, _p_cloudtrail_lake),
    ProbeSpec("aws-health", "observability", "AWS Health", "health:DescribeEventAggregates",
              "health", REGION_GLOBAL, _p_aws_health),
    ProbeSpec("service-quotas-ai", "observability", "AI Capacity Quotas",
              "servicequotas:ListServiceQuotas",
              "service-quotas", REGION_GOVERN, _p_service_quotas),

    # --- Compliance & Config (5) ---
    ProbeSpec("config", "compliance", "AWS Config", "config:DescribeConfigurationRecorders",
              "config", REGION_GOVERN, _p_config),
    ProbeSpec("config-rules", "compliance", "Config Rule Details", "config:DescribeConfigRules",
              "config", REGION_GOVERN, _p_config_rules),
    ProbeSpec("resource-tags", "compliance", "Resource Groups Tagging", "tag:GetResources",
              "resourcegroupstaggingapi", REGION_GOVERN, _p_resource_tags),
    ProbeSpec("security-lake", "compliance", "Security Lake", "securitylake:ListDataLakes",
              "securitylake", REGION_GOVERN, _p_security_lake),
    ProbeSpec("trusted-advisor", "compliance", "Trusted Advisor",
              "support:DescribeTrustedAdvisorChecks",
              "support", REGION_GLOBAL, _p_trusted_advisor, read_timeout=20),

    # --- Cost management (6; the four `ce` probes cost $0.01 per call) ---
    ProbeSpec("cost-explorer", "cost", "Cost Explorer", "ce:GetCostAndUsage",
              "ce", REGION_GLOBAL, _p_cost_explorer,
              billed_usd=0.01, ttl=_BILLED_TTL, read_timeout=20),
    ProbeSpec("cost-resources", "cost", "Resource-Level Cost", "ce:GetCostAndUsageWithResources",
              "ce", REGION_GLOBAL, _p_cost_resources,
              billed_usd=0.01, ttl=_BILLED_TTL, read_timeout=20),
    ProbeSpec("cost-forecast", "cost", "Cost Forecast", "ce:GetCostForecast",
              "ce", REGION_GLOBAL, _p_cost_forecast,
              billed_usd=0.01, ttl=_BILLED_TTL, read_timeout=20),
    ProbeSpec("cost-anomalies", "cost", "Cost Anomalies", "ce:GetAnomalies",
              "ce", REGION_GLOBAL, _p_cost_anomalies,
              billed_usd=0.01, ttl=_BILLED_TTL, read_timeout=20),
    ProbeSpec("budgets", "cost", "Budgets", "budgets:DescribeBudgets",
              "budgets", REGION_GLOBAL, _p_budgets),
    ProbeSpec("compute-optimizer", "cost", "Compute Optimizer", "compute-optimizer:GetEnrollmentStatus",
              "compute-optimizer", REGION_GOVERN, _p_compute_optimizer),

    # --- AVA control plane (5) ---
    ProbeSpec("ava-deployments", "ava", "Deployments", "dynamodb:Scan (deployments)",
              "dynamodb", REGION_CONTROL, _ddb_probe("DEPLOYMENTS_TABLE_NAME", "deployments"),
              table_key="DEPLOYMENTS"),
    ProbeSpec("ava-usecases", "ava", "Use Cases", "dynamodb:Scan (prioritization)",
              "dynamodb", REGION_CONTROL, _ddb_probe("PRIORITIZATION_TABLE_NAME", "use cases"),
              table_key="PRIORITIZATION"),
    ProbeSpec("ava-businesscases", "ava", "Business Cases", "dynamodb:Scan (business-cases)",
              "dynamodb", REGION_CONTROL, _ddb_probe("BUSINESS_CASES_TABLE_NAME", "business cases"),
              table_key="BUSINESS_CASES"),
    ProbeSpec("ava-approvals", "ava", "Service Approvals", "dynamodb:Scan (service-approval)",
              "dynamodb", REGION_CONTROL, _ddb_probe("SERVICE_APPROVAL_TABLE_NAME", "approval runs"),
              table_key="SERVICE_APPROVAL"),
    ProbeSpec("ava-guardrails", "ava", "Guardrail Configs", "dynamodb:Scan (guardrails)",
              "dynamodb", REGION_CONTROL, _ddb_probe("GUARDRAILS_TABLE_NAME", "guardrail templates"),
              table_key="GUARDRAILS"),
)

SPECS_BY_ID: dict[str, ProbeSpec] = {s.source_id: s for s in PROBE_SPECS}


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------


def _err_code(exc: BaseException) -> str:
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        return response.get("Error", {}).get("Code", "") or ""
    return ""


def _err_message(exc: BaseException) -> str:
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        return response.get("Error", {}).get("Message", "") or str(exc)
    return str(exc)


def _classify_reading(spec: ProbeSpec, reading: ProbeReading) -> tuple[str, Optional[str]]:
    """Turn a successful reading into a status plus a human detail line."""
    if reading.subcalls_total is not None and reading.subcalls_reached is not None:
        reached, total = reading.subcalls_reached, reading.subcalls_total
        if 0 < reached < total:
            return STATUS_DEGRADED, f"{reached}/{total} sub-calls reached"

    if reading.found:
        if reading.exact_count is not None:
            detail = f"{reading.exact_count} {reading.unit or 'records'}"
        else:
            detail = f"{spec.api.split(':', 1)[0]} returned {reading.unit or 'records'}"
        if reading.detail:
            detail = f"{detail} · {reading.detail}"
        return STATUS_CONNECTED, detail

    # Zero records. For most sources this is the clean-estate case the user
    # explicitly wants shown as connected. For the handful where zero rows IS
    # the disablement signal, it is not_enabled instead.
    if spec.zero_means_not_enabled:
        return STATUS_NOT_ENABLED, f"reachable · no {reading.unit or 'records'} — service not enabled here"
    detail = f"reachable · 0 {reading.unit or 'records'}"
    if reading.detail:
        detail = f"{detail} · {reading.detail}"
    return STATUS_CONNECTED_EMPTY, detail


def _classify_exception(exc: BaseException) -> tuple[str, Optional[str], Optional[str], str]:
    """Map an exception to (status, error_code, error_message, remediation)."""
    if isinstance(exc, ProbeNotEnabled):
        return STATUS_NOT_ENABLED, None, sanitize_error(str(exc)), "enable-service"
    if isinstance(exc, ProbeUnsupported):
        return STATUS_NOT_PROBED, None, sanitize_error(str(exc)), "none"
    if isinstance(exc, (UnknownServiceError, DataNotFoundError)):
        # No botocore service model for this API in the installed version, so no
        # reachability signal can exist. Not an error in the account.
        return STATUS_NOT_PROBED, None, "No botocore service model for this API", "upgrade-botocore"
    if isinstance(exc, NoCredentialsError):
        return STATUS_ERROR, "NoCredentials", "No AWS credentials available", "configure-credentials"

    code = _err_code(exc)
    message = sanitize_error(_err_message(exc))
    if code in DENIAL_CODES:
        lowered = message.lower()
        if any(hint in lowered for hint in _NOT_ENABLED_HINTS):
            # Demotion only: access_denied -> not_enabled. Both are non-green, so
            # a wrong match changes the remediation hint, never the count.
            return STATUS_NOT_ENABLED, code, message, "enable-service"
        return STATUS_ACCESS_DENIED, code, message, "grant-iam"
    if code in NOT_ENABLED_CODES:
        return STATUS_NOT_ENABLED, code, message, "enable-service"
    if code in NOT_PROVISIONED_CODES:
        return STATUS_ERROR, code, message, "provision-resource"
    if code in RETRYABLE_CODES:
        return STATUS_ERROR, code, message, "retry"
    if isinstance(exc, BotoCoreError):
        return STATUS_ERROR, type(exc).__name__, message, "retry"
    return STATUS_ERROR, code or type(exc).__name__, message, "investigate"


# --------------------------------------------------------------------------
# Execution + cache
# --------------------------------------------------------------------------

_cache: dict[str, tuple[dict, float]] = {}
_cache_lock = threading.Lock()


def clear_probe_cache() -> int:
    """Drop every cached probe result. Returns how many were dropped."""
    with _cache_lock:
        count = len(_cache)
        _cache.clear()
    return count


def run_probe(spec: ProbeSpec) -> dict:
    """Execute one probe and return its result dict. Never raises."""
    region = _resolve_region(spec.region_kind, spec.table_key)
    started = time.time()
    billed = 0.0
    try:
        client = _client(spec.boto_service, region, spec.read_timeout)
        billed = spec.billed_usd
        reading = spec.call(client)
        status, detail = _classify_reading(spec, reading)
        error_code = error_message = None
        remediation = "none"
        found = reading.found
        exact_count = reading.exact_count
    except Exception as exc:  # noqa: BLE001 - classification is the whole point
        status, error_code, error_message, remediation = _classify_exception(exc)
        detail = None
        found = None
        exact_count = None
        if status in (STATUS_NOT_PROBED,):
            billed = 0.0
        logger.info(
            "data-source probe %s -> %s (%s)", spec.source_id, status, error_code or "n/a"
        )

    return {
        "source_id": spec.source_id,
        "group": spec.group,
        "label": spec.label,
        "status": status,
        "api": spec.api,
        "region": region,
        "detail": detail,
        "found": found,
        "exact_count": exact_count,
        "error_code": error_code,
        "error": error_message,
        "remediation": remediation,
        "latency_ms": int((time.time() - started) * 1000),
        "billed_usd": billed,
        "checked_at": time.time(),
        "from_cache": False,
        "cache_age_s": 0,
    }


def _cached_or_run(spec: ProbeSpec) -> dict:
    ttl = spec.ttl
    with _cache_lock:
        entry = _cache.get(spec.source_id)
    if entry is not None:
        result, stored_at = entry
        # A failure is held for at most a minute: a transient throttle must not
        # be pinned for the full TTL, and a fixed IAM grant should show up fast.
        effective_ttl = ttl if result["status"] in CONNECTED_STATUSES else min(ttl, _FAILURE_TTL)
        age = time.time() - stored_at
        if age < effective_ttl:
            # Copy before stamping. The cache holds this dict, so mutating it
            # would accrete `cache_age_s` onto the stored entry on every hit.
            return {**result, "from_cache": True, "cache_age_s": int(age), "billed_usd": 0.0}

    result = run_probe(spec)
    with _cache_lock:
        _cache[spec.source_id] = (result, time.time())
    return result


def run_all_probes(max_workers: int = 12) -> dict[str, dict]:
    """Run every registered probe, in parallel, honouring the per-source cache."""
    from concurrent.futures import ThreadPoolExecutor

    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        for result in pool.map(_cached_or_run, PROBE_SPECS):
            results[result["source_id"]] = result
    return results


def summarize(results: dict[str, dict], catalog_total: Optional[int] = None) -> dict:
    """Build the honest summary counts.

    The denominator is the number of sources actually PROBED, never the size of
    the catalog. A source with no reachability signal is removed from both the
    numerator and the denominator and surfaced as its own `not_probed` count, so
    it is neither claimed as working nor counted as a failure.

    The numerator is `reachable`, and the per-status tallies live in a nested
    `by_status` map keyed by the exact status strings. Those two namespaces are
    kept apart deliberately: an earlier draft published a flat summary with a
    top-level `connected` holding the numerator (43) next to a `connected_empty`
    of 7, while only 36 rows actually carried `status == "connected"`. Any
    consumer that summed the two flat fields got 50 - the catalog size - and
    reproduced the "50/50 connected" overclaim this module exists to remove.
    Read the numerator from `reachable`; read row tallies from `by_status`.
    """
    by_status: dict[str, int] = {s: 0 for s in ALL_STATUSES}
    for r in results.values():
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1

    not_probed = by_status.get(STATUS_NOT_PROBED, 0)
    probed = len(results) - not_probed
    reachable = sum(by_status.get(s, 0) for s in CONNECTED_STATUSES)

    checked = [r["checked_at"] - r.get("cache_age_s", 0) for r in results.values()]
    return {
        "reachable": reachable,
        "by_status": by_status,
        "not_probed": not_probed,
        "probed": probed,
        "total": catalog_total if catalog_total is not None else len(results),
        # Green only when every probed source is connected AND nothing is
        # unprobeable. Any weaker rule lets an unverified source read as verified.
        "all_connected": probed > 0 and reachable == probed and not_probed == 0,
        "verified_at": min(checked) if checked else None,
        "stale": any(
            r.get("from_cache") and r.get("cache_age_s", 0) > SPECS_BY_ID[sid].ttl / 2
            for sid, r in results.items()
            if sid in SPECS_BY_ID
        ),
        "billed_usd": round(sum(r.get("billed_usd") or 0.0 for r in results.values()), 4),
        "regions": {
            "govern": _resolve_region(REGION_GOVERN),
            "control": _resolve_region(REGION_CONTROL),
            "global": _GLOBAL_REGION,
        },
    }
