"""Govern Developer AI service — queries CloudWatch for Claude Code / AI tool telemetry.

Reads OpenTelemetry metrics shipped to CloudWatch via the AWS Distro for
OpenTelemetry (ADOT) collector. Claude Code (and similar tools) emit:

Developer-assisted metrics:
- claude_code.token.usage (dimensions: type=input|output, user.id, team.id, ...)
- claude_code.cost.usage (dimensions: user.id, team.id, ...)
- claude_code.session.count (dimensions: user.id, tool, ...)

Agentic coding metrics (autonomous AI coding):
- claude_code.agent.task.count (dimensions: user, repo.name, repo.org, autonomy_level)
- claude_code.agent.task.duration (dimensions: user, repo.name, repo.org)
- claude_code.agent.commits (dimensions: user, repo.name, repo.org, approval.status)
- claude_code.agent.files_modified (dimensions: user, repo.name, repo.org, file_type)
- claude_code.agent.lines_added / lines_removed
- claude_code.agent.pr_created (dimensions: user, repo.name, repo.org, approval.status)

This service queries those metrics, aggregates by user/team/repo, detects anomalies,
identifies shadow AI (unapproved tools, unknown users), and surfaces governance risks
from agentic coding (unapproved commits, sensitive file changes, scope violations).

Follows the Govern slice pattern: lazy boto3, TTL cache, graceful fallback, live flag.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, NamedTuple, Optional, Set, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.cloudtrail_paging import (
    BEDROCK_INVOKE_EVENT_NAMES,
    LOOKUP_FAILED_MARKER,
    lookup_events_paged,
)
from core.security_utils import mask_arn
from core.ttl_cache import get_or_load
from core.model_pricing import ModelRate, price_tokens, rate_for_model
from core.ai_tool_provenance import (
    BEDROCK_EVENT_SOURCES,
    CallPath,
    CoverageRatio,
    InstallProvenance,
    ProvenanceCoverage,
    ProvenanceRecord,
    ToolClass,
    attribute_host,
    classify_call_path,
    classify_install,
    classify_tool,
    detect_exec_env,
    summarise,
)
from models.govern_developer_ai import (
    AgentPolicy,
    AgenticCodingActivity,
    AiToolProvenanceRecord,
    AiToolProvenanceResponse,
    CoverageRatioModel,
    ProvenanceCoverageModel,
    AgenticCodingGovernanceRisk,
    AgenticRepoActivity,
    AgenticUserActivity,
    AnomaliesResponse,
    ApprovalStatus,
    AutonomyLevel,
    DeveloperAIPostureResponse,
    DeveloperUsageByTeam,
    DeveloperUsageByUser,
    DeveloperUsageResponse,
    DeveloperUsageTrend,
    DeveloperUser,
    DeveloperUsersResponse,
    LocalAgentConfig,
    LocalAgentDiscoveryResponse,
    LocalAgentToolSummary,
    CostAttributionResponse,
    CostByModel,
    CostByTool,
    CostByUser,
    CostTrend,
    PolicyEvaluationResult,
    PolicyListResponse,
    PolicyStatus,
    PolicyUpdateRequest,
    PolicyViolation,
    ShadowAIFinding,
    ShadowAIResponse,
    ShadowAiDetection,
    ShadowAiUnapprovedUser,
    ShadowAiUnknownTool,
    ShadowAiUnapprovedModel,
    UnapprovedAgenticAction,
    UsageAnomaly,
)

logger = logging.getLogger(__name__)

# CloudWatch metrics are delayed ~5 min; 10-min TTL keeps the surface snappy.
_DEVELOPER_AI_TTL = 600

# Default metric namespace for Claude Code OTel export
DEFAULT_NAMESPACE = "claude_code"

# ──────────────────────────────────────────────────────────────────────────────
# Bedrock token measurement — the ONLY real source of per-call token counts
# ──────────────────────────────────────────────────────────────────────────────
# CloudTrail management events for Bedrock carry NO token data: requestParameters
# holds only modelId/inferenceConfig and responseElements is null (verified on
# live Converse events). Anything that needs tokens therefore has to read the
# Bedrock model-invocation log group instead — see _fetch_invocation_tokens.
_INVOCATION_TOKENS_TTL = 300   # Logs Insights queries are not free
_INSIGHTS_TIMEOUT_S = 25       # cap our own poll loop per query
_INSIGHTS_POLL_S = 0.6

# The CloudTrail page size and the page/time bounds live in core/cloudtrail_paging,
# which owns the paging pass for this service, govern_aidlc_service, and
# govern_trail_service. In short: lookup_events SERVER-CLAMPS MaxResults to 50
# regardless of what is requested (verified: asking for 200 returns 50 plus a
# NextToken), so paging is mandatory - a single call sees ~3% of a week of Bedrock
# traffic - and botocore will not flag the over-max value, because its range_check()
# validates `min` and never `max`.
#
# The paging pass is the slow part of every CloudTrail-backed cut, and both the
# shadow-AI and cost-attribution paths want the same window, so the event list is
# cached once and shared instead of paged twice per TTL.
_CT_EVENTS_TTL = 300
# Re-exported, not redefined. The cache predicate below tests for this substring in the
# note that core/cloudtrail_paging builds, so two independent string literals would be a
# silent drift: the predicate would stop matching and start caching failures as though
# they were measured zeros.
_CT_LOOKUP_FAILED_MARKER = LOOKUP_FAILED_MARKER

# Bedrock model-invocation event names.
#
# WHY BY EventName AND NOT BY EventSource: InvokeModel/Converse are CloudTrail
# *data* events. In an account without Bedrock data events enabled,
# EventSource=bedrock-runtime.amazonaws.com returns ZERO events (verified), and
# EventSource=bedrock.amazonaws.com returns overwhelmingly control-plane noise
# (ListGuardrails, GetKnowledgeBase, ...) that has to be paged past to reach any
# invocation. Looking up by EventName finds invocations wherever they landed and
# skips the noise entirely; the parsed eventSource is still checked afterwards so
# a same-named event from another service can never be counted as Bedrock usage.
#
# Aliased to the shared tuple for the same anti-drift reason as the marker above: this
# file filters parsed events against these names AFTER the lookup, so a local copy that
# gained or lost a name would quietly discard events the lookup had just paid to fetch.
_BEDROCK_INVOKE_EVENTS = BEDROCK_INVOKE_EVENT_NAMES
_BEDROCK_EVENT_SOURCES = ("bedrock.amazonaws.com", "bedrock-runtime.amazonaws.com")

# Cross-region inference prefix on model ids (us.anthropic.…, eu.amazon.…).
_REGION_PREFIX = re.compile(r"^(us|eu|apac|us-gov)\.")

# Repo-name tokenizer for production detection (see _is_production_repo).
_REPO_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


def _cache_note(result, cached_at: float):
    """Stamp 'cached as of' age onto a live response."""
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


def _short_model(identifier: Optional[str]) -> str:
    """Reduce a model id / ARN to a readable, join-safe model name.

    Matches govern_invocation_safety_service._short_model exactly, which is
    load-bearing: CloudTrail's requestParameters.modelId and the invocation
    log's modelId are normalized with this same function so the two sources can
    be joined on the model key. Takes the segment after the last '/' (keeping
    any ':version' suffix, NOT splitting on ':' which would leave just '0'),
    then strips the cross-region inference prefix.

    It is also the account-id defence on this path: modelId is frequently an
    inference-profile ARN (arn:aws:bedrock:region:ACCOUNT:inference-profile/…),
    so reducing to the tail strips the account id before the value can reach a
    response field or an evidence string.
    """
    if not identifier:
        return "unknown"
    name = identifier.rsplit("/", 1)[-1]
    return _REGION_PREFIX.sub("", name)


def _identity_key(arn: Optional[str]) -> str:
    """Reduce an invocation-log identity.arn to CloudTrail's `Username` value.

    This is the join key between the two sources. CloudTrail reports `Username`
    as the STS session name (or the IAM user name), which is exactly the last
    '/' segment of the invocation log's identity.arn — verified across every
    identity in this account, for both assumed-role sessions and IAM users.
    mask_arn() performs precisely that reduction and drops the account id.
    """
    return mask_arn(arn) or "unknown"


def _to_int_or_none(value) -> Optional[int]:
    """Coerce a Logs Insights scalar to int, or None when absent/blank/malformed.

    Keeping None distinct from 0 is REQUIRED here. Logs Insights omits a field
    key entirely from a result row when no record carried that field (e.g.
    embedding models emit no output.outputTokenCount), whereas a genuinely
    measured zero comes back as the string "0" (e.g. guardrail-blocked calls
    that consumed no tokens). Coercing absent->0 would report those two very
    different situations identically.
    """
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _sum_opt(a: Optional[int], b: Optional[int]) -> Optional[int]:
    """Add two possibly-unmeasured counts, preserving 'unmeasured' as None.

    A sum is None only when EVERY contributing value is None, so rolling up
    across models can never manufacture a 0 out of missing data.
    """
    if a is None:
        return b
    if b is None:
        return a
    return a + b


def _join_capped(values, limit: int = 8) -> str:
    """Join a set of identities/models for an evidence string, bounded.

    Load-bearing since CloudTrail lookup was properly paginated: one Bedrock
    Knowledge Base row can attribute 100+ distinct per-call STS session names to
    a single model, and an unbounded join put ~9 KB of session ids into one
    response field. Cap the join and say how many were elided.
    """
    items = sorted(values)
    if len(items) <= limit:
        return ", ".join(items)
    return ", ".join(items[:limit]) + f", +{len(items) - limit} more"


class _Tokens(NamedTuple):
    """Measured call/token counts for one aggregation key. None == unmeasured."""

    calls: int
    input: Optional[int]
    output: Optional[int]

    @property
    def total(self) -> Optional[int]:
        return _sum_opt(self.input, self.output)


def _merge_tokens(existing: Optional[_Tokens], incoming: _Tokens) -> _Tokens:
    if existing is None:
        return incoming
    return _Tokens(
        existing.calls + incoming.calls,
        _sum_opt(existing.input, incoming.input),
        _sum_opt(existing.output, incoming.output),
    )


class _InvocationTokens(NamedTuple):
    """Measured Bedrock token counts, keyed several ways for attribution.

    available=False means no token counts could be measured at all; `reason` is
    then a user-facing explanation for the response `note`. Callers must emit
    None tokens / None cost in that case — never a substitute estimate.
    """

    available: bool
    reason: Optional[str]
    by_model: Dict[str, _Tokens]
    by_identity: Dict[str, _Tokens]
    by_identity_model: Dict[Tuple[str, str], _Tokens]
    by_date_model: Dict[Tuple[str, str], _Tokens]

    @property
    def total_calls(self) -> int:
        return sum(t.calls for t in self.by_model.values())


_NO_TOKENS = _InvocationTokens(False, None, {}, {}, {}, {})


# ──────────────────────────────────────────────────────────────────────────────
# AI tool provenance helpers
#
# How many managed hosts get a package-inventory read per request. `list_inventory_entries`
# is one API call per host, so an unbounded fleet would make the endpoint unusable. Hosts
# past the cap are excluded from BOTH sides of the package-inventory ratio — not counted as
# uninventoried, which would report a coverage failure that is really a sampling choice.
# ──────────────────────────────────────────────────────────────────────────────

_PROVENANCE_INVENTORY_HOST_CAP = 50


@dataclass
class _ProvenanceCalls:
    """CloudTrail-derived call records plus the raw call count behind them."""

    records: List[ProvenanceRecord]
    calls_observed: int
    live: bool


@dataclass
class _EndpointInventory:
    """The managed-host set and everything derived from it.

    `managed_hosts is None` means the inventory could not be read; an empty set means it
    was read and nothing is managed. Downstream both give `unknown_host`, but only the
    second is a measurement, and the coverage note says which happened.
    """

    managed_hosts: Optional[Set[str]]
    managed_count: int
    host_total: int
    ip_to_instance: Dict[str, str]
    host_applications: Dict[str, Set[str]]
    hosts_with_applications: int
    note: Optional[str] = None
    inventory_note: Optional[str] = None


@dataclass
class _DnsCoverage:
    """VPC-level DNS query logging coverage. Gates the `public_api` classification."""

    total_vpcs: int
    logged_vpcs: int
    note: Optional[str] = None


def _coverage_ratio_model(ratio: CoverageRatio) -> CoverageRatioModel:
    """Serialise a coverage ratio, carrying `pct=None` through rather than coercing to 0."""
    return CoverageRatioModel(
        covered=ratio.covered,
        total=ratio.total,
        label=ratio.label,
        unit=ratio.unit,
        pct=ratio.pct,
        complete=ratio.complete,
        note=ratio.note,
    )


def _coverage_model(coverage: ProvenanceCoverage) -> ProvenanceCoverageModel:
    return ProvenanceCoverageModel(
        endpoint=_coverage_ratio_model(coverage.endpoint),
        dns=_coverage_ratio_model(coverage.dns),
        call_path=_coverage_ratio_model(coverage.call_path),
        package_inventory=_coverage_ratio_model(coverage.package_inventory),
        unattributed_callers=coverage.unattributed_callers,
        blind_spots=coverage.blind_spots,
    )


def _provenance_record_model(rec: ProvenanceRecord) -> AiToolProvenanceRecord:
    """Serialise one provenance record. Enum values go over the wire as their strings."""
    return AiToolProvenanceRecord(
        principal=rec.principal,
        tool=rec.tool,
        version=rec.version,
        icon=rec.icon,
        tool_class=rec.tool_class.value,
        call_path=rec.call_path.value,
        install_provenance=rec.install.value,
        provider=rec.provider,
        exec_env=rec.exec_env,
        host_id=rec.host_id,
        source_ip=rec.source_ip,
        user_agent=rec.user_agent,
        requests=rec.requests,
        models=sorted(rec.models),
        first_seen=rec.first_seen,
        last_seen=rec.last_seen,
        governed=rec.is_governed,
        needs_attention=rec.needs_attention,
        tool_evidence=rec.tool_evidence,
        call_path_evidence=rec.call_path_evidence,
        install_evidence=rec.install_evidence,
        host_evidence=rec.host_evidence,
    )


class GovernDeveloperAIService:
    """Service for querying developer AI usage from CloudWatch metrics."""

    def __init__(
        self,
        region: str = "us-east-1",
        namespace: str = DEFAULT_NAMESPACE,
        approved_tools: Optional[List[str]] = None,
        approved_user_domains: Optional[List[str]] = None,
        spend_spike_threshold: float = 2.0,
        runaway_token_rate: int = 100000,
    ):
        self.region = region
        self.namespace = namespace
        self._client = None  # lazy — don't touch AWS until first query
        self._logs_client = None
        self._bedrock_client = None
        # Shadow AI detection config
        self.approved_tools = approved_tools or ["claude-code"]
        self.approved_user_domains = approved_user_domains or []
        # Anomaly thresholds
        self.spend_spike_threshold = spend_spike_threshold  # current hour > N x 24h avg
        self.runaway_token_rate = runaway_token_rate  # tokens/hour threshold

    def _cw(self):
        """Lazy CloudWatch client."""
        if self._client is None:
            self._client = boto3.client("cloudwatch", region_name=self.region)
        return self._client

    def _logs(self):
        """Lazy CloudWatch Logs client for Insights queries."""
        if self._logs_client is None:
            self._logs_client = boto3.client("logs", region_name=self.region)
        return self._logs_client

    def _bedrock(self):
        """Lazy Bedrock control-plane client (invocation-logging config only)."""
        if self._bedrock_client is None:
            self._bedrock_client = boto3.client("bedrock", region_name=self.region)
        return self._bedrock_client

    # =========================================================================
    # Bedrock model-invocation token measurement
    # =========================================================================

    def _invocation_log_group(self) -> Tuple[Optional[str], Optional[str]]:
        """Resolve the configured Bedrock model-invocation CloudWatch log group.

        There is deliberately no constant for this name — it is whatever the
        account set via PutModelInvocationLoggingConfiguration, so it is read
        back from the API, the same way govern_invocation_safety_service resolves
        it. Hardcoding it would silently break in any account that named it
        differently.

        Returns (log_group, reason_unavailable) — exactly one is non-None.
        """
        try:
            cfg = self._bedrock().get_model_invocation_logging_configuration()
            cw = (cfg.get("loggingConfig") or {}).get("cloudWatchConfig") or {}
            group = cw.get("logGroupName")
            if not group:
                return None, (
                    "Bedrock model-invocation logging has no CloudWatch destination — "
                    "enable it to measure token usage."
                )
            return group, None
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Bedrock invocation logging config unavailable: %s", e)
            return None, "Bedrock model-invocation logging configuration is unreadable."

    def _run_insights(self, log_group: str, start: int, end: int, query: str) -> List[list]:
        """Run one Logs Insights query and return its rows (bounded poll)."""
        logs = self._logs()
        qid = logs.start_query(
            logGroupName=log_group, startTime=start, endTime=end, queryString=query,
        )["queryId"]
        waited = 0.0
        while waited < _INSIGHTS_TIMEOUT_S:
            resp = logs.get_query_results(queryId=qid)
            status = resp.get("status")
            if status == "Complete":
                return resp.get("results", [])
            if status in ("Failed", "Cancelled", "Timeout"):
                logger.warning("Invocation-token query %s ended: %s", qid, status)
                return []
            time.sleep(_INSIGHTS_POLL_S)
            waited += _INSIGHTS_POLL_S
        try:
            logs.stop_query(queryId=qid)   # don't leave our own timeout running
        except (ClientError, BotoCoreError):
            pass
        return []

    def get_invocation_tokens(self, days: int) -> _InvocationTokens:
        """Cached measured token counts from the Bedrock invocation log group.

        Shared by shadow-AI detection and cost attribution so both cuts agree on
        the same measured numbers instead of each inventing its own estimate.
        Only a successful measurement is cached, so a transient Logs failure does
        not pin an empty result for the whole TTL.
        """
        result, _ = get_or_load(
            f"developer-ai:invocation-tokens:{self.region}:{days}",
            _INVOCATION_TOKENS_TTL,
            lambda: self._fetch_invocation_tokens(days),
            should_cache=lambda r: r.available,
        )
        return result

    def _fetch_invocation_tokens(self, days: int) -> _InvocationTokens:
        """Measure real token counts from the Bedrock model-invocation logs.

        Two Logs Insights aggregations run in parallel:
          - by identity.arn + modelId  → who used what, and how many tokens
          - by bin(1d) + modelId      → the daily trend

        The per-identity rows are rolled up locally into by_model / by_identity
        so one query serves three cuts. Every token value stays int|None all the
        way through (see _to_int_or_none / _sum_opt): a model that reports no
        output tokens must not become "0 output tokens".
        """
        log_group, reason = self._invocation_log_group()
        if not log_group:
            return _InvocationTokens(False, reason, {}, {}, {}, {})
        try:
            now = datetime.now(timezone.utc)
            end = int(now.timestamp())
            start = int((now - timedelta(days=days)).timestamp())
            agg = (
                "stats count(*) as calls, sum(input.inputTokenCount) as inTok, "
                "sum(output.outputTokenCount) as outTok by "
            )
            queries = {
                "identity_model": agg + "identity.arn, modelId | limit 10000",
                "date_model": agg + "bin(1d) as day, modelId | limit 10000",
            }
            results: Dict[str, list] = {}
            with ThreadPoolExecutor(max_workers=len(queries)) as pool:
                futures = {
                    pool.submit(self._run_insights, log_group, start, end, q): name
                    for name, q in queries.items()
                }
                for fut in as_completed(futures):
                    name = futures[fut]
                    try:
                        results[name] = fut.result()
                    except Exception as e:   # one query failing must not lose the other
                        logger.warning("Invocation-token query %s failed: %s", name, e)
                        results[name] = []

            by_model: Dict[str, _Tokens] = {}
            by_identity: Dict[str, _Tokens] = {}
            by_identity_model: Dict[Tuple[str, str], _Tokens] = {}
            by_date_model: Dict[Tuple[str, str], _Tokens] = {}

            for row in results.get("identity_model", []):
                d = {f["field"]: f["value"] for f in row}
                tok = _Tokens(
                    int(float(d.get("calls", 0) or 0)),
                    _to_int_or_none(d.get("inTok")),
                    _to_int_or_none(d.get("outTok")),
                )
                model = _short_model(d.get("modelId"))
                ident = _identity_key(d.get("identity.arn"))
                by_model[model] = _merge_tokens(by_model.get(model), tok)
                by_identity[ident] = _merge_tokens(by_identity.get(ident), tok)
                pair = (ident, model)
                by_identity_model[pair] = _merge_tokens(by_identity_model.get(pair), tok)

            for row in results.get("date_model", []):
                d = {f["field"]: f["value"] for f in row}
                raw_day = d.get("day") or ""
                day = raw_day.split(" ")[0].split("T")[0]
                if not day:
                    continue
                key = (day, _short_model(d.get("modelId")))
                by_date_model[key] = _merge_tokens(by_date_model.get(key), _Tokens(
                    int(float(d.get("calls", 0) or 0)),
                    _to_int_or_none(d.get("inTok")),
                    _to_int_or_none(d.get("outTok")),
                ))

            if not by_identity_model:
                return _InvocationTokens(
                    False,
                    f"Bedrock model-invocation logging is enabled but captured no "
                    f"records in the last {days}d, so token counts are unmeasured.",
                    {}, {}, {}, {},
                )
            return _InvocationTokens(
                True, None, by_model, by_identity, by_identity_model, by_date_model,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Invocation token measurement unavailable: %s", e)
            return _InvocationTokens(
                False,
                "CloudWatch Logs unreachable or logs:StartQuery not granted, so token "
                "counts are unmeasured.",
                {}, {}, {}, {},
            )

    # =========================================================================
    # CloudTrail Bedrock invocation discovery (WHO / WHICH TOOL / WHICH MODEL)
    # =========================================================================

    def _lookup_bedrock_invocation_events(self, days: int) -> Tuple[list, Optional[str]]:
        """Cached wrapper around the CloudTrail paging pass (shared by all cuts)."""
        result, _ = get_or_load(
            f"developer-ai:ct-invocation-events:{self.region}:{days}",
            _CT_EVENTS_TTL,
            lambda: self._page_bedrock_invocation_events(days),
            # NOT bool(r[0]). Truthiness on the event list is the wrong predicate: an
            # account with genuinely no Bedrock invocations in the window is a MEASURED
            # ZERO, which is live data and must cache like any other answer. Under the old
            # predicate that empty result was rejected every time, so the quietest accounts
            # paid the largest bill - a full re-page of 4 event names x up to
            # CT_MAX_PAGES pages, on every single request, for the entire life of the
            # cache entry that never existed. The only genuinely uncacheable outcome is a
            # lookup that FAILED, because then the emptiness is an artifact of the failure
            # rather than a fact about the account.
            should_cache=lambda r: _CT_LOOKUP_FAILED_MARKER not in (r[1] or ""),
        )
        return result

    def _page_bedrock_invocation_events(self, days: int) -> Tuple[list, Optional[str]]:
        """Paginate CloudTrail for Bedrock model-invocation events.

        Returns (events, truncation_note). The note is non-None when a bound was
        hit, so callers can disclose that their counts are a floor rather than
        quietly reporting a partial page as the total.

        See _BEDROCK_INVOKE_EVENTS for why this looks up by EventName rather than
        by EventSource, and core/cloudtrail_paging for the MaxResults clamp that
        makes pagination mandatory.
        """
        ct = boto3.client("cloudtrail", region_name=self.region)
        start = datetime.now(timezone.utc) - timedelta(days=days)

        # The paging, bounding, and disclosure all live in core/cloudtrail_paging now.
        # This method had its own copy of that loop, and so did govern_aidlc_service and
        # govern_trail_service - three copies, and all three had shipped the same
        # over-max MaxResults bug independently. One implementation means the next caller
        # inherits the fix instead of re-discovering the clamp.
        lookup = lookup_events_paged(
            ct,
            attribute_key="EventName",
            attribute_values=_BEDROCK_INVOKE_EVENTS,
            start_time=start,
        )
        return lookup.events, lookup.note

    # -------------------------------------------------------------------------
    # Usage
    # -------------------------------------------------------------------------

    def get_usage(self, days: int = 7) -> DeveloperUsageResponse:
        """Cached wrapper around live usage fetch."""
        key = f"developer-ai:usage:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_usage(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_usage(self, days: int = 7) -> DeveloperUsageResponse:
        """Query CloudWatch for developer AI token/cost/session metrics."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        period_start = start.strftime("%Y-%m-%d")
        period_end = end.strftime("%Y-%m-%d")

        try:
            cw = self._cw()

            # Query token usage by user
            user_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/token.usage", "user.id", start, end
            )

            # Query cost usage by user
            cost_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/cost.usage", "user.id", start, end
            )

            # Query session count by user
            session_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/session.count", "user.id", start, end
            )

            # Attribution dimensions (team.id, department, cost_center, user.email) only
            # exist on the metric definitions — grouped metric values come back keyed on
            # user.id alone. Read them from list_metrics, same as get_users() does, so the
            # by_team rollup can actually break down instead of collapsing to "unassigned".
            user_dimensions = self._discover_user_dimensions(cw)

            # Build by-user aggregation
            all_users: Set[str] = set(user_metrics.keys()) | set(cost_metrics.keys()) | set(session_metrics.keys())
            by_user: List[DeveloperUsageByUser] = []

            for user_id in all_users:
                tokens = user_metrics.get(user_id, {})
                cost = cost_metrics.get(user_id, 0.0)
                sessions = session_metrics.get(user_id, 0)

                input_tokens = int(tokens.get("input", 0))
                output_tokens = int(tokens.get("output", 0))

                dims = user_dimensions.get(user_id, {})

                by_user.append(DeveloperUsageByUser(
                    user_id=user_id,
                    email=dims.get("email"),
                    team_id=dims.get("team_id"),
                    department=dims.get("department"),
                    cost_center=dims.get("cost_center"),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    total_cost_usd=round(cost, 2),
                    session_count=sessions,
                ))

            # Sort by cost descending
            by_user.sort(key=lambda u: u.total_cost_usd, reverse=True)

            # Aggregate by team
            team_agg: dict = {}
            for u in by_user:
                tid = u.team_id or "unassigned"
                if tid not in team_agg:
                    team_agg[tid] = {
                        "users": set(), "tokens": 0, "cost": 0.0, "sessions": 0,
                        "dept": u.department, "cc": u.cost_center,
                    }
                team_agg[tid]["users"].add(u.user_id)
                team_agg[tid]["tokens"] += u.total_tokens
                team_agg[tid]["cost"] += u.total_cost_usd
                team_agg[tid]["sessions"] += u.session_count

            by_team = [
                DeveloperUsageByTeam(
                    team_id=tid,
                    department=v["dept"],
                    cost_center=v["cc"],
                    user_count=len(v["users"]),
                    total_tokens=v["tokens"],
                    total_cost_usd=round(v["cost"], 2),
                    session_count=v["sessions"],
                )
                for tid, v in team_agg.items()
            ]
            by_team.sort(key=lambda t: t.total_cost_usd, reverse=True)

            # Build daily trend
            trend = self._build_daily_trend(cw, start, end)

            # Totals
            total_input = sum(u.input_tokens for u in by_user)
            total_output = sum(u.output_tokens for u in by_user)
            total_cost = round(sum(u.total_cost_usd for u in by_user), 2)
            total_sessions = sum(u.session_count for u in by_user)

            # Get CloudTrail-based shadow AI detection
            shadow_ai = self._get_shadow_ai_from_cloudtrail(days)

            return DeveloperUsageResponse(
                total_input_tokens=total_input,
                total_output_tokens=total_output,
                total_tokens=total_input + total_output,
                total_cost_usd=total_cost,
                total_sessions=total_sessions,
                active_users=len(by_user),
                by_user=by_user,
                by_team=by_team,
                trend=trend,
                period_start=period_start,
                period_end=period_end,
                shadow_ai=shadow_ai,
                # bool() is load-bearing: the `and` returns None (not False) when
                # shadow_ai is None, which pydantic rejects for a bool field.
                live=bool(len(by_user) > 0 or (shadow_ai and shadow_ai.total_shadow_events > 0)),
                source="cloudwatch+cloudtrail" if shadow_ai else "cloudwatch",
                note=self._compose_usage_note(by_user, shadow_ai),
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch developer AI metrics unavailable: %s", e)
            # Fall back to CloudTrail-only shadow AI detection
            shadow_ai = self._get_shadow_ai_from_cloudtrail(days)
            return DeveloperUsageResponse(
                period_start=period_start,
                period_end=period_end,
                shadow_ai=shadow_ai,
                live=shadow_ai is not None and shadow_ai.total_shadow_events > 0,
                source="cloudtrail" if shadow_ai else "unavailable-fallback",
                note=self._compose_usage_note(
                    [], shadow_ai,
                    prefix="OTel metrics unavailable — shadow AI detection via CloudTrail only.",
                ),
            )

    @staticmethod
    def _compose_usage_note(by_user, shadow_ai, prefix: Optional[str] = None) -> Optional[str]:
        """Surface the shadow-AI token/cost caveats on the parent response.

        The shadow-AI block carries its own live/source/note because its token
        measurement can fail independently of the CloudTrail event discovery.
        That caveat has to reach the parent `note` too, or a caller reading only
        the top-level response would take a partial cost total at face value.
        """
        parts: List[str] = []
        if prefix:
            parts.append(prefix)
        elif not by_user:
            parts.append("No OTel metrics — shadow AI detection via CloudTrail.")
        if shadow_ai is not None and shadow_ai.note:
            parts.append(f"Shadow AI: {shadow_ai.note}")
        return " ".join(parts) if parts else None

    def _query_metric_by_dimension(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query a metric grouped by a dimension, returning {dimension_value: sum}.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            # Use list_metrics to discover available metrics with dimensions
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name.split("/")[-1],  # Strip namespace prefix if present
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []  # Track dimension info for each query

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 7,  # Aggregate over the full period
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({
                    "id": query_id,
                    "dim_value": dim_value,
                    "token_type": dims.get("type"),
                })

            if not queries:
                return {}

            # Single batched API call (get_metric_data supports up to 500 queries)
            # Process in batches of 500 if needed
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results - get_metric_data returns MetricDataResults
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    metadata = id_to_metadata[query_id]
                    dim_value = metadata["dim_value"]
                    token_type = metadata["token_type"]

                    # Sum all values in the result
                    total = sum(result.get("Values", []))

                    if dim_value in results:
                        if isinstance(results[dim_value], dict):
                            # Token metrics have input/output breakdown
                            t_type = token_type or "total"
                            results[dim_value][t_type] = results[dim_value].get(t_type, 0) + total
                        else:
                            results[dim_value] += total
                    else:
                        if token_type:
                            results[dim_value] = {token_type: total}
                        else:
                            results[dim_value] = total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Metric query failed for %s: %s", metric_name, e)
            return {}

    def _discover_user_dimensions(self, cw) -> dict:
        """Map user.id -> {email, team_id, department, cost_center} from metric definitions.

        get_metric_data only returns values keyed on the dimension we grouped by, so the
        attribution dimensions have to be read off the metric definitions themselves.
        Same list_metrics pattern _fetch_users() uses. Returns {} when nothing is exported.
        """
        attrs: dict = {}
        dimension_map = (
            ("email", "user.email"),
            ("team_id", "team.id"),
            ("department", "department"),
            ("cost_center", "cost_center"),
        )

        for metric_name in ("session.count", "token.usage", "cost.usage"):
            try:
                resp = cw.list_metrics(Namespace=self.namespace, MetricName=metric_name)
            except (ClientError, BotoCoreError) as e:
                logger.debug("Dimension discovery failed for %s: %s", metric_name, e)
                continue

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                user_id = dims.get("user.id")
                if not user_id:
                    continue
                current = attrs.setdefault(user_id, {})
                # First non-empty value wins — don't let a later metric blank out a known one
                for field, dimension in dimension_map:
                    if not current.get(field) and dims.get(dimension):
                        current[field] = dims[dimension]

        return attrs

    def _build_daily_trend(self, cw, start: datetime, end: datetime) -> List[DeveloperUsageTrend]:
        """Build daily trend data points."""
        trend = []
        try:
            # Query daily aggregates
            resp = cw.get_metric_statistics(
                Namespace=self.namespace,
                MetricName="token.usage",
                StartTime=start,
                EndTime=end,
                Period=86400,  # 1 day
                Statistics=["Sum"],
            )

            for dp in sorted(resp.get("Datapoints", []), key=lambda x: x["Timestamp"]):
                trend.append(DeveloperUsageTrend(
                    date=dp["Timestamp"].strftime("%Y-%m-%d"),
                    total_cost_usd=0,  # Would need separate cost metric query
                    session_count=0,
                ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Daily trend query failed: %s", e)

        return trend

    # -------------------------------------------------------------------------
    # Users
    # -------------------------------------------------------------------------

    def get_users(self, days: int = 30) -> DeveloperUsersResponse:
        """Cached wrapper around live users fetch."""
        key = f"developer-ai:users:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_users(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_users(self, days: int = 30) -> DeveloperUsersResponse:
        """List all users with developer AI tool usage."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        try:
            cw = self._cw()

            # Discover users from metrics
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            users: List[DeveloperUser] = []
            seen_users: Set[str] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                user_id = dims.get("user.id")
                if not user_id or user_id in seen_users:
                    continue
                seen_users.add(user_id)

                tool = dims.get("tool", "claude-code")
                approved = tool in self.approved_tools

                # Check domain approval if configured
                email = dims.get("user.email")
                if email and self.approved_user_domains:
                    domain = email.split("@")[-1] if "@" in email else None
                    if domain and domain not in self.approved_user_domains:
                        approved = False

                users.append(DeveloperUser(
                    user_id=user_id,
                    email=email,
                    team_id=dims.get("team.id"),
                    department=dims.get("department"),
                    cost_center=dims.get("cost_center"),
                    tool=tool,
                    approved=approved,
                ))

            approved_count = sum(1 for u in users if u.approved)

            return DeveloperUsersResponse(
                users=users,
                total_count=len(users),
                approved_count=approved_count,
                unapproved_count=len(users) - approved_count,
                live=len(users) > 0,
                source="cloudwatch",
                note=None if users else "No developer AI users found — verify OTel export is configured.",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch user discovery unavailable: %s", e)
            return DeveloperUsersResponse(
                users=[],
                total_count=0,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable — check IAM permissions.",
            )

    # -------------------------------------------------------------------------
    # Anomalies
    # -------------------------------------------------------------------------

    def get_anomalies(self, hours: int = 24) -> AnomaliesResponse:
        """Cached wrapper around live anomaly detection."""
        key = f"developer-ai:anomalies:{self.region}:{self.namespace}:{hours}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._detect_anomalies(hours),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _detect_anomalies(self, hours: int = 24) -> AnomaliesResponse:
        """Detect spend spikes and runaway loops in developer AI usage."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        # 7x the window for baseline, but never look back further than 90 days: at the widest
        # window (720h) an unbounded 7x would reach ~7 months back, which is no longer a
        # comparable "recent baseline". Rates are normalized per hour, so a shorter baseline
        # window stays mathematically valid.
        baseline_hours = min(hours * 7, 90 * 24)
        baseline_start = end - timedelta(hours=baseline_hours)

        anomalies: List[UsageAnomaly] = []

        try:
            cw = self._cw()

            # Detect spend spikes: current period vs baseline
            anomalies.extend(self._detect_spend_spikes(cw, start, end, baseline_start))

            # Detect runaway loops: sustained high token rate
            anomalies.extend(self._detect_runaway_loops(cw, start, end))

            # Sort by severity
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            anomalies.sort(key=lambda a: severity_order.get(a.severity, 4))

            counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for a in anomalies:
                counts[a.severity] = counts.get(a.severity, 0) + 1

            return AnomaliesResponse(
                anomalies=anomalies,
                count=len(anomalies),
                critical_count=counts["critical"],
                high_count=counts["high"],
                medium_count=counts["medium"],
                low_count=counts["low"],
                live=True,
                source="cloudwatch",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Anomaly detection failed: %s", e)
            return AnomaliesResponse(
                anomalies=[],
                count=0,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable for anomaly detection.",
            )

    def _detect_spend_spikes(
        self, cw, start: datetime, end: datetime, baseline_start: datetime
    ) -> List[UsageAnomaly]:
        """Detect users with spend > threshold x baseline average."""
        anomalies = []

        try:
            # Get current period spend by user
            current = self._query_metric_by_dimension(
                cw, "cost.usage", "user.id", start, end
            )

            # Get baseline spend by user
            baseline = self._query_metric_by_dimension(
                cw, "cost.usage", "user.id", baseline_start, start
            )

            hours_current = (end - start).total_seconds() / 3600
            hours_baseline = (start - baseline_start).total_seconds() / 3600

            for user_id, current_cost in current.items():
                if isinstance(current_cost, dict):
                    current_cost = sum(current_cost.values())

                baseline_cost = baseline.get(user_id, 0)
                if isinstance(baseline_cost, dict):
                    baseline_cost = sum(baseline_cost.values())

                # Normalize to hourly rate
                current_rate = current_cost / hours_current if hours_current > 0 else 0
                baseline_rate = baseline_cost / hours_baseline if hours_baseline > 0 else 0

                if baseline_rate > 0:
                    deviation = current_rate / baseline_rate
                    if deviation >= self.spend_spike_threshold:
                        severity = "critical" if deviation >= 5 else "high" if deviation >= 3 else "medium"
                        anomalies.append(UsageAnomaly(
                            anomaly_type="spend-spike",
                            severity=severity,
                            user_id=user_id,
                            description=f"Spend rate {deviation:.1f}x above baseline",
                            detected_at=end.isoformat(),
                            metric_value=round(current_rate, 2),
                            baseline_value=round(baseline_rate, 2),
                            deviation_factor=round(deviation, 2),
                            window_start=start.isoformat(),
                            window_end=end.isoformat(),
                        ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Spend spike detection failed: %s", e)

        return anomalies

    def _detect_runaway_loops(self, cw, start: datetime, end: datetime) -> List[UsageAnomaly]:
        """Detect sustained high token consumption indicating runaway agent loops."""
        anomalies = []

        try:
            # Get hourly token rates
            resp = cw.get_metric_statistics(
                Namespace=self.namespace,
                MetricName="token.usage",
                StartTime=start,
                EndTime=end,
                Period=3600,  # 1 hour
                Statistics=["Sum"],
            )

            for dp in resp.get("Datapoints", []):
                tokens = dp.get("Sum", 0)
                if tokens >= self.runaway_token_rate:
                    severity = "critical" if tokens >= self.runaway_token_rate * 5 else "high"
                    anomalies.append(UsageAnomaly(
                        anomaly_type="runaway-loop",
                        severity=severity,
                        description=f"High token rate ({int(tokens):,}/hour) suggests runaway agent loop",
                        detected_at=dp["Timestamp"].isoformat(),
                        metric_value=tokens,
                        baseline_value=self.runaway_token_rate,
                        deviation_factor=round(tokens / self.runaway_token_rate, 2),
                        window_start=dp["Timestamp"].isoformat(),
                        window_end=(dp["Timestamp"] + timedelta(hours=1)).isoformat(),
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Runaway loop detection failed: %s", e)

        return anomalies

    # -------------------------------------------------------------------------
    # Shadow AI (CloudTrail-based)
    # -------------------------------------------------------------------------

    def _get_shadow_ai_from_cloudtrail(self, days: int = 7) -> Optional[ShadowAiDetection]:
        """Shadow AI detection from CloudTrail Bedrock invocation events.

        Deliberately reads TWO sources, split by what each can actually prove:

        - CloudTrail (paginated, by EventName) → WHO invoked, from WHICH tool
          (userAgent) and against WHICH model. CloudTrail management events carry
          NO usage volume whatsoever: requestParameters holds only modelId and
          responseElements is null on Converse (verified live). Any token or cost
          number derived from an event COUNT here would be fabricated.
        - Bedrock model-invocation logs → the measured input/output token counts,
          per caller identity and model.

        The two are joined on identity: CloudTrail's `Username` is the STS session
        name, which is exactly the tail of the invocation log's identity.arn (see
        _identity_key). Where that join finds nothing, tokens and cost are None —
        an honest "not measured" — and the reason lands in `note`.

        The two sources count independently (CloudTrail records API calls, the log
        group records model invocations), so a user's event count and token count
        are not expected to divide evenly.
        """
        import json

        try:
            events, truncation_note = self._lookup_bedrock_invocation_events(days)
            # Measured tokens for the same window. Never blocks the event-side
            # findings: if this is unavailable, tokens/cost simply stay None.
            tokens = self.get_invocation_tokens(days)

            unapproved_users: List[ShadowAiUnapprovedUser] = []
            unknown_tools: List[ShadowAiUnknownTool] = []
            unapproved_models: List[ShadowAiUnapprovedModel] = []
            total_events = 0

            # Track seen identities to avoid duplicates
            seen_users: dict[str, dict] = {}
            seen_tools: dict[str, dict] = {}  # Keyed by userAgent
            seen_models: dict[str, dict] = {}

            for event in events:
                event_name = event.get("EventName", "")
                username = event.get("Username", "unknown")
                event_time = event.get("EventTime")

                # Only count actual model invocations as shadow AI
                if event_name not in _BEDROCK_INVOKE_EVENTS:
                    continue

                # Parse the CloudTrailEvent JSON for more details
                try:
                    ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                    request_params = ct_event.get("requestParameters") or {}
                    raw_model_id = request_params.get("modelId") or "unknown"
                    user_agent = ct_event.get("userAgent", "unknown")
                    event_source = ct_event.get("eventSource") or ""
                    # Note: sourceIPAddress is intentionally NOT collected for privacy/security
                except Exception:
                    raw_model_id = "unknown"
                    user_agent = "unknown"
                    event_source = ""

                # EventName lookup is not scoped to a service, so confirm the
                # event really came from Bedrock before attributing usage to it.
                if event_source not in _BEDROCK_EVENT_SOURCES:
                    continue

                # Normalize once, here: modelId is often an inference-profile ARN
                # that embeds the AWS account id, and this value flows into
                # response fields and evidence strings. _short_model also makes
                # the key match the invocation-log side for the token join.
                model_id = _short_model(raw_model_id)
                total_events += 1

                event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                # Parse user agent to get tool name and version
                # Examples: "claude-cli/2.1.214 (external, cli)", "Boto3/1.28.0", "aws-sdk-js/3.0"
                tool_name = user_agent.split("/")[0] if "/" in user_agent else user_agent
                tool_version = user_agent.split("/")[1].split(" ")[0] if "/" in user_agent else ""

                # Track users with their tools
                user_key = f"{username}"
                if user_key not in seen_users:
                    seen_users[user_key] = {
                        "first_seen": event_time_str,
                        "last_seen": event_time_str,
                        "events": 0,
                        "tools": set(),
                        "models": set(),
                    }
                seen_users[user_key]["events"] += 1
                seen_users[user_key]["tools"].add(tool_name)
                seen_users[user_key]["models"].add(model_id)
                # Pagination returns each event name newest-first and interleaves
                # names, so first_seen has to move DOWN as older pages arrive —
                # taking the first event observed would report the wrong date.
                if event_time_str < seen_users[user_key]["first_seen"]:
                    seen_users[user_key]["first_seen"] = event_time_str
                if event_time_str > seen_users[user_key]["last_seen"]:
                    seen_users[user_key]["last_seen"] = event_time_str

                # Track tools by userAgent (the actual calling application)
                if tool_name and tool_name not in seen_tools:
                    seen_tools[tool_name] = {
                        "full_agent": user_agent,
                        "version": tool_version,
                        "first_seen": event_time_str,
                        "last_seen": event_time_str,
                        "users": set(),
                        "requests": 0,
                        "models": set(),
                        "evidence": f"userAgent: {user_agent}",
                    }
                if tool_name:
                    seen_tools[tool_name]["users"].add(username)
                    seen_tools[tool_name]["requests"] += 1
                    seen_tools[tool_name]["models"].add(model_id)
                    if event_time_str < seen_tools[tool_name]["first_seen"]:
                        seen_tools[tool_name]["first_seen"] = event_time_str
                    if event_time_str > seen_tools[tool_name]["last_seen"]:
                        seen_tools[tool_name]["last_seen"] = event_time_str

                # Track models
                if model_id and model_id != "unknown":
                    if model_id not in seen_models:
                        seen_models[model_id] = {
                            "users": set(),
                            "tools": set(),
                            "requests": 0,
                            "evidence": f"CloudTrail {event_name} invocation",
                        }
                    seen_models[model_id]["users"].add(username)
                    seen_models[model_id]["tools"].add(tool_name)
                    seen_models[model_id]["requests"] += 1

            # Convert to response objects
            # Users with their tool usage, highest usage first. The list is
            # truncated to 20 below, and it was previously emitted in dict
            # insertion order — so a service that opens a fresh STS session per
            # call (hundreds of distinct session names) crowded the genuinely
            # heavy identities out of the response entirely.
            def _user_weight(item):
                user, data = item
                tok = tokens.by_identity.get(user) if tokens.available else None
                measured = (tok.total or 0) if tok else 0
                return (-measured, -data["events"])

            for user, data in sorted(seen_users.items(), key=_user_weight):
                # Skip known platform accounts
                if user in ["ai-trust-platform-api", "SageMaker", "ConfigResourceCompositionSession"]:
                    continue
                tools_list = ", ".join(sorted(data["tools"]))
                # MEASURED tokens for this identity, or None. Never an estimate:
                # there is no defensible per-event token constant, and a wrong
                # token count reads as authoritative once it renders.
                tok = tokens.by_identity.get(user) if tokens.available else None
                unapproved_users.append(ShadowAiUnapprovedUser(
                    email=user,
                    first_seen=data["first_seen"],
                    tokens=tok.total if tok else None,
                    input_tokens=tok.input if tok else None,
                    output_tokens=tok.output if tok else None,
                    source=f"cloudtrail ({tools_list})",
                    recommended_action=f"Review user — using: {tools_list}",
                ))

            # Tools (from userAgent) — show ALL tools, mark approved vs unknown
            # Known/approved tools list
            approved_tool_patterns = ["claude-cli", "claude-code", "aws-cli", "boto3", "aws-sdk"]

            for tool_name, data in sorted(seen_tools.items(), key=lambda x: -x[1]["requests"]):
                is_approved = any(pattern in tool_name.lower() for pattern in approved_tool_patterns)
                users_list = _join_capped(data["users"])
                models_list = _join_capped(data["models"])

                unknown_tools.append(ShadowAiUnknownTool(
                    tool_name=f"{tool_name} ({data['version']})" if data.get("version") else tool_name,
                    first_seen=data["first_seen"],
                    users=len(data["users"]),
                    requests=data["requests"],
                    evidence=f"Users: {users_list} | Models: {models_list}",
                    recommended_action="Approved tool" if is_approved else "Unknown tool — review and approve or block",
                ))

            # Models with tool breakdown. model_id is already the short, masked
            # form (see _short_model at the top of the loop).
            unpriced: List[str] = []
            unmeasured: List[str] = []
            for model_id, data in sorted(seen_models.items(), key=lambda x: -x[1]["requests"]):
                tools_list = _join_capped(data["tools"])
                users_list = _join_capped(data["users"])

                # Cost = MEASURED tokens x this model's own published rate.
                # Replaces a flat per-call constant, which both ignored token
                # volume entirely and priced a 200k-token Fable call the same as
                # a 20-token Haiku call.
                tok = tokens.by_model.get(model_id) if tokens.available else None
                cost = None
                if tok is None:
                    unmeasured.append(model_id)
                else:
                    cost = self._price_tokens(model_id, tok.input, tok.output)
                    if cost is None:
                        unpriced.append(model_id)

                unapproved_models.append(ShadowAiUnapprovedModel(
                    model_id=model_id,
                    users=len(data["users"]),
                    requests=data["requests"],
                    cost=cost,
                    input_tokens=tok.input if tok else None,
                    output_tokens=tok.output if tok else None,
                    evidence=f"Tools: {tools_list} | Users: {users_list}",
                    recommended_action="Review model usage and add to governance policy",
                ))

            # The headline number sums only what could actually be priced. Models
            # excluded from it are named in the note rather than folded in at a
            # guessed rate, which would understate or overstate real spend.
            cost_estimate = sum(m.cost for m in unapproved_models if m.cost is not None)

            notes: List[str] = []
            if not tokens.available:
                notes.append(
                    tokens.reason
                    or "Token counts are unmeasured — CloudTrail carries no token data."
                )
            if unmeasured:
                notes.append(
                    f"No invocation-log records matched {len(unmeasured)} model(s) "
                    f"({_join_capped(unmeasured, 3)}) — their tokens and cost are "
                    "unmeasured, not zero"
                )
            if unpriced:
                notes.append(
                    f"No published rate for {_join_capped(unpriced, 3)} — excluded "
                    "from the cost total rather than priced at a fallback rate"
                )
            if truncation_note:
                notes.append(truncation_note)

            return ShadowAiDetection(
                unapproved_users=unapproved_users[:20],  # Top 20
                unknown_tools=unknown_tools[:20],  # All tools
                unapproved_models=unapproved_models[:20],
                total_shadow_events=total_events,
                shadow_cost_estimate=round(cost_estimate, 2),
                live=tokens.available,
                source=(
                    "cloudtrail+bedrock-invocation-logs" if tokens.available else "cloudtrail"
                ),
                note="; ".join(notes) if notes else None,
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("CloudTrail shadow AI detection failed: %s", e)
            return None

    def get_shadow_ai(self, days: int = 30) -> ShadowAIResponse:
        """Cached wrapper around shadow AI detection."""
        key = f"developer-ai:shadow-ai:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._detect_shadow_ai(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _detect_shadow_ai(self, days: int = 30) -> ShadowAIResponse:
        """Identify unapproved AI tool usage and unknown users."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        findings: List[ShadowAIFinding] = []

        try:
            cw = self._cw()

            # Check for unapproved tools
            findings.extend(self._find_unapproved_tools(cw, start, end))

            # Check for unknown/unapproved users
            findings.extend(self._find_unknown_users(cw, start, end))

            # Sort by severity
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            findings.sort(key=lambda f: severity_order.get(f.severity, 4))

            by_type: dict = {}
            by_severity: dict = {}
            for f in findings:
                by_type[f.finding_type] = by_type.get(f.finding_type, 0) + 1
                by_severity[f.severity] = by_severity.get(f.severity, 0) + 1

            return ShadowAIResponse(
                findings=findings,
                total_count=len(findings),
                by_type=by_type,
                by_severity=by_severity,
                approved_tools=self.approved_tools,
                approved_user_domains=self.approved_user_domains,
                live=True,
                source="cloudwatch",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Shadow AI detection failed: %s", e)
            return ShadowAIResponse(
                findings=[],
                total_count=0,
                by_type={},
                by_severity={},
                approved_tools=self.approved_tools,
                approved_user_domains=self.approved_user_domains,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable for shadow AI detection.",
            )

    def _find_unapproved_tools(self, cw, start: datetime, end: datetime) -> List[ShadowAIFinding]:
        """Find usage of AI tools not in the approved list."""
        findings = []

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            seen_combos: Set[tuple] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                tool = dims.get("tool", "unknown")
                user_id = dims.get("user.id")

                if tool not in self.approved_tools:
                    combo = (user_id, tool)
                    if combo in seen_combos:
                        continue
                    seen_combos.add(combo)

                    findings.append(ShadowAIFinding(
                        finding_type="unapproved-tool",
                        severity="high",
                        user_id=user_id,
                        email=dims.get("user.email"),
                        tool=tool,
                        description=f"Usage of unapproved AI tool: {tool}",
                        evidence=f"CloudWatch metric {self.namespace}/session.count with tool={tool}",
                        recommended_action=f"Review {tool} usage and either add to approved list or block access.",
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unapproved tool detection failed: %s", e)

        return findings

    def _find_unknown_users(self, cw, start: datetime, end: datetime) -> List[ShadowAIFinding]:
        """Find AI tool usage from users outside approved domains."""
        findings = []

        if not self.approved_user_domains:
            return findings  # No domain restriction configured

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            seen_users: Set[str] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                user_id = dims.get("user.id")
                email = dims.get("user.email")

                if not email or user_id in seen_users:
                    continue
                seen_users.add(user_id)

                domain = email.split("@")[-1] if "@" in email else None
                if domain and domain not in self.approved_user_domains:
                    findings.append(ShadowAIFinding(
                        finding_type="unknown-user",
                        severity="medium",
                        user_id=user_id,
                        email=email,
                        tool=dims.get("tool"),
                        description=f"AI tool usage from unapproved domain: {domain}",
                        evidence=f"CloudWatch metric {self.namespace}/session.count with user.email={email}",
                        recommended_action=f"Verify {email} should have AI tool access and add domain to approved list if appropriate.",
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unknown user detection failed: %s", e)

        return findings

    # -------------------------------------------------------------------------
    # Agentic Coding
    # -------------------------------------------------------------------------

    # Sensitive file patterns for governance risk detection
    SENSITIVE_FILE_PATTERNS = [
        ".env", "secrets", "credentials", "config.json", "config.yaml", "config.yml",
        "settings.json", "settings.yaml", ".aws/", ".ssh/", "Dockerfile", "docker-compose",
        "terraform", ".tf", "cloudformation", "security", "auth", "password", "token",
        "certificate", ".pem", ".key", "deploy", "ci/", ".github/workflows",
    ]

    # Production repo indicators, matched per NAME TOKEN — see _is_production_repo.
    PROD_REPO_PATTERNS = ["prod", "production", "main", "release", "deploy", "infra"]
    # Families where a token that merely STARTS with the pattern still means
    # production ("production", "prod2", "infrastructure", "deployment",
    # "releases"). Deliberately excludes "main", which is what caused the
    # false positives this replaced.
    PROD_REPO_PREFIXES = ("prod", "infra", "release", "deploy")

    def _is_production_repo(self, repo_name: str) -> bool:
        """Whether a repo name indicates production.

        This used to be `any(p in name.lower() for p in PROD_REPO_PATTERNS)`, a
        bare substring test that flagged any repo whose name merely CONTAINS a
        pattern: "maintenance", "domain-model", "remainder" and "mainframe" all
        matched "main" and were silently treated as production, inflating every
        production-risk count downstream.

        Matching whole hyphen/underscore/dot-delimited tokens (plus the prefix
        allowance above) keeps the true positives — "web-main", "deploy-scripts",
        "infrastructure" — and drops the accidents.
        """
        tokens = [t for t in _REPO_TOKEN_SPLIT.split((repo_name or "").lower()) if t]
        exact = set(self.PROD_REPO_PATTERNS)
        return any(t in exact or t.startswith(self.PROD_REPO_PREFIXES) for t in tokens)

    def get_agentic_coding(self, period: str = "7d") -> AgenticCodingActivity:
        """Cached wrapper around live agentic coding fetch.

        Args:
            period: Time period - "24h", "7d", or "30d"
        """
        days = {"24h": 1, "7d": 7, "30d": 30}.get(period, 7)
        key = f"developer-ai:agentic:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_agentic_coding(period, days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_agentic_coding(self, period: str, days: int) -> AgenticCodingActivity:
        """Query CloudWatch for agentic coding metrics.

        Agentic metrics (namespace: claude_code):
        - agent.task.count
        - agent.task.duration
        - agent.commits
        - agent.files_modified
        - agent.lines_added / agent.lines_removed
        - agent.pr_created
        """
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        try:
            cw = self._cw()

            # Query agentic metrics by user
            task_metrics = self._query_agentic_metric(cw, "agent.task.count", "user.id", start, end)
            duration_metrics = self._query_agentic_metric(cw, "agent.task.duration", "user.id", start, end, stat="Average")
            commit_metrics = self._query_agentic_metric(cw, "agent.commits", "user.id", start, end)
            pr_metrics = self._query_agentic_metric(cw, "agent.pr_created", "user.id", start, end)
            files_metrics = self._query_agentic_metric(cw, "agent.files_modified", "user.id", start, end)
            lines_added_metrics = self._query_agentic_metric(cw, "agent.lines_added", "user.id", start, end)
            lines_removed_metrics = self._query_agentic_metric(cw, "agent.lines_removed", "user.id", start, end)

            # Query metrics by repo
            repo_tasks = self._query_agentic_metric_by_repo(cw, "agent.task.count", start, end)
            repo_commits = self._query_agentic_metric_by_repo(cw, "agent.commits", start, end)
            repo_prs = self._query_agentic_metric_by_repo(cw, "agent.pr_created", start, end)

            # Query autonomy breakdown — flat {level: count} for the headline split
            autonomy_metrics = self._query_agentic_by_dimension(cw, "agent.task.count", "autonomy_level", start, end)
            # ...and the (repo, autonomy_level) pair, which the flat map above
            # cannot express, for the production-risk filter.
            repo_autonomy_tasks = self._query_agentic_tasks_by_repo_autonomy(cw, start, end)

            # Query unapproved activity
            unapproved_commits = self._query_unapproved_activity(cw, "agent.commits", start, end)
            unapproved_prs = self._query_unapproved_activity(cw, "agent.pr_created", start, end)

            # Build by-user aggregation
            all_users: Set[str] = (
                set(task_metrics.keys()) | set(commit_metrics.keys()) |
                set(pr_metrics.keys()) | set(files_metrics.keys())
            )
            by_user: List[AgenticUserActivity] = []

            for user in all_users:
                tasks = int(task_metrics.get(user, 0))
                avg_duration = duration_metrics.get(user, 0)
                commits = int(commit_metrics.get(user, 0))
                prs = int(pr_metrics.get(user, 0))
                files = int(files_metrics.get(user, 0))
                lines_add = int(lines_added_metrics.get(user, 0))
                lines_rm = int(lines_removed_metrics.get(user, 0))

                # Get user's autonomy breakdown
                user_autonomy = self._query_user_autonomy(cw, user, start, end)

                # Count unapproved actions for this user
                user_unapproved = sum(
                    1 for a in unapproved_commits + unapproved_prs
                    if a.user == user
                )

                by_user.append(AgenticUserActivity(
                    user=user,
                    tasks=tasks,
                    commits=commits,
                    prs_created=prs,
                    files_modified=files,
                    lines_added=lines_add,
                    lines_removed=lines_rm,
                    avg_task_duration_minutes=round(avg_duration / 60, 1) if avg_duration else 0,
                    autonomy_breakdown=user_autonomy,
                    unapproved_actions=user_unapproved,
                ))

            by_user.sort(key=lambda u: u.commits, reverse=True)

            # Build by-repo aggregation
            all_repos: Set[tuple] = set(repo_tasks.keys()) | set(repo_commits.keys()) | set(repo_prs.keys())
            by_repo: List[AgenticRepoActivity] = []

            for repo_key in all_repos:
                org, name = repo_key if isinstance(repo_key, tuple) else ("unknown", repo_key)
                tasks = int(repo_tasks.get(repo_key, 0))
                commits = int(repo_commits.get(repo_key, 0))
                prs = int(repo_prs.get(repo_key, 0))

                # Check for unapproved activity on this repo
                repo_unapproved = sum(
                    1 for a in unapproved_commits
                    if a.repo_org == org and a.repo_name == name
                )

                # Count sensitive file changes
                sensitive_changes = self._count_sensitive_file_changes(cw, org, name, start, end)

                # Check if this is a production repo
                is_prod = self._is_production_repo(name)

                by_repo.append(AgenticRepoActivity(
                    repo_org=org,
                    repo_name=name,
                    tasks=tasks,
                    commits=commits,
                    prs_created=prs,
                    unapproved_commits=repo_unapproved,
                    sensitive_file_changes=sensitive_changes,
                    is_production=is_prod,
                ))

            by_repo.sort(key=lambda r: r.commits, reverse=True)

            # Calculate governance risk
            governance_risk = self._calculate_governance_risk(
                by_repo, unapproved_commits, unapproved_prs, autonomy_metrics,
                repo_autonomy_tasks,
            )

            # Totals
            total_tasks = sum(u.tasks for u in by_user)
            total_commits = sum(u.commits for u in by_user)
            total_prs = sum(u.prs_created for u in by_user)
            total_files = sum(u.files_modified for u in by_user)
            total_lines_added = sum(u.lines_added for u in by_user)
            total_lines_removed = sum(u.lines_removed for u in by_user)
            total_duration = sum(
                (duration_metrics.get(u.user, 0) * task_metrics.get(u.user, 1))
                for u in by_user
            )
            total_hours = total_duration / 3600 if total_duration else 0

            # Combine all unapproved activity
            all_unapproved = unapproved_commits + unapproved_prs
            all_unapproved.sort(key=lambda a: a.timestamp, reverse=True)

            # If no OTel data, fall back to CloudTrail
            if not by_user and not by_repo:
                return self._get_agentic_coding_from_cloudtrail(period, days)

            return AgenticCodingActivity(
                period=period,
                total_tasks=total_tasks,
                total_commits=total_commits,
                total_prs=total_prs,
                files_modified=total_files,
                lines_added=total_lines_added,
                lines_removed=total_lines_removed,
                unique_users=len(by_user),
                unique_repos=len(by_repo),
                avg_task_duration_minutes=round(total_duration / total_tasks / 60, 1) if total_tasks else 0,
                total_task_hours=round(total_hours, 1),
                by_user=by_user[:20],
                by_repo=by_repo[:20],
                autonomy_breakdown={
                    "full": autonomy_metrics.get("full", 0),
                    "supervised": autonomy_metrics.get("supervised", 0),
                    "pair": autonomy_metrics.get("pair", 0),
                },
                governance_risk=governance_risk,
                unapproved_activity=all_unapproved[:50],
                live=True,
                source="cloudwatch-otel",
                note=self._agentic_risk_note(by_repo, repo_autonomy_tasks),
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch agentic coding metrics unavailable: %s", e)
            # Fall back to CloudTrail-based agentic coding detection
            return self._get_agentic_coding_from_cloudtrail(period, days)

    @staticmethod
    def _agentic_risk_note(by_repo, repo_autonomy_tasks: dict) -> Optional[str]:
        """Disclose when high_autonomy_on_prod_repos is unmeasured rather than zero.

        A production repo with agent activity but no (repo, autonomy_level) metric
        pair yields 0, which reads as "no unsupervised work on production" — the
        opposite of what an absent dimension actually means. Say so instead.
        """
        prod_repos = [r for r in by_repo if r.is_production]
        if prod_repos and not repo_autonomy_tasks:
            return (
                f"high_autonomy_on_prod_repos is 0 because agent.task.count carries no "
                f"(repo.name, autonomy_level) dimension pair in this namespace — "
                f"unmeasured across {len(prod_repos)} production repo(s), not a measured zero."
            )
        return None

    def _get_agentic_coding_from_cloudtrail(self, period: str, days: int) -> AgenticCodingActivity:
        """Get agentic coding activity from CloudTrail Bedrock invocations.

        When OTel metrics aren't available, we can still detect Claude Code usage
        by looking at CloudTrail events with userAgent containing 'claude-cli'.
        """
        import json

        try:
            # Paginated, EventName-based lookup (see _lookup_bedrock_invocation_events):
            # the previous single un-paginated call saw at most 50 of the window's
            # events because CloudTrail clamps MaxResults, so a Claude Code session
            # outside that page was reported as no activity at all.
            events, truncation_note = self._lookup_bedrock_invocation_events(days)

            # Track Claude Code activity by user
            user_activity: dict[str, dict] = {}
            total_requests = 0

            for event in events:
                event_name = event.get("EventName", "")
                username = event.get("Username", "unknown")
                event_time = event.get("EventTime")

                # Only count model invocations
                if event_name not in _BEDROCK_INVOKE_EVENTS:
                    continue

                # Parse CloudTrailEvent for userAgent
                try:
                    ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                    user_agent = ct_event.get("userAgent", "unknown")
                    model_id = (ct_event.get("requestParameters") or {}).get("modelId") or "unknown"
                    event_source = ct_event.get("eventSource") or ""
                except Exception:
                    user_agent = "unknown"
                    model_id = "unknown"
                    event_source = ""

                if event_source not in _BEDROCK_EVENT_SOURCES:
                    continue

                # Check if this is Claude Code (claude-cli in userAgent)
                is_claude_code = "claude-cli" in user_agent.lower() or "claude-code" in user_agent.lower()

                if not is_claude_code:
                    continue  # Only track Claude Code for agentic coding

                total_requests += 1
                event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                # Parse version from userAgent
                tool_version = ""
                if "/" in user_agent:
                    tool_version = user_agent.split("/")[1].split(" ")[0]

                if username not in user_activity:
                    user_activity[username] = {
                        "requests": 0,
                        "models": set(),
                        "first_seen": event_time_str,
                        "last_seen": event_time_str,
                        "tool_version": tool_version,
                    }

                user_activity[username]["requests"] += 1
                user_activity[username]["models"].add(_short_model(model_id))
                # Paging returns newest-first per event name, so first_seen has to
                # move down as older pages arrive.
                if event_time_str < user_activity[username]["first_seen"]:
                    user_activity[username]["first_seen"] = event_time_str
                if event_time_str > user_activity[username]["last_seen"]:
                    user_activity[username]["last_seen"] = event_time_str
                    user_activity[username]["tool_version"] = tool_version

            # Build by-user list
            by_user: List[AgenticUserActivity] = []
            for user, data in sorted(user_activity.items(), key=lambda x: -x[1]["requests"]):
                models_str = _join_capped(data["models"])
                by_user.append(AgenticUserActivity(
                    user=user,
                    email=user,
                    tasks=data["requests"],  # Each request = a task
                    commits=0,  # Can't determine from CloudTrail
                    prs_created=0,
                    files_modified=0,
                    lines_added=0,
                    lines_removed=0,
                    avg_task_duration_minutes=0,
                    autonomy_breakdown={"full": 0, "supervised": data["requests"], "pair": 0},
                    unapproved_actions=0,
                ))

            has_data = len(by_user) > 0

            return AgenticCodingActivity(
                period=period,
                total_tasks=total_requests,
                total_commits=0,
                total_prs=0,
                files_modified=0,
                lines_added=0,
                lines_removed=0,
                unique_users=len(by_user),
                unique_repos=0,
                avg_task_duration_minutes=0,
                total_task_hours=0,
                by_user=by_user[:20],
                by_repo=[],
                autonomy_breakdown={
                    "full": 0,
                    "supervised": total_requests,
                    "pair": 0,
                },
                mode_breakdown={
                    "agentic": total_requests,
                    "assisted": 0,
                    "chat": 0,
                },
                governance_risk=AgenticCodingGovernanceRisk(
                    unapproved_commits=0,
                    unapproved_prs_created=0,
                    sensitive_file_changes=0,
                    high_autonomy_on_prod_repos=0,
                    scope_exceeded_count=0,
                    risk_score=0.0,
                    risk_level="low",
                    top_risks=[],
                ),
                unapproved_activity=[],
                live=has_data,
                source="cloudtrail",
                note=" ".join(filter(None, [
                    f"Claude Code activity from CloudTrail ({total_requests} Bedrock requests)."
                    if has_data else "No Claude Code activity found in CloudTrail.",
                    # CloudTrail cannot see commits, PRs or autonomy level, so the
                    # governance-risk block above is all zeros by construction —
                    # unmeasured, not a clean bill of health.
                    "Commits, PRs and autonomy level are not visible in CloudTrail, so "
                    "governance risk is unmeasured (reported as 0).",
                    truncation_note,
                ])),
            )

        except Exception as e:
            logger.warning("CloudTrail agentic coding detection failed: %s", e)
            return AgenticCodingActivity(
                period=period,
                live=False,
                source="unavailable-fallback",
                note="CloudTrail unavailable for agentic coding detection.",
            )

    def _query_agentic_metric(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime,
        stat: str = "Sum"
    ) -> dict:
        """Query an agentic metric grouped by a dimension.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,  # Aggregate over the full period
                        "Stat": stat,
                    },
                })
                query_metadata.append({"id": query_id, "dim_value": dim_value})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    dim_value = id_to_metadata[query_id]["dim_value"]
                    total = sum(result.get("Values", []))
                    results[dim_value] = results.get(dim_value, 0) + total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Agentic metric query failed for %s: %s", metric_name, e)
            return {}

    def _query_agentic_metric_by_repo(
        self, cw, metric_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query an agentic metric grouped by repo (org, name).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                org = dims.get("repo.org", "unknown")
                name = dims.get("repo.name")
                if not name:
                    continue

                repo_key = (org, name)
                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({"id": query_id, "repo_key": repo_key})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    repo_key = id_to_metadata[query_id]["repo_key"]
                    total = sum(result.get("Values", []))
                    results[repo_key] = results.get(repo_key, 0) + total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Repo metric query failed for %s: %s", metric_name, e)
            return {}

    def _query_agentic_tasks_by_repo_autonomy(
        self, cw, start: datetime, end: datetime
    ) -> dict:
        """Task counts keyed on the (repo.org, repo.name, autonomy_level) TRIPLE.

        Exists because _query_agentic_by_dimension collapses agent.task.count to a
        flat {autonomy_level: count} and throws the repo dimensions away, and
        _query_agentic_metric_by_repo collapses it to {(org, repo): count} and
        throws the autonomy level away. Neither can answer "how many FULL-autonomy
        tasks ran on production repos", which forced the governance-risk
        calculation to count every task on a prod repo regardless of autonomy —
        overstating the risk by however much supervised and pair work there was.

        No new telemetry is needed: repo.org, repo.name and autonomy_level are all
        dimensions on the SAME agent.task.count metric, so reading them together
        recovers the real number (the correlated read at _query_unapproved_activity
        already relies on that being true).

        Returns {} when the namespace has no such metric — callers must treat that
        as "unmeasured", never as a measured zero.
        """
        try:
            resp = cw.list_metrics(Namespace=self.namespace, MetricName="agent.task.count")
            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            queries = []
            query_metadata = []
            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                level = dims.get("autonomy_level")
                repo_name = dims.get("repo.name")
                # Only metric streams carrying BOTH dimensions can be attributed.
                if not level or not repo_name:
                    continue
                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({
                    "id": query_id,
                    "key": (dims.get("repo.org", "unknown"), repo_name, level.lower()),
                })

            if not queries:
                return {}

            results: dict = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]
                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries, StartTime=start, EndTime=end,
                )
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    meta = id_to_metadata.get(result.get("Id"))
                    if not meta:
                        continue
                    key = meta["key"]
                    results[key] = results.get(key, 0) + int(sum(result.get("Values", [])))

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Repo/autonomy pair query failed: %s", e)
            return {}

    def _query_agentic_by_dimension(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query an agentic metric breakdown by a specific dimension (e.g., autonomy_level).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({"id": query_id, "dim_value": dim_value})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    dim_value = id_to_metadata[query_id]["dim_value"]
                    total = sum(result.get("Values", []))
                    results[dim_value] = results.get(dim_value, 0) + int(total)

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Dimension query failed for %s/%s: %s", metric_name, dimension_name, e)
            return {}

    def _query_user_autonomy(self, cw, user: str, start: datetime, end: datetime) -> dict:
        """Query autonomy level breakdown for a specific user.

        Uses batched get_metric_data instead of 3 separate get_metric_statistics calls.
        """
        try:
            autonomy_levels = ["full", "supervised", "pair"]

            # Build batched MetricDataQueries for all autonomy levels
            queries = [
                {
                    "Id": f"m{i}",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": "agent.task.count",
                            "Dimensions": [
                                {"Name": "user.id", "Value": user},
                                {"Name": "autonomy_level", "Value": level},
                            ],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                }
                for i, level in enumerate(autonomy_levels)
            ]

            # Single batched API call
            data_resp = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start,
                EndTime=end,
            )

            # Process results
            autonomy = {"full": 0, "supervised": 0, "pair": 0}
            for result in data_resp.get("MetricDataResults", []):
                query_id = result.get("Id")
                if query_id and query_id.startswith("m"):
                    idx = int(query_id[1:])
                    if 0 <= idx < len(autonomy_levels):
                        level = autonomy_levels[idx]
                        autonomy[level] = int(sum(result.get("Values", [])))

            return autonomy

        except (ClientError, BotoCoreError) as e:
            logger.debug("User autonomy query failed for %s: %s", user, e)
            return {"full": 0, "supervised": 0, "pair": 0}

    def _query_unapproved_activity(
        self, cw, metric_name: str, start: datetime, end: datetime
    ) -> List[UnapprovedAgenticAction]:
        """Query for activity without approval (approval.status = none).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        actions = []

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return actions

            # Build batched queries and metadata for unapproved metrics only
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                approval_status = dims.get("approval.status", "").lower()

                # Only include unapproved activity
                if approval_status not in ["none", "denied"]:
                    continue

                user = dims.get("user.id", "unknown")
                repo_org = dims.get("repo.org", "unknown")
                repo_name = dims.get("repo.name", "unknown")
                autonomy = dims.get("autonomy_level", "full")
                file_type = dims.get("file_type", "")

                # Check for sensitive files
                sensitive_files = []
                if file_type:
                    for pattern in self.SENSITIVE_FILE_PATTERNS:
                        if pattern.lower() in file_type.lower():
                            sensitive_files.append(file_type)
                            break

                # Determine action type from metric name
                action = "commit" if "commit" in metric_name else "pr_create"

                # Determine risk level
                is_prod = self._is_production_repo(repo_name)
                has_sensitive = len(sensitive_files) > 0
                is_full_auto = autonomy == "full"

                if is_prod and has_sensitive and is_full_auto:
                    risk_level = "critical"
                elif is_prod or (has_sensitive and is_full_auto):
                    risk_level = "high"
                elif has_sensitive or is_full_auto:
                    risk_level = "medium"
                else:
                    risk_level = "low"

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 3600,  # Hourly for more granular timestamps
                        "Stat": "Sum",
                    },
                    "ReturnData": True,
                })
                query_metadata.append({
                    "id": query_id,
                    "user": user,
                    "repo_org": repo_org,
                    "repo_name": repo_name,
                    "action": action,
                    "approval_status": approval_status,
                    "autonomy": autonomy,
                    "sensitive_files": sensitive_files,
                    "risk_level": risk_level,
                })

            if not queries:
                return actions

            # Single batched API call (process in batches of 500 if needed)
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    metadata = id_to_metadata[query_id]
                    timestamps = result.get("Timestamps", [])
                    values = result.get("Values", [])

                    # Create an action for each non-zero datapoint
                    for ts, val in zip(timestamps, values):
                        if val > 0:
                            actions.append(UnapprovedAgenticAction(
                                user=metadata["user"],
                                repo_org=metadata["repo_org"],
                                repo_name=metadata["repo_name"],
                                action=metadata["action"],
                                timestamp=ts.isoformat(),
                                approval_required=True,
                                approval_status=ApprovalStatus.NONE if metadata["approval_status"] == "none" else ApprovalStatus.DENIED,
                                autonomy_level=AutonomyLevel(metadata["autonomy"]) if metadata["autonomy"] in ["full", "supervised", "pair"] else AutonomyLevel.FULL,
                                sensitive_files=metadata["sensitive_files"],
                                risk_level=metadata["risk_level"],
                                details=f"{metric_name} without approval on {metadata['repo_org']}/{metadata['repo_name']}",
                            ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unapproved activity query failed for %s: %s", metric_name, e)

        return actions

    def _count_sensitive_file_changes(
        self, cw, repo_org: str, repo_name: str, start: datetime, end: datetime
    ) -> int:
        """Count changes to sensitive files in a repo.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            # Build batched MetricDataQueries for all sensitive file patterns
            queries = [
                {
                    "Id": f"m{i}",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": "agent.files_modified",
                            "Dimensions": [
                                {"Name": "repo.org", "Value": repo_org},
                                {"Name": "repo.name", "Value": repo_name},
                                {"Name": "file_type", "Value": pattern},
                            ],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                }
                for i, pattern in enumerate(self.SENSITIVE_FILE_PATTERNS)
            ]

            # Single batched API call
            data_resp = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start,
                EndTime=end,
            )

            # Sum all results
            count = 0
            for result in data_resp.get("MetricDataResults", []):
                count += int(sum(result.get("Values", [])))

            return count

        except (ClientError, BotoCoreError) as e:
            logger.debug("Sensitive file count failed for %s/%s: %s", repo_org, repo_name, e)
            return 0

    def _calculate_governance_risk(
        self,
        by_repo: List[AgenticRepoActivity],
        unapproved_commits: List[UnapprovedAgenticAction],
        unapproved_prs: List[UnapprovedAgenticAction],
        autonomy_metrics: dict,
        repo_autonomy_tasks: Optional[dict] = None,
    ) -> AgenticCodingGovernanceRisk:
        """Calculate aggregate governance risk from agentic coding activity.

        `repo_autonomy_tasks` is the (repo.org, repo.name, autonomy_level) -> tasks
        map from _query_agentic_tasks_by_repo_autonomy. An empty/None map means the
        autonomy dimension was not measured, and high_autonomy_on_prod_repos is
        then reported as 0 with the caller disclosing that in `note` — it must not
        fall back to counting all tasks on prod repos.
        """

        unapproved_commit_count = len(unapproved_commits)
        unapproved_pr_count = len([a for a in unapproved_prs if a.action == "pr_create"])
        sensitive_changes = sum(r.sensitive_file_changes for r in by_repo)

        # FULL-autonomy tasks on production repos, filtered on BOTH dimensions.
        # AutonomyLevel has exactly three values (full | supervised | pair) and only
        # "full" is unsupervised, so only that level counts here. This previously
        # summed EVERY task on a prod repo because the flat autonomy map had already
        # discarded the repo dimension.
        prod_repo_keys = {(r.repo_org, r.repo_name) for r in by_repo if r.is_production}
        full_level = AutonomyLevel.FULL.value
        high_auto_prod = sum(
            tasks
            for (org, name, level), tasks in (repo_autonomy_tasks or {}).items()
            if level == full_level and (org, name) in prod_repo_keys
        )

        # Scope exceeded (placeholder — would need policy comparison)
        scope_exceeded = 0

        # Calculate risk score (0-100)
        # Weights: unapproved commits (30), unapproved PRs (25), sensitive (25), prod auto (15), scope (5)
        risk_score = min(100, (
            min(30, unapproved_commit_count * 3) +
            min(25, unapproved_pr_count * 5) +
            min(25, sensitive_changes * 2.5) +
            min(15, high_auto_prod * 1.5) +
            min(5, scope_exceeded * 2.5)
        ))

        # Determine risk level
        if risk_score >= 75:
            risk_level = "critical"
        elif risk_score >= 50:
            risk_level = "high"
        elif risk_score >= 25:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Top risks
        top_risks = []
        if unapproved_commit_count > 0:
            top_risks.append(f"{unapproved_commit_count} commits without human review")
        if unapproved_pr_count > 0:
            top_risks.append(f"{unapproved_pr_count} PRs opened without approval")
        if sensitive_changes > 0:
            top_risks.append(f"{sensitive_changes} changes to sensitive files")
        if high_auto_prod > 0:
            top_risks.append(f"{high_auto_prod} full-autonomy tasks on production repos")

        return AgenticCodingGovernanceRisk(
            unapproved_commits=unapproved_commit_count,
            unapproved_prs_created=unapproved_pr_count,
            sensitive_file_changes=sensitive_changes,
            high_autonomy_on_prod_repos=high_auto_prod,
            scope_exceeded_count=scope_exceeded,
            risk_score=round(risk_score, 1),
            risk_level=risk_level,
            top_risks=top_risks[:3],
        )

    # -------------------------------------------------------------------------
    # Combined Posture
    # -------------------------------------------------------------------------

    def get_posture(self, period: str = "7d") -> DeveloperAIPostureResponse:
        """Get combined developer AI posture including assisted and agentic coding.

        Args:
            period: Time period - "24h", "7d", or "30d"
        """
        days = {"24h": 1, "7d": 7, "30d": 30}.get(period, 7)

        # Get both assisted and agentic metrics
        assisted = self.get_usage(days=days)
        agentic = self.get_agentic_coding(period=period)

        # Calculate cross-cutting metrics
        assisted_hours = assisted.total_sessions * 0.5  # Estimate 30 min per session
        agentic_hours = agentic.total_task_hours
        total_hours = assisted_hours + agentic_hours

        agentic_ratio = agentic_hours / total_hours if total_hours > 0 else 0

        # Check governance compliance (no critical risks)
        governance_compliant = agentic.governance_risk.risk_level != "critical"
        critical_risks = sum(
            1 for a in agentic.unapproved_activity if a.risk_level == "critical"
        )

        # Determine if any source is live
        live = assisted.live or agentic.live

        return DeveloperAIPostureResponse(
            assisted=assisted,
            agentic=agentic,
            total_ai_coding_hours=round(total_hours, 1),
            agentic_ratio=round(agentic_ratio, 3),
            governance_compliant=governance_compliant,
            critical_risks=critical_risks,
            period=period,
            live=live,
            source="cloudwatch-otel",
            note=None if live else "No developer AI metrics available — verify OTel export configuration.",
        )

    # -------------------------------------------------------------------------
    # Local Agent Discovery (CodeCommit scanning)
    # -------------------------------------------------------------------------

    # Agent config file patterns by tool
    AGENT_CONFIG_PATTERNS = [
        {"tool": "Claude Code", "pattern": "CLAUDE.md", "icon": "CC"},
        {"tool": "GitHub Copilot", "pattern": ".github/copilot-instructions.md", "icon": "GH"},
        {"tool": "Cursor", "pattern": ".cursor/rules/", "icon": "C"},
        {"tool": "Kiro", "pattern": ".kiro/steering/", "icon": "K"},
        {"tool": "Q Desktop", "pattern": ".aws/amazonq/", "icon": "Q"},
        {"tool": "OpenAI Codex", "pattern": "AGENTS.md", "icon": "OA"},
    ]

    # Risk keywords in agent configs
    RISK_KEYWORDS = {
        "critical": ["pii", "pci", "hipaa", "credentials", "secrets", "password", "token", "api_key", "private_key"],
        "high": ["database", "db_", "prod", "production", "deploy", "payment", "financial", "customer_data"],
        "medium": ["internal", "admin", "config", "settings", "infra"],
    }

    # Tool detection patterns from CloudTrail userAgent
    TOOL_USER_AGENT_PATTERNS = [
        {"pattern": "claude-cli", "tool": "Claude Code", "icon": "CC"},
        {"pattern": "claude-code", "tool": "Claude Code", "icon": "CC"},
        {"pattern": "cursor", "tool": "Cursor", "icon": "C"},
        {"pattern": "copilot", "tool": "GitHub Copilot", "icon": "GH"},
        {"pattern": "kiro", "tool": "Kiro", "icon": "K"},
        {"pattern": "amazonq", "tool": "Q Desktop", "icon": "Q"},
        {"pattern": "amazon-q", "tool": "Q Desktop", "icon": "Q"},
        {"pattern": "codewhisperer", "tool": "CodeWhisperer", "icon": "CW"},
        {"pattern": "openai", "tool": "OpenAI Tools", "icon": "OA"},
    ]

    def discover_local_agents(self, limit: int = 100) -> LocalAgentDiscoveryResponse:
        """Cached wrapper around local agent discovery.

        Combines two detection methods:
        1. CodeCommit scanning for config files (CLAUDE.md, .cursor/rules, etc.)
        2. CloudTrail inference detection (userAgent patterns from API calls)
        """
        key = f"developer-ai:local-agents:{self.region}:{limit}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._discover_agents_combined(limit),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _discover_agents_combined(self, limit: int = 100) -> LocalAgentDiscoveryResponse:
        """Combine CodeCommit scanning with CloudTrail inference detection."""
        # Try CodeCommit first
        codecommit_result = self._scan_codecommit_for_agents(limit)

        # Always add CloudTrail inference detection
        cloudtrail_result = self._detect_agents_from_cloudtrail(limit)

        # Merge results
        agents = codecommit_result.agents + cloudtrail_result.agents

        # Merge tool summaries
        tool_map: dict = {}
        for summary in codecommit_result.by_tool + cloudtrail_result.by_tool:
            if summary.tool in tool_map:
                tool_map[summary.tool].count += summary.count
            else:
                tool_map[summary.tool] = LocalAgentToolSummary(
                    tool=summary.tool,
                    file_pattern=summary.file_pattern,
                    count=summary.count,
                    icon=summary.icon,
                )

        by_tool = list(tool_map.values())

        # Aggregate counts
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for agent in agents:
            risk_counts[agent.risk_level] = risk_counts.get(agent.risk_level, 0) + 1

        sources = []
        if codecommit_result.repos_scanned > 0:
            sources.append(f"codecommit ({codecommit_result.repos_scanned} repos)")
        if cloudtrail_result.total_found > 0:
            sources.append(f"cloudtrail ({cloudtrail_result.total_found} users)")

        return LocalAgentDiscoveryResponse(
            agents=agents[:limit],
            total_found=len(agents),
            by_tool=by_tool,
            repos_scanned=codecommit_result.repos_scanned,
            repos_with_agents=codecommit_result.repos_with_agents + cloudtrail_result.repos_with_agents,
            critical_count=risk_counts["critical"],
            high_count=risk_counts["high"],
            medium_count=risk_counts["medium"],
            low_count=risk_counts["low"],
            live=codecommit_result.live or cloudtrail_result.live,
            source="+".join(sources) if sources else "unavailable",
            note=cloudtrail_result.note if cloudtrail_result.total_found > 0 else codecommit_result.note,
        )

    def _detect_agents_from_cloudtrail(self, limit: int = 100, days: int = 7) -> LocalAgentDiscoveryResponse:
        """Detect local AI agents from CloudTrail Bedrock/SageMaker inference calls.

        Identifies developer tools by their userAgent string patterns:
        - claude-cli/2.1.220 → Claude Code
        - cursor/x.x.x → Cursor
        - amazonq/x.x.x → Q Desktop
        etc.

        This catches agents even without config files in repos.
        """
        import json

        try:
            # No local CloudTrail client or window here: _lookup_bedrock_invocation_events
            # owns both, so that all cuts share one paged, cached pass.

            # Track agents by user+tool combination
            detected_agents: dict = {}  # key: (user, tool) -> agent data
            tool_counts: dict = {p["tool"]: 0 for p in self.TOOL_USER_AGENT_PATTERNS}

            # CloudTrail SERVER-CLAMPS lookup_events MaxResults to 50. Asking for 500 here
            # returned exactly 50 plus a NextToken (measured), and nothing paged past it.
            #
            # The deeper defect was the lookup AXIS, not the page size. See the note at
            # _BEDROCK_INVOKE_EVENTS: EventSource is the wrong axis. Measured on this account
            # over a 30-day window, EventSource=bedrock.amazonaws.com returned a first page of
            # 50 CONTROL-PLANE events (ListEvaluationJobs, ListDataSources, GetKnowledgeBase,
            # ...) containing ZERO invocations, and EventSource=bedrock-runtime.amazonaws.com
            # returned 0 events at all, because InvokeModel/Converse are CloudTrail *data*
            # events and data events are not enabled here. So the InvokeModel/Converse filter
            # below matched nothing on every request, and this function reported "nothing
            # detected" as a measured fact about the account rather than as a lookup that
            # never had a chance of finding anything.
            #
            # _lookup_bedrock_invocation_events pages by EventName via core/cloudtrail_paging,
            # shares one cache across every cut, and returns a note when a
            # bound was hit so callers can say their counts are a floor.
            events, truncation_note = self._lookup_bedrock_invocation_events(days)
            for event in events:
                    event_name = event.get("EventName", "")
                    username = event.get("Username", "unknown")
                    event_time = event.get("EventTime")

                    # Only model invocations indicate active agent use
                    if event_name not in ["InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"]:
                        continue

                    # Parse CloudTrailEvent for userAgent and model
                    try:
                        ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                        user_agent = ct_event.get("userAgent", "unknown")
                        request_params = ct_event.get("requestParameters") or {}
                        model_id = request_params.get("modelId", "unknown")
                    except Exception:
                        user_agent = "unknown"
                        model_id = "unknown"

                    # Skip known platform/service accounts
                    if username in ["SageMaker", "ConfigResourceCompositionSession"]:
                        continue

                    # Identify tool from userAgent
                    tool_name = None
                    tool_icon = "?"
                    for pattern_info in self.TOOL_USER_AGENT_PATTERNS:
                        if pattern_info["pattern"].lower() in user_agent.lower():
                            tool_name = pattern_info["tool"]
                            tool_icon = pattern_info["icon"]
                            break

                    if not tool_name:
                        # Unknown tool - still track it
                        tool_name = user_agent.split("/")[0] if "/" in user_agent else "Unknown Tool"
                        tool_icon = "?"

                    # Create unique key for user+tool
                    agent_key = (username, tool_name)
                    event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                    if agent_key not in detected_agents:
                        # Parse version from userAgent
                        version = ""
                        if "/" in user_agent:
                            version = user_agent.split("/")[1].split(" ")[0]

                        detected_agents[agent_key] = {
                            "user": username,
                            "tool": tool_name,
                            "icon": tool_icon,
                            "version": version,
                            "user_agent": user_agent,
                            "first_seen": event_time_str,
                            "last_seen": event_time_str,
                            "requests": 0,
                            "models": set(),
                        }

                    detected_agents[agent_key]["requests"] += 1
                    detected_agents[agent_key]["models"].add(
                        model_id.split("/")[-1] if "/" in model_id else model_id
                    )
                    if event_time_str > detected_agents[agent_key]["last_seen"]:
                        detected_agents[agent_key]["last_seen"] = event_time_str


            # Convert to LocalAgentConfig objects
            agents: List[LocalAgentConfig] = []
            for (user, tool), data in sorted(
                detected_agents.items(),
                key=lambda x: -x[1]["requests"]  # Sort by most active
            ):
                models_str = _join_capped(data["models"])

                # Assess risk based on models and request volume
                risk_level = self._assess_inference_risk(data["requests"], data["models"], user)

                # Count by tool
                if data["tool"] in tool_counts:
                    tool_counts[data["tool"]] += 1
                else:
                    tool_counts[data["tool"]] = 1

                agents.append(LocalAgentConfig(
                    repo_name=f"[Inference: {user}]",  # No repo, show user context
                    repo_arn=None,
                    file_path=f"CloudTrail: {data['user_agent'][:60]}",
                    tool=f"{data['tool']} {data['version']}".strip(),
                    owner=user,
                    team=None,
                    last_modified=data["last_seen"],
                    risk_level=risk_level,
                    description=f"{data['requests']} requests to {models_str[:80]}",
                    file_size_bytes=0,
                    content_preview=None,
                ))

            # Build tool summaries
            by_tool = [
                LocalAgentToolSummary(
                    tool=tool,
                    file_pattern="CloudTrail userAgent",
                    count=count,
                    icon=next((p["icon"] for p in self.TOOL_USER_AGENT_PATTERNS if p["tool"] == tool), "?"),
                )
                for tool, count in tool_counts.items()
                if count > 0
            ]

            # Count by risk level
            risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for agent in agents:
                risk_counts[agent.risk_level] = risk_counts.get(agent.risk_level, 0) + 1

            return LocalAgentDiscoveryResponse(
                agents=agents[:limit],
                total_found=len(agents),
                by_tool=by_tool,
                repos_scanned=0,
                repos_with_agents=len(detected_agents),  # Count unique user+tool combos
                critical_count=risk_counts["critical"],
                high_count=risk_counts["high"],
                medium_count=risk_counts["medium"],
                low_count=risk_counts["low"],
                # NOT len(agents) > 0. A completed CloudTrail sweep that found no local
                # agents is a MEASURED ZERO, which is live data - "we looked and there are
                # none" is a finding, not a failure. The old predicate reported the truthful
                # answer under a Mock badge, and the read-failure path below already covers
                # the case where the sweep could not run at all.
                live=True,
                source="cloudtrail",
                note="; ".join(filter(None, [
                    f"Detected {len(agents)} active local agents from {days}-day inference logs",
                    "no local agents found in this window - a measured zero, not a failed lookup"
                    if not agents else None,
                    truncation_note,
                ])),
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("CloudTrail agent detection failed: %s", e)
            return LocalAgentDiscoveryResponse(
                live=False,
                source="cloudtrail-unavailable",
                note=f"CloudTrail access failed: {str(e)[:100]}",
            )

    # ──────────────────────────────────────────────────────────────────────────
    # AI tool provenance — defence in depth for agentic coding
    #
    # Answers two questions per observed (principal, tool) pair, from evidence only:
    # where the call went (Bedrock vs a vendor public API) and how the tool got onto its
    # host (managed vs hand-installed). Both carry an explicit unknown, and every count
    # ships with the coverage denominator that says how much of the estate it covers.
    #
    # The classification rules are pure and unit-tested in `core.ai_tool_provenance`.
    # What lives here is the AWS I/O: CloudTrail for calls, SSM for endpoint and package
    # inventory, EC2 for the host denominator, Route 53 Resolver for the DNS denominator.
    # ──────────────────────────────────────────────────────────────────────────

    def get_ai_tool_provenance(self, days: int = 7) -> AiToolProvenanceResponse:
        """Cached wrapper around provenance classification."""
        key = f"developer-ai:provenance:{self.region}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._build_ai_tool_provenance(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _build_ai_tool_provenance(self, days: int = 7) -> AiToolProvenanceResponse:
        """Classify observed AI tool calls and measure how much of the estate is visible.

        Every source below is optional. A source that fails degrades one dimension to
        `unknown` and lowers the matching coverage figure; it never fails the whole
        response and never lets another dimension's confidence stand in for it.
        """
        endpoint = self._fetch_endpoint_inventory()
        dns = self._fetch_dns_log_coverage()
        calls = self._fetch_bedrock_calls(days, endpoint.ip_to_instance)

        records: List[ProvenanceRecord] = []
        for call in calls.records:
            install = classify_install(
                host_id=call.host_id,
                managed_hosts=endpoint.managed_hosts,
                host_applications=endpoint.host_applications,
                tool=call.tool,
                exec_env=call.exec_env,
            )
            call.install = install.install
            call.install_evidence = install.evidence
            records.append(call)

        # Order: things needing attention first, then by volume. A reader scanning the top
        # of the list should see the unvouched coding tools, not the busiest workload.
        records.sort(key=lambda r: (not r.needs_attention, -r.requests, r.tool))

        buckets = summarise(records)
        coding_tools = [r for r in records if r.tool_class is ToolClass.CODING_TOOL]
        attention = [r for r in records if r.needs_attention]

        classified_calls = sum(r.requests for r in records if r.call_path is not CallPath.UNKNOWN)
        coverage = ProvenanceCoverage(
            endpoint=CoverageRatio(
                covered=endpoint.managed_count,
                total=endpoint.host_total,
                label="Hosts under endpoint management",
                unit="hosts",
                note=endpoint.note,
            ),
            dns=CoverageRatio(
                covered=dns.logged_vpcs,
                total=dns.total_vpcs,
                label="VPCs with DNS query logging",
                unit="VPCs",
                note=dns.note,
            ),
            call_path=CoverageRatio(
                covered=classified_calls,
                total=calls.calls_observed,
                label="Calls with a determined path",
                unit="calls",
                note=(
                    "Only calls that reach an AWS API are observable at all; a call to a "
                    "vendor endpoint never appears in this denominator."
                ),
            ),
            package_inventory=CoverageRatio(
                covered=endpoint.hosts_with_applications,
                total=endpoint.managed_count,
                label="Managed hosts with package inventory",
                unit="hosts",
                note=endpoint.inventory_note,
            ),
            # Counted so the coverage block can say that a complete EC2 ratio is not
            # coverage of the hosts that actually made these calls.
            # Serverless callers are excluded: an AWS-managed runtime has no host by
            # design, so counting it here would report governed infrastructure as a gap.
            unattributed_callers=sum(
                1 for r in records
                if r.host_id is None and r.install is not InstallProvenance.MANAGED_RUNTIME
            ),
        )

        # `live` means "at least one signal answered", and the source list names which.
        # It deliberately does NOT mean "we have coverage" — that is what `coverage` is
        # for. Conflating the two is how a zero-finding response ends up reading as a
        # clean estate when it means no telemetry.
        sources = []
        if calls.live:
            sources.append("cloudtrail")
        if endpoint.managed_hosts is not None:
            sources.append("ssm")
        if endpoint.hosts_with_applications > 0:
            sources.append("ssm-inventory")
        if dns.total_vpcs > 0:
            sources.append("ec2-vpc")

        return AiToolProvenanceResponse(
            records=[_provenance_record_model(r) for r in records],
            total_records=len(records),
            by_call_path=buckets["by_call_path"],
            by_install_provenance=buckets["by_install_provenance"],
            by_tool_class=buckets["by_tool_class"],
            coding_tool_count=len(coding_tools),
            needs_attention_count=len(attention),
            calls_observed=calls.calls_observed,
            window_days=days,
            coverage=_coverage_model(coverage),
            live=calls.live or endpoint.managed_hosts is not None,
            source="+".join(sources) if sources else "unavailable",
            note=self._provenance_note(records, coding_tools, calls, endpoint, dns, days),
        )

    def _provenance_note(self, records, coding_tools, calls, endpoint, dns, days: int) -> str:
        """State what was found AND what could not be looked for, in one line.

        Written deliberately: the interesting case is zero coding tools with zero DNS
        coverage, which must not read as "no shadow AI".
        """
        parts = [
            f"{len(records)} caller/tool pairs over {days}d "
            f"({len(coding_tools)} identified coding tools, {calls.calls_observed} calls)"
        ]
        if endpoint.managed_hosts is None:
            parts.append("endpoint inventory unavailable, so no install could be classified")
        elif endpoint.host_total > 0:
            parts.append(
                f"endpoint management covers {endpoint.managed_count}/{endpoint.host_total} hosts"
            )
        if dns.logged_vpcs == 0:
            parts.append(
                f"no DNS query logging on {dns.total_vpcs} VPCs, so vendor public-API use is "
                "not detectable — absence of public_api here is not evidence of absence"
            )
        return "; ".join(parts)

    # ── Signal 1: CloudTrail ──────────────────────────────────────────────────

    def _fetch_bedrock_calls(self, days: int, ip_to_instance: Dict[str, str]) -> _ProvenanceCalls:
        """Read Bedrock invocations from CloudTrail and classify caller + call path.

        CloudTrail is the only source here that proves a call path today, and it can only
        ever prove `bedrock` — by construction it sees nothing else. That asymmetry is the
        whole reason the coverage figures exist.
        """
        import json

        by_key: Dict[tuple, ProvenanceRecord] = {}
        calls_observed = 0
        live = False

        try:
            ct = boto3.client("cloudtrail", region_name=self.region)
        except (ClientError, BotoCoreError) as e:
            logger.warning("CloudTrail client unavailable for provenance: %s", e)
            return _ProvenanceCalls(records=[], calls_observed=0, live=False)

        start = datetime.now(timezone.utc) - timedelta(days=days)
        invocation_events = {
            "InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream",
            "InvokeAgent", "InvokeFlow", "InvokeInlineAgent", "RetrieveAndGenerate",
        }

        for event_source in sorted(BEDROCK_EVENT_SOURCES):
            try:
                paginator = ct.get_paginator("lookup_events")
                pages = paginator.paginate(
                    LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": event_source}],
                    StartTime=start,
                    PaginationConfig={"MaxItems": 2000, "PageSize": 50},
                )
                for page in pages:
                    live = True
                    for event in page.get("Events", []):
                        if event.get("EventName", "") not in invocation_events:
                            continue

                        try:
                            detail = json.loads(event.get("CloudTrailEvent", "{}"))
                        except (ValueError, TypeError):
                            detail = {}

                        user_agent = detail.get("userAgent")
                        identity = detail.get("userIdentity") or {}
                        source_ip = detail.get("sourceIPAddress")
                        principal = event.get("Username") or identity.get("arn") or "unknown"
                        request_params = detail.get("requestParameters") or {}
                        model_id = request_params.get("modelId") or "unknown"

                        tool = classify_tool(user_agent)
                        path = classify_call_path(event_source=event_source)
                        host = attribute_host(
                            user_identity=identity,
                            source_ip=source_ip,
                            ip_to_instance=ip_to_instance,
                        )

                        calls_observed += 1
                        # Key on host too: the same role on two hosts is two provenance
                        # facts, and merging them would hide a managed/unmanaged split.
                        key = (principal, tool.tool, host.host_id)
                        event_time = event.get("EventTime")
                        stamp = (
                            event_time.isoformat() if hasattr(event_time, "isoformat")
                            else datetime.now(timezone.utc).isoformat()
                        )

                        rec = by_key.get(key)
                        if rec is None:
                            rec = ProvenanceRecord(
                                principal=mask_arn(principal) if principal.startswith("arn:") else principal,
                                tool=tool.tool,
                                tool_class=tool.tool_class,
                                call_path=path.call_path,
                                install=InstallProvenance.UNKNOWN_HOST,
                                version=tool.version,
                                icon=tool.icon,
                                host_id=host.host_id,
                                source_ip=source_ip,
                                provider=path.provider,
                                exec_env=detect_exec_env(user_agent),
                                user_agent=(user_agent or "")[:180] or None,
                                first_seen=stamp,
                                last_seen=stamp,
                                tool_evidence=tool.evidence,
                                call_path_evidence=path.evidence,
                                host_evidence=host.evidence,
                            )
                            by_key[key] = rec

                        rec.requests += 1
                        rec.models.add(model_id.split("/")[-1] if "/" in model_id else model_id)
                        if stamp > (rec.last_seen or ""):
                            rec.last_seen = stamp
                        if rec.first_seen and stamp < rec.first_seen:
                            rec.first_seen = stamp

            except (ClientError, BotoCoreError) as e:
                logger.debug("CloudTrail lookup for %s failed: %s", event_source, e)
                continue

        return _ProvenanceCalls(records=list(by_key.values()), calls_observed=calls_observed, live=live)

    # ── Signal 2: SSM endpoint + package inventory ────────────────────────────

    def _fetch_endpoint_inventory(self) -> _EndpointInventory:
        """Read the managed-host set, their private IPs, and their package inventory.

        `managed_hosts=None` on failure is load-bearing. An empty set means "we looked and
        nothing is managed"; None means "we could not look". Both produce `unknown_host`
        verdicts, but only the first is a real measurement of the estate, and the coverage
        note distinguishes them for the reader.
        """
        managed_hosts: Optional[Set[str]] = None
        ip_to_instance: Dict[str, str] = {}
        note: Optional[str] = None

        try:
            ssm = boto3.client("ssm", region_name=self.region)
            managed_hosts = set()
            paginator = ssm.get_paginator("describe_instance_information")
            for page in paginator.paginate(PaginationConfig={"MaxItems": 500}):
                for inst in page.get("InstanceInformationList", []):
                    instance_id = inst.get("InstanceId")
                    if not instance_id:
                        continue
                    managed_hosts.add(instance_id)
                    ip = inst.get("IPAddress")
                    if ip:
                        ip_to_instance[ip] = instance_id
        except (ClientError, BotoCoreError) as e:
            logger.warning("SSM managed-instance read failed: %s", e)
            managed_hosts = None
            note = f"SSM inventory unreadable: {str(e)[:80]}"

        # Package inventory, per managed host. Capped: this is one API call per host and
        # the denominator it feeds is only meaningful when it stays cheap enough to run
        # on every request. Hosts beyond the cap are excluded from BOTH sides of the
        # package-inventory ratio rather than counted as uninventoried.
        host_applications: Dict[str, Set[str]] = {}
        inventory_note: Optional[str] = None
        if managed_hosts:
            capped = sorted(managed_hosts)[:_PROVENANCE_INVENTORY_HOST_CAP]
            if len(managed_hosts) > len(capped):
                inventory_note = (
                    f"Package inventory sampled on {len(capped)} of {len(managed_hosts)} "
                    "managed hosts to bound request cost"
                )
            try:
                ssm = boto3.client("ssm", region_name=self.region)
                for instance_id in capped:
                    try:
                        resp = ssm.list_inventory_entries(
                            InstanceId=instance_id,
                            TypeName="AWS:Application",
                            MaxResults=50,
                        )
                        entries = resp.get("Entries") or []
                        if entries:
                            host_applications[instance_id] = {
                                (e.get("Name") or "") for e in entries if e.get("Name")
                            }
                    except (ClientError, BotoCoreError) as e:
                        logger.debug("SSM inventory for %s failed: %s", instance_id, e)
                        continue
            except (ClientError, BotoCoreError) as e:
                logger.warning("SSM inventory client failed: %s", e)
                inventory_note = f"Package inventory unavailable: {str(e)[:80]}"

        host_total = self._count_ec2_hosts()
        if host_total is None:
            # No EC2 denominator: report the managed set as its own denominator rather
            # than inventing a total. A ratio of managed/managed would claim 100% endpoint
            # coverage of an estate we never sized, which is the kind of flattering
            # fabrication this module exists to avoid.
            host_total = 0
            note = "; ".join(filter(None, [note, "EC2 host count unavailable, so endpoint coverage has no denominator"]))

        return _EndpointInventory(
            managed_hosts=managed_hosts,
            managed_count=len(managed_hosts) if managed_hosts else 0,
            host_total=host_total,
            ip_to_instance=ip_to_instance,
            host_applications=host_applications,
            hosts_with_applications=len(host_applications),
            note=note,
            inventory_note=inventory_note,
        )

    def _count_ec2_hosts(self) -> Optional[int]:
        """Count EC2 instances that could be running an AI tool.

        Terminated instances are excluded — counting them would inflate the denominator and
        understate endpoint coverage. Returns None when EC2 cannot be read, so the caller
        can say "no denominator" instead of guessing one.
        """
        try:
            ec2 = boto3.client("ec2", region_name=self.region)
            total = 0
            paginator = ec2.get_paginator("describe_instances")
            for page in paginator.paginate(
                Filters=[{
                    "Name": "instance-state-name",
                    "Values": ["pending", "running", "stopping", "stopped"],
                }],
                PaginationConfig={"MaxItems": 2000},
            ):
                for reservation in page.get("Reservations", []):
                    total += len(reservation.get("Instances", []))
            return total
        except (ClientError, BotoCoreError) as e:
            logger.warning("EC2 host count failed: %s", e)
            return None

    # ── Signal 3: DNS query logging coverage ──────────────────────────────────

    def _fetch_dns_log_coverage(self) -> _DnsCoverage:
        """Measure how many VPCs have Route 53 Resolver query logging attached.

        This gates `public_api` entirely: with no query logging there is no signal that a
        tool called a vendor endpoint, so that classification can never be earned. The
        number is reported so the gap is visible rather than implied by an absence.
        """
        total_vpcs = 0
        logged_vpcs = 0
        note: Optional[str] = None

        try:
            ec2 = boto3.client("ec2", region_name=self.region)
            paginator = ec2.get_paginator("describe_vpcs")
            for page in paginator.paginate(PaginationConfig={"MaxItems": 200}):
                total_vpcs += len(page.get("Vpcs", []))
        except (ClientError, BotoCoreError) as e:
            logger.warning("VPC count failed: %s", e)
            note = f"VPC count unavailable: {str(e)[:80]}"

        try:
            r53 = boto3.client("route53resolver", region_name=self.region)
            associated_vpcs: Set[str] = set()
            paginator = r53.get_paginator("list_resolver_query_log_config_associations")
            for page in paginator.paginate(PaginationConfig={"MaxItems": 500}):
                for assoc in page.get("ResolverQueryLogConfigAssociations", []):
                    # Only ACTIVE associations count. A FAILED or CREATING association
                    # produces no queryable logs, and counting it would claim coverage
                    # that does not exist.
                    if (assoc.get("Status") or "").upper() != "ACTIVE":
                        continue
                    vpc_id = assoc.get("ResourceId")
                    if vpc_id:
                        associated_vpcs.add(vpc_id)
            logged_vpcs = len(associated_vpcs)
        except (ClientError, BotoCoreError) as e:
            logger.warning("Resolver query-log association read failed: %s", e)
            note = "; ".join(filter(None, [note, f"Resolver query-log config unreadable: {str(e)[:80]}"]))

        return _DnsCoverage(total_vpcs=total_vpcs, logged_vpcs=logged_vpcs, note=note)

    def _assess_inference_risk(self, requests: int, models: set, user: str) -> str:
        """Assess risk level based on inference patterns."""
        # High request volume = higher risk (potential automation/runaway)
        if requests >= 100:
            return "high"

        # Powerful models = higher risk
        high_risk_models = ["opus", "claude-3", "gpt-4", "claude-opus"]
        for model in models:
            model_lower = model.lower()
            if any(hrm in model_lower for hrm in high_risk_models):
                if requests >= 20:
                    return "high"
                return "medium"

        # Service accounts = higher risk
        if "service" in user.lower() or "workload" in user.lower() or "automation" in user.lower():
            return "high"

        # Low activity = low risk
        if requests < 10:
            return "low"

        return "medium"

    def _scan_codecommit_for_agents(self, limit: int = 100) -> LocalAgentDiscoveryResponse:
        """Scan CodeCommit repositories for local agent configuration files.

        Looks for known agent config patterns:
        - CLAUDE.md (Claude Code)
        - .github/copilot-instructions.md (GitHub Copilot)
        - .cursor/rules/ (Cursor)
        - .kiro/steering/ (Kiro)
        - .aws/amazonq/ (Q Desktop)
        - AGENTS.md (OpenAI Codex)
        """
        try:
            cc = boto3.client("codecommit", region_name=self.region)

            # List all repositories
            repos = []
            paginator = cc.get_paginator("list_repositories")
            for page in paginator.paginate():
                repos.extend(page.get("repositories", []))
                if len(repos) >= limit * 2:  # Get extra to account for repos without agents
                    break

            agents: List[LocalAgentConfig] = []
            tool_counts: dict = {p["tool"]: 0 for p in self.AGENT_CONFIG_PATTERNS}
            repos_with_agents = set()

            for repo in repos[:limit * 2]:
                repo_name = repo.get("repositoryName", "")

                # Get repo metadata for owner/team info
                try:
                    repo_meta = cc.get_repository(repositoryName=repo_name)
                    repo_info = repo_meta.get("repositoryMetadata", {})
                    repo_arn = repo_info.get("Arn", "")
                    default_branch = repo_info.get("defaultBranch", "main")
                except (ClientError, BotoCoreError):
                    repo_arn = ""
                    default_branch = "main"

                # Check each agent config pattern
                for pattern_info in self.AGENT_CONFIG_PATTERNS:
                    pattern = pattern_info["pattern"]
                    tool = pattern_info["tool"]
                    icon = pattern_info["icon"]

                    try:
                        # Try to get the file/folder
                        if pattern.endswith("/"):
                            # It's a directory - try to get folder contents
                            try:
                                folder_resp = cc.get_folder(
                                    repositoryName=repo_name,
                                    folderPath=pattern.rstrip("/"),
                                    commitSpecifier=default_branch,
                                )
                                # Found a folder - check for files inside
                                files = folder_resp.get("files", [])
                                if files:
                                    for f in files[:5]:  # Limit files per folder
                                        file_path = f.get("absolutePath", pattern)
                                        agent = self._process_agent_file(
                                            cc, repo_name, repo_arn, file_path, tool, icon, default_branch
                                        )
                                        if agent:
                                            agents.append(agent)
                                            tool_counts[tool] = tool_counts.get(tool, 0) + 1
                                            repos_with_agents.add(repo_name)
                            except cc.exceptions.FolderDoesNotExistException:
                                pass
                        else:
                            # It's a file - try to get it directly
                            agent = self._process_agent_file(
                                cc, repo_name, repo_arn, pattern, tool, icon, default_branch
                            )
                            if agent:
                                agents.append(agent)
                                tool_counts[tool] = tool_counts.get(tool, 0) + 1
                                repos_with_agents.add(repo_name)

                    except (ClientError, BotoCoreError) as e:
                        # File/folder doesn't exist or access denied - that's fine
                        logger.debug("Pattern %s not found in %s: %s", pattern, repo_name, e)
                        continue

                if len(agents) >= limit:
                    break

            # Build tool summaries
            by_tool = [
                LocalAgentToolSummary(
                    tool=p["tool"],
                    file_pattern=p["pattern"],
                    count=tool_counts.get(p["tool"], 0),
                    icon=p["icon"],
                )
                for p in self.AGENT_CONFIG_PATTERNS
                if tool_counts.get(p["tool"], 0) > 0
            ]

            # Count by risk level
            risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for agent in agents:
                risk_counts[agent.risk_level] = risk_counts.get(agent.risk_level, 0) + 1

            return LocalAgentDiscoveryResponse(
                agents=agents[:limit],
                total_found=len(agents),
                by_tool=by_tool,
                repos_scanned=len(repos),
                repos_with_agents=len(repos_with_agents),
                critical_count=risk_counts["critical"],
                high_count=risk_counts["high"],
                medium_count=risk_counts["medium"],
                low_count=risk_counts["low"],
                live=True,
                source="codecommit",
                note=f"Scanned {len(repos)} CodeCommit repos" if repos else None,
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("CodeCommit agent discovery failed: %s", e)
            return LocalAgentDiscoveryResponse(
                live=False,
                source="codecommit-unavailable",
                note=f"CodeCommit access failed: {str(e)[:100]}",
            )

    def _process_agent_file(
        self, cc, repo_name: str, repo_arn: str, file_path: str,
        tool: str, icon: str, branch: str
    ) -> Optional[LocalAgentConfig]:
        """Process a potential agent config file and return LocalAgentConfig if valid."""
        try:
            file_resp = cc.get_file(
                repositoryName=repo_name,
                filePath=file_path,
                commitSpecifier=branch,
            )

            content_bytes = file_resp.get("fileContent", b"")
            file_size = len(content_bytes)

            # Decode content for analysis
            try:
                content = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content = ""

            # Extract description from content (first non-empty line or heading)
            description = self._extract_description(content)

            # Assess risk level based on content
            risk_level = self._assess_agent_risk(content, repo_name)

            # Get commit info for last modifier
            commit_id = file_resp.get("commitId", "")
            owner = None
            last_modified = None

            if commit_id:
                try:
                    commit_resp = cc.get_commit(
                        repositoryName=repo_name,
                        commitId=commit_id,
                    )
                    commit_info = commit_resp.get("commit", {})
                    author = commit_info.get("author", {})
                    owner = author.get("name") or author.get("email", "").split("@")[0]
                    commit_date = commit_info.get("committer", {}).get("date")
                    if commit_date:
                        last_modified = commit_date
                except (ClientError, BotoCoreError):
                    pass

            return LocalAgentConfig(
                repo_name=repo_name,
                repo_arn=repo_arn,
                file_path=file_path,
                tool=tool,
                owner=owner,
                team=None,  # Would need repo tags
                last_modified=last_modified,
                risk_level=risk_level,
                description=description,
                file_size_bytes=file_size,
                content_preview=content[:500] if content else None,
            )

        except cc.exceptions.FileDoesNotExistException:
            return None
        except (ClientError, BotoCoreError) as e:
            logger.debug("Failed to process %s in %s: %s", file_path, repo_name, e)
            return None

    def _extract_description(self, content: str) -> Optional[str]:
        """Extract a description from agent config content."""
        if not content:
            return None

        lines = content.strip().split("\n")
        for line in lines[:10]:  # Check first 10 lines
            line = line.strip()
            # Skip empty lines and markdown headers markers only
            if not line or line == "#" or line == "##" or line == "###":
                continue
            # Remove markdown header prefix
            if line.startswith("#"):
                line = line.lstrip("#").strip()
            # Skip very short lines
            if len(line) < 5:
                continue
            # Return first meaningful line (truncated)
            return line[:200] if len(line) > 200 else line

        return None

    def _assess_agent_risk(self, content: str, repo_name: str) -> str:
        """Assess the risk level of an agent config based on content and repo name."""
        content_lower = content.lower()
        repo_lower = repo_name.lower()

        # Check for critical risk keywords
        for keyword in self.RISK_KEYWORDS["critical"]:
            if keyword in content_lower or keyword in repo_lower:
                return "critical"

        # Check for high risk keywords
        for keyword in self.RISK_KEYWORDS["high"]:
            if keyword in content_lower or keyword in repo_lower:
                return "high"

        # Check for medium risk keywords
        for keyword in self.RISK_KEYWORDS["medium"]:
            if keyword in content_lower or keyword in repo_lower:
                return "medium"

        return "low"

    # -------------------------------------------------------------------------
    # Policy Engine
    # -------------------------------------------------------------------------

    # In-memory policy storage (would be DynamoDB in production)
    _policies: dict = {}
    _active_policy_id: str = "default"

    @classmethod
    def _init_default_policy(cls):
        """Initialize default policy if not exists."""
        if "default" not in cls._policies:
            cls._policies["default"] = AgentPolicy(
                id="default",
                name="Default Agent Policy",
                description="Default governance policy for agentic coding tools",
                approved_tools=["claude-cli", "claude-code", "kiro", "amazonq", "aws-toolkit-vscode", "boto3"],
                blocked_tools=[],
                review_tools=["cursor", "copilot", "continue"],
                approved_models=["anthropic.claude-*", "us.anthropic.claude-*", "amazon.nova-*", "amazon.titan-*", "us.amazon.nova-*"],
                blocked_models=[],
                approved_users=[],
                blocked_users=[],
                max_requests_per_hour=200,
                max_daily_cost_usd=100.0,
                require_guardrails=False,
                is_active=True,
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
            )

    def get_policies(self) -> PolicyListResponse:
        """Get all configured policies."""
        self._init_default_policy()
        return PolicyListResponse(
            policies=list(self._policies.values()),
            active_policy_id=self._active_policy_id,
            live=True,
            source="in-memory",
        )

    def get_policy(self, policy_id: str = "default") -> AgentPolicy:
        """Get a specific policy by ID."""
        self._init_default_policy()
        if policy_id in self._policies:
            return self._policies[policy_id]
        raise ValueError(f"Policy not found: {policy_id}")

    def update_policy(self, policy_id: str, update: PolicyUpdateRequest) -> AgentPolicy:
        """Update an existing policy."""
        self._init_default_policy()
        if policy_id not in self._policies:
            raise ValueError(f"Policy not found: {policy_id}")

        policy = self._policies[policy_id]

        # Update fields that are provided
        update_dict = update.dict(exclude_unset=True)
        for key, value in update_dict.items():
            if value is not None and hasattr(policy, key):
                setattr(policy, key, value)

        policy.updated_at = datetime.now(timezone.utc).isoformat()

        # Clear the policy evaluation cache since rules changed
        # (Cache keys include policy_id so new evaluations will use updated rules)

        return policy

    def create_policy(self, policy: AgentPolicy) -> AgentPolicy:
        """Create a new policy."""
        self._init_default_policy()
        if policy.id in self._policies:
            raise ValueError(f"Policy already exists: {policy.id}")

        policy.created_at = datetime.now(timezone.utc).isoformat()
        policy.updated_at = policy.created_at
        self._policies[policy.id] = policy
        return policy

    def delete_policy(self, policy_id: str) -> bool:
        """Delete a policy (cannot delete default)."""
        if policy_id == "default":
            raise ValueError("Cannot delete the default policy")
        if policy_id not in self._policies:
            raise ValueError(f"Policy not found: {policy_id}")

        del self._policies[policy_id]

        # Reset active policy if deleted
        if self._active_policy_id == policy_id:
            self._active_policy_id = "default"

        return True

    def set_active_policy(self, policy_id: str) -> PolicyListResponse:
        """Set which policy is active."""
        self._init_default_policy()
        if policy_id not in self._policies:
            raise ValueError(f"Policy not found: {policy_id}")

        self._active_policy_id = policy_id
        return self.get_policies()

    def evaluate_policy(self, policy_id: str = "default", days: int = 7) -> PolicyEvaluationResult:
        """Evaluate recent activity against a policy and return violations."""
        key = f"developer-ai:policy-eval:{self.region}:{policy_id}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._evaluate_policy_impl(policy_id, days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _evaluate_policy_impl(self, policy_id: str, days: int) -> PolicyEvaluationResult:
        """Evaluate CloudTrail activity against policy rules."""
        import json
        import fnmatch
        import uuid

        policy = self.get_policy(policy_id)
        violations: List[PolicyViolation] = []
        approved_count = 0
        blocked_count = 0
        review_count = 0
        total_evaluated = 0

        try:
            # No local CloudTrail client or window here: _lookup_bedrock_invocation_events
            # owns both, so that all cuts share one paged, cached pass.

            # Track activity by user+tool for aggregation
            activity: dict = {}  # key: (user, tool, model) -> activity data

            # CloudTrail SERVER-CLAMPS lookup_events MaxResults to 50. Asking for 500 here
            # returned exactly 50 plus a NextToken (measured), and nothing paged past it.
            #
            # The deeper defect was the lookup AXIS, not the page size. See the note at
            # _BEDROCK_INVOKE_EVENTS: EventSource is the wrong axis. Measured on this account
            # over a 30-day window, EventSource=bedrock.amazonaws.com returned a first page of
            # 50 CONTROL-PLANE events (ListEvaluationJobs, ListDataSources, GetKnowledgeBase,
            # ...) containing ZERO invocations, and EventSource=bedrock-runtime.amazonaws.com
            # returned 0 events at all, because InvokeModel/Converse are CloudTrail *data*
            # events and data events are not enabled here. So the InvokeModel/Converse filter
            # below matched nothing on every request, and this function reported "nothing
            # detected" as a measured fact about the account rather than as a lookup that
            # never had a chance of finding anything.
            #
            # _lookup_bedrock_invocation_events pages by EventName via core/cloudtrail_paging,
            # shares one cache across every cut, and returns a note when a
            # bound was hit so callers can say their counts are a floor.
            events, truncation_note = self._lookup_bedrock_invocation_events(days)
            for event in events:
                    event_name = event.get("EventName", "")
                    username = event.get("Username", "unknown")
                    event_time = event.get("EventTime")

                    if event_name not in ["InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"]:
                        continue

                    total_evaluated += 1

                    try:
                        ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                        user_agent = ct_event.get("userAgent", "unknown")
                        request_params = ct_event.get("requestParameters") or {}
                        model_id = request_params.get("modelId", "unknown")
                    except Exception:
                        user_agent = "unknown"
                        model_id = "unknown"

                    # Skip service accounts
                    if username in ["SageMaker", "ConfigResourceCompositionSession"]:
                        continue

                    # Extract tool name from userAgent
                    tool_name = user_agent.split("/")[0].lower() if "/" in user_agent else user_agent.lower()
                    model_short = model_id.split("/")[-1] if "/" in model_id else model_id

                    event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                    # Track activity
                    key = (username, tool_name, model_short)
                    if key not in activity:
                        activity[key] = {
                            "user": username,
                            "tool": tool_name,
                            "tool_full": user_agent,
                            "model": model_short,
                            "model_full": model_id,
                            "count": 0,
                            "first_seen": event_time_str,
                            "last_seen": event_time_str,
                        }
                    activity[key]["count"] += 1
                    if event_time_str > activity[key]["last_seen"]:
                        activity[key]["last_seen"] = event_time_str


            # Evaluate each activity against policy
            for (user, tool, model), data in activity.items():
                tool_status = self._evaluate_tool(tool, policy)
                model_status = self._evaluate_model(data["model_full"], policy)
                user_status = self._evaluate_user(user, policy)

                # Determine overall status (most restrictive wins)
                if PolicyStatus.BLOCKED in [tool_status, model_status, user_status]:
                    overall_status = PolicyStatus.BLOCKED
                    blocked_count += data["count"]
                elif PolicyStatus.REVIEW in [tool_status, model_status, user_status]:
                    overall_status = PolicyStatus.REVIEW
                    review_count += data["count"]
                else:
                    overall_status = PolicyStatus.APPROVED
                    approved_count += data["count"]

                # Create violation if not approved
                if overall_status != PolicyStatus.APPROVED:
                    # Determine what triggered the violation
                    if tool_status == overall_status:
                        violation_type = "tool"
                        rule_matched = tool
                    elif model_status == overall_status:
                        violation_type = "model"
                        rule_matched = data["model_full"]
                    else:
                        violation_type = "user"
                        rule_matched = user

                    severity = "high" if overall_status == PolicyStatus.BLOCKED else "medium"

                    violations.append(PolicyViolation(
                        id=str(uuid.uuid4())[:8],
                        violation_type=violation_type,
                        severity=severity,
                        user=user,
                        tool=data["tool_full"],
                        model=data["model_full"],
                        rule_matched=rule_matched,
                        policy_status=overall_status,
                        request_count=data["count"],
                        first_seen=data["first_seen"],
                        last_seen=data["last_seen"],
                        action_taken="flagged" if overall_status == PolicyStatus.REVIEW else "auto-blocked",
                    ))

            # Sort violations by severity and count
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            violations.sort(key=lambda v: (severity_order.get(v.severity, 4), -v.request_count))

            # Aggregate by type and severity
            violations_by_type: dict = {}
            violations_by_severity: dict = {}
            for v in violations:
                violations_by_type[v.violation_type] = violations_by_type.get(v.violation_type, 0) + 1
                violations_by_severity[v.severity] = violations_by_severity.get(v.severity, 0) + 1

            return PolicyEvaluationResult(
                policy_id=policy.id,
                policy_name=policy.name,
                total_evaluated=total_evaluated,
                approved_count=approved_count,
                blocked_count=blocked_count,
                review_count=review_count,
                violations=violations,
                violations_by_type=violations_by_type,
                violations_by_severity=violations_by_severity,
                live=True,
                source="cloudtrail",
                note="; ".join(filter(None, [
                    f"Evaluated {total_evaluated} events from last {days} days",
                    # A truncated sweep means the violation counts are a floor. Saying so
                    # matters more here than anywhere else in this file: an under-count of
                    # policy violations reads as compliance.
                    truncation_note,
                ])),
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("Policy evaluation failed: %s", e)
            return PolicyEvaluationResult(
                policy_id=policy_id,
                policy_name="Unknown",
                live=False,
                source="unavailable",
                note=f"CloudTrail access failed: {str(e)[:100]}",
            )

    def _evaluate_tool(self, tool: str, policy: AgentPolicy) -> PolicyStatus:
        """Evaluate a tool against policy rules."""
        import fnmatch
        tool_lower = tool.lower()

        # Check blocked first (most restrictive)
        for pattern in policy.blocked_tools:
            if fnmatch.fnmatch(tool_lower, pattern.lower()):
                return PolicyStatus.BLOCKED

        # Check review
        for pattern in policy.review_tools:
            if fnmatch.fnmatch(tool_lower, pattern.lower()):
                return PolicyStatus.REVIEW

        # Check approved
        for pattern in policy.approved_tools:
            if fnmatch.fnmatch(tool_lower, pattern.lower()):
                return PolicyStatus.APPROVED

        # Default: require review for unknown tools
        return PolicyStatus.REVIEW

    def _evaluate_model(self, model_id: str, policy: AgentPolicy) -> PolicyStatus:
        """Evaluate a model against policy rules."""
        import fnmatch
        model_lower = model_id.lower()

        # Also check just the model name without the ARN prefix
        # e.g., "arn:aws:bedrock:us-east-1:123:inference-profile/us.anthropic.claude-opus-4-5" -> "us.anthropic.claude-opus-4-5"
        model_short = model_id.split("/")[-1].lower() if "/" in model_id else model_lower

        # Check blocked first
        for pattern in policy.blocked_models:
            pattern_lower = pattern.lower()
            if fnmatch.fnmatch(model_lower, pattern_lower) or fnmatch.fnmatch(model_short, pattern_lower):
                return PolicyStatus.BLOCKED

        # Check approved - match against both full ARN and short name
        for pattern in policy.approved_models:
            pattern_lower = pattern.lower()
            if fnmatch.fnmatch(model_lower, pattern_lower) or fnmatch.fnmatch(model_short, pattern_lower):
                return PolicyStatus.APPROVED

        # Default: require review for unknown models
        return PolicyStatus.REVIEW

    def _evaluate_user(self, user: str, policy: AgentPolicy) -> PolicyStatus:
        """Evaluate a user against policy rules."""
        import fnmatch
        user_lower = user.lower()

        # Check blocked first
        for pattern in policy.blocked_users:
            if fnmatch.fnmatch(user_lower, pattern.lower()):
                return PolicyStatus.BLOCKED

        # Check approved
        for pattern in policy.approved_users:
            if fnmatch.fnmatch(user_lower, pattern.lower()):
                return PolicyStatus.APPROVED

        # Default: approved (no user restrictions by default)
        return PolicyStatus.APPROVED

    # -------------------------------------------------------------------------
    # Cost Attribution
    # -------------------------------------------------------------------------

    # -------------------------------------------------------------------------
    # Model token rates now live in core/model_pricing.py, shared with every other
    # pricing surface. The local MODEL_COSTS table was removed because it
    # disagreed with the other tables on the same models: it priced Opus 4.5 and
    # Opus 4.8 at Claude-3-Opus rates (0.015/0.075 per 1K, 3x the published
    # $5/$25 per 1M) because they fell past `claude-opus-5` into a bare
    # `claude-opus` family key, and its generic `titan` row (0.0003/0.0004)
    # matched no published Titan price while overstating Titan Embeddings V2
    # input 15x and inventing an output rate for a model with no output tokens.
    #
    # The shared module keeps the properties this table had that mattered:
    # substring match with order load-bearing, and NO fallback rate, so an
    # unpriced model reports None and is named in the response note rather than
    # being silently priced at some other model's rate.
    # -------------------------------------------------------------------------

    def _rate_for_model(self, model: str) -> Optional[ModelRate]:
        """Per-1K rates for a model id, or None when nothing prices it."""
        return rate_for_model(model)

    def _price_tokens(
        self, model: str, input_tokens: Optional[int], output_tokens: Optional[int]
    ) -> Optional[float]:
        """USD for measured token counts, or None when not priceable.

        None when the model has no rate entry, or when NOTHING was measured. A
        measured 0 is a real zero - guardrail-blocked calls consume no tokens -
        and prices to $0.00, which is materially different from None.
        """
        return price_tokens(model, input_tokens, output_tokens)

    # Tool name normalization patterns
    TOOL_PATTERNS = [
        {"pattern": "amazonq", "name": "Q Desktop"},
        {"pattern": "amazon-q", "name": "Q Desktop"},
        {"pattern": "aws-toolkit", "name": "AWS Toolkit"},
        {"pattern": "claude-cli", "name": "Claude Code"},
        {"pattern": "claude-code", "name": "Claude Code"},
        {"pattern": "cursor", "name": "Cursor"},
        {"pattern": "kiro", "name": "Kiro"},
        {"pattern": "copilot", "name": "GitHub Copilot"},
        {"pattern": "codewhisperer", "name": "CodeWhisperer"},
        {"pattern": "boto3", "name": "Boto3"},
        {"pattern": "botocore", "name": "Boto3"},
    ]

    def _normalize_tool_name(self, raw_tool: str, full_user_agent: str) -> str:
        """Normalize tool name from userAgent string."""
        ua_lower = full_user_agent.lower()
        raw_lower = raw_tool.lower()

        # Check patterns against full userAgent first
        for p in self.TOOL_PATTERNS:
            if p["pattern"] in ua_lower:
                return p["name"]

        # Check raw tool name
        for p in self.TOOL_PATTERNS:
            if p["pattern"] in raw_lower:
                return p["name"]

        # Capitalize first letter for display
        return raw_tool.title() if raw_tool else "Unknown"

    def get_cost_attribution(self, days: int = 7) -> CostAttributionResponse:
        """Get cost attribution breakdown by tool, user, and model."""
        key = f"developer-ai:cost-attribution:{self.region}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._calculate_cost_attribution(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _calculate_cost_attribution(self, days: int = 7) -> CostAttributionResponse:
        """Cost attribution from CloudTrail events plus MEASURED Bedrock tokens.

        Tokens are read from the Bedrock model-invocation log group and priced per
        model. They are NOT derived from the event count. CloudTrail management
        events carry no token data at all (requestParameters holds only modelId;
        responseElements is null), so the previous fixed 2000-in / 1000-out
        per-request estimate was a fabrication — and a badly wrong one: the model
        dominating this account's traffic averages under 1 token per call because
        its calls are guardrail-blocked, while the next one averages over 900
        output tokens per call.

        Attribution paths, in decreasing directness:
          by_model — measured per model. Authoritative; the response total derives
                     from it, so every other cut reconciles against the same rates.
          by_user  — measured per (identity, model).
          trend    — measured per (day, model).
          by_tool  — the ONE apportioned cut. The invocation logs record the caller
                     identity but not the userAgent, so an identity's measured
                     (identity, model) tokens are split across the tools it used in
                     proportion to their CloudTrail event share. Exact whenever an
                     identity used a single tool, which is the common case.

        When tokens cannot be measured the request counts are still returned (they
        are real) but every cost is zero/None with live=False and the reason in
        `note` — there is no estimated-token fallback.
        """
        import json
        from collections import defaultdict

        try:
            events, truncation_note = self._lookup_bedrock_invocation_events(days)
            tokens = self.get_invocation_tokens(days)

            # Service principals that are not developer AI usage.
            skip_users = {"SageMaker", "ConfigResourceCompositionSession"}

            total_requests = 0
            req_by_tool: dict = defaultdict(int)
            users_by_tool: dict = defaultdict(set)
            req_by_user: dict = defaultdict(int)
            tools_by_user: dict = defaultdict(set)
            models_by_user: dict = defaultdict(set)
            req_by_model: dict = defaultdict(int)
            users_by_model: dict = defaultdict(set)
            req_by_date: dict = defaultdict(int)
            # Event counts keyed by (identity, model, tool) and (identity, model) —
            # the denominators for the by_tool apportionment below.
            ev_by_umt: dict = defaultdict(int)
            ev_by_um: dict = defaultdict(int)

            for event in events:
                event_name = event.get("EventName", "")
                username = event.get("Username", "unknown")
                event_time = event.get("EventTime")

                if event_name not in _BEDROCK_INVOKE_EVENTS:
                    continue
                if username in skip_users:
                    continue

                try:
                    ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                    user_agent = ct_event.get("userAgent", "unknown")
                    request_params = ct_event.get("requestParameters") or {}
                    raw_model_id = request_params.get("modelId") or "unknown"
                    event_source = ct_event.get("eventSource") or ""
                except Exception:
                    user_agent = "unknown"
                    raw_model_id = "unknown"
                    event_source = ""

                # EventName lookup is service-agnostic — confirm this is Bedrock.
                if event_source not in _BEDROCK_EVENT_SOURCES:
                    continue

                total_requests += 1

                raw_tool = user_agent.split("/")[0] if "/" in user_agent else user_agent
                tool_name = self._normalize_tool_name(raw_tool, user_agent)
                # Normalized identically to the invocation-log side so the token
                # join lands, and stripped of the account id that an
                # inference-profile ARN would otherwise carry into the response.
                model_short = _short_model(raw_model_id)
                event_date = event_time.strftime("%Y-%m-%d") if event_time else datetime.now(timezone.utc).strftime("%Y-%m-%d")

                req_by_tool[tool_name] += 1
                users_by_tool[tool_name].add(username)
                req_by_user[username] += 1
                tools_by_user[username].add(tool_name)
                models_by_user[username].add(model_short)
                req_by_model[model_short] += 1
                users_by_model[model_short].add(username)
                req_by_date[event_date] += 1
                ev_by_umt[(username, model_short, tool_name)] += 1
                ev_by_um[(username, model_short)] += 1

            # ---------------------------------------------------------------
            # Join measured tokens onto each cut
            # ---------------------------------------------------------------
            unpriced: Set[str] = set()

            def price_bucket(model_tokens: dict) -> float:
                """Sum per-model prices for one bucket, skipping unrated models.

                Every cut is priced per model rather than at a single blended
                rate, so the cuts and the total cannot disagree. A model with no
                published rate contributes nothing and is collected in `unpriced`
                for disclosure — silently pricing it would be a guess.
                """
                total = 0.0
                for model, t in model_tokens.items():
                    c = self._price_tokens(model, t.get("input"), t.get("output"))
                    if c is None:
                        if self._rate_for_model(model) is None:
                            unpriced.add(model)
                        continue
                    total += c
                return round(total, 4)

            # by_tool: apportion each identity's measured (identity, model) tokens
            # across that identity's tools by CloudTrail event share.
            tool_model_tokens: dict = defaultdict(lambda: defaultdict(lambda: {"input": 0, "output": 0}))
            if tokens.available:
                for (user, model, tool), n in ev_by_umt.items():
                    tok = tokens.by_identity_model.get((user, model))
                    denom = ev_by_um.get((user, model), 0)
                    if tok is None or not denom:
                        continue
                    share = n / denom
                    bucket = tool_model_tokens[tool][model]
                    # An unmeasured component contributes nothing: it cannot
                    # contribute a known amount, and the affected models are named
                    # in `note` rather than back-filled with a guess.
                    bucket["input"] += int(round((tok.input or 0) * share))
                    bucket["output"] += int(round((tok.output or 0) * share))

            # by_user: measured directly per (identity, model).
            user_model_tokens: dict = defaultdict(dict)
            if tokens.available:
                for (user, model), tok in tokens.by_identity_model.items():
                    if user in skip_users:
                        continue
                    user_model_tokens[user][model] = {"input": tok.input, "output": tok.output}

            # trend: measured directly per (day, model).
            date_model_tokens: dict = defaultdict(dict)
            if tokens.available:
                for (day, model), tok in tokens.by_date_model.items():
                    date_model_tokens[day][model] = {"input": tok.input, "output": tok.output}

            # ---------------------------------------------------------------
            # Build the response cuts
            # ---------------------------------------------------------------
            tool_list = []
            for tool, requests in sorted(req_by_tool.items(), key=lambda x: -x[1]):
                mt = tool_model_tokens.get(tool, {})
                tool_list.append(CostByTool(
                    tool=tool,
                    requests=requests,
                    input_tokens=sum(t["input"] for t in mt.values()),
                    output_tokens=sum(t["output"] for t in mt.values()),
                    estimated_cost_usd=price_bucket(mt),
                    users=len(users_by_tool[tool]),
                ))

            # Identities the invocation logs measured but CloudTrail did not return
            # (its paging is bounded, and the two sources count independently).
            # Including them keeps real spend in the picture instead of dropping it.
            user_keys = set(req_by_user) | set(user_model_tokens)
            user_list = []
            for user in user_keys:
                mt = user_model_tokens.get(user, {})
                # output may be None (models that emit no output tokens); the int
                # field reports the measured portion, and cost is unaffected.
                user_list.append(CostByUser(
                    user=user,
                    requests=req_by_user.get(user, 0),
                    input_tokens=sum((t["input"] or 0) for t in mt.values()),
                    output_tokens=sum((t["output"] or 0) for t in mt.values()),
                    estimated_cost_usd=price_bucket(mt),
                    tools=sorted(tools_by_user.get(user, set())),
                    models=sorted(models_by_user.get(user, set()) or mt.keys()),
                ))
            user_list.sort(key=lambda u: -u.estimated_cost_usd)

            model_keys = set(req_by_model) | (set(tokens.by_model) if tokens.available else set())
            model_list = []
            unmeasured_models: List[str] = []
            for model in model_keys:
                tok = tokens.by_model.get(model) if tokens.available else None
                if tok is None:
                    unmeasured_models.append(model)
                cost = self._price_tokens(model, tok.input, tok.output) if tok else None
                if tok is not None and cost is None and self._rate_for_model(model) is None:
                    unpriced.add(model)
                # Pass the measured values through untouched. `or 0` here was
                # wrong twice: it flattened an unmeasured model (tok is None) and
                # a model that emits no output-token field (tok.output is None)
                # into the same 0 that a genuine measured zero produces. None now
                # means unmeasured and 0 means measured-zero, which is what the
                # `unmeasured_models` note below has always claimed.
                model_list.append(CostByModel(
                    model=model,
                    requests=req_by_model.get(model, 0),
                    input_tokens=tok.input if tok else None,
                    output_tokens=tok.output if tok else None,
                    estimated_cost_usd=cost,
                    users=len(users_by_model.get(model, set())),
                ))
            model_list.sort(key=lambda m: -(m.estimated_cost_usd or 0.0))

            trend_list = []
            for date in sorted(set(req_by_date) | set(date_model_tokens)):
                trend_list.append(CostTrend(
                    date=date,
                    requests=req_by_date.get(date, 0),
                    estimated_cost_usd=price_bucket(date_model_tokens.get(date, {})),
                ))

            # Total derives from by_model — the authoritative per-model cut — and
            # sums only what could actually be priced.
            total_cost = sum(
                m.estimated_cost_usd for m in model_list if m.estimated_cost_usd is not None
            )

            notes: List[str] = []
            if tokens.available:
                notes.append(
                    f"Measured {tokens.total_calls} Bedrock invocations from model-invocation "
                    f"logs and {total_requests} CloudTrail events ({days} days); tokens priced "
                    "per model. The two sources count independently, so event and invocation "
                    "counts differ."
                )
            else:
                notes.append(
                    (tokens.reason or "Token counts are unmeasured.")
                    + " Request counts are real; costs are not estimated from them."
                )
            if unmeasured_models:
                notes.append(
                    f"No measured tokens for {_join_capped(unmeasured_models, 3)} — "
                    "cost shown as unavailable, not zero"
                )
            if unpriced:
                notes.append(
                    f"No published rate for {_join_capped(unpriced, 3)} — excluded from "
                    "the total rather than priced at a fallback rate"
                )
            if truncation_note:
                notes.append(truncation_note)

            return CostAttributionResponse(
                period_days=days,
                total_requests=total_requests,
                total_estimated_cost_usd=round(total_cost, 4),
                by_tool=tool_list,
                by_user=user_list[:20],
                by_model=model_list,
                trend=trend_list,
                # live tracks the COST dimension: request counts alone are not what
                # this endpoint exists to report.
                live=tokens.available,
                source=(
                    "cloudtrail+bedrock-invocation-logs" if tokens.available else "cloudtrail"
                ),
                note="; ".join(notes) if notes else None,
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("Cost attribution failed: %s", e)
            return CostAttributionResponse(
                period_days=days,
                live=False,
                source="unavailable",
                note=f"CloudTrail access failed: {str(e)[:100]}",
            )
