"""Govern model-invocation logging — real Bedrock invocation aggregates.

Read-through + cached. Bedrock model-invocation logging is delivered to the
CloudWatch Logs group ``/aws/bedrock/model-invocations`` (each record is a JSON
``ModelInvocationLog`` document). This service queries that group via CloudWatch
Logs Insights for *aggregates only* — never returning raw prompt/response text —
and honestly degrades to ``live=False`` when the group is absent, empty, or the
query is not permitted.

Why a new service (do NOT confuse with ``govern_agentcore_service.get_model_invocations``):
    That method queries the log group literally named ``"bedrock-invocation-logging"``,
    which is NOT where Bedrock delivers invocation logs, so it always returns empty.
    This service targets the correct group ``/aws/bedrock/model-invocations`` and is the
    source of truth for real token totals / per-model breakdown / guardrail + grounding
    signals — fixing the token, grounding, and cost-per-task denominators (and the
    shadow-AI flat 1000-tokens estimate) elsewhere in Govern.

Shape notes (verified live, schemaType=ModelInvocationLog schemaVersion 1.0):
    {
      "timestamp", "accountId", "region", "requestId", "operation" (Converse|InvokeModel),
      "modelId" (bare id | inference-profile ARN | foundation-model ARN),
      "input":  {"inputTokenCount": <int>, "inputBodyJson": {...}},
      "output": {"outputTokenCount": <int>,
                 "outputBodyJson": {"stopReason"|"stop_reason": ..., "usage": {...}, ...}},
      "identity": {"arn": "arn:aws:sts::<acct>:assumed-role/<role>/<session>"},
      "inferenceRegion" (optional, cross-region inference)
    }

Token truth: the top-level ``input.inputTokenCount`` / ``output.outputTokenCount`` are
Bedrock-normalized and present for every model/operation. The nested ``usage`` block is
schema-specific (Converse: ``usage.inputTokens``/``stopReason``; Anthropic InvokeModel:
``usage.input_tokens``/``stop_reason``), so aggregation relies on the top-level counts.

Security: ``modelId`` (inference-profile ARN) and ``identity.arn`` embed the 12-digit
account id, so every model/caller field is passed through
``core.security_utils.mask_account_id`` / ``mask_identity`` before it leaves the backend.
No prompt or completion text is ever returned — aggregates and counts only.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, ConfigDict, Field

from core.security_utils import mask_account_id, mask_identity
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# Correct CloudWatch Logs group where Bedrock delivers model-invocation logs.
LOG_GROUP = "/aws/bedrock/model-invocations"

_TTL = 300  # 5 min — invocation aggregates over an hours-window barely move minute-to-minute.
_MAX_POLLS = 30  # ~30s max wait for the Logs Insights query batch.
_START_QUERY_LIMIT = 1000  # max grouped rows returned per stats query.
_MAX_MODEL_ROWS = 50
_MAX_CALLER_ROWS = 25

# stopReason values that indicate a guardrail / safety intervention.
_GUARDRAIL_STOP = re.compile(r"guardrail|content[_-]?filter|blocked|safety", re.IGNORECASE)

# Grounding / hallucination-resistance signal: abstention phrasing in the MODEL OUTPUT
# (e.g. RAG "answer only from context" refusals). Matched against the output-text path
# only — never the prompt — so instruction text that echoes the phrase is not counted.
_GROUNDING_ABSTENTION = (
    r"(?i)(do(n't| not) have enough information|not contain enough information|"
    r"cannot answer|can't answer|insufficient (context|information)|"
    r"no relevant (context|information)|not enough context)"
)

# UUID-ish fragment used to detect random STS session names (e.g. KB-retrieve sessions).
_UUIDISH = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}", re.IGNORECASE)
_ASSUMED_ROLE = re.compile(r"assumed-role/([^/]+)/(.+)$")

# CloudWatch Logs Insights aggregate queries (validated against the live log group).
_QUERIES: Dict[str, str] = {
    # Per-model invocation count + reliable top-level token sums.
    "per_model": (
        "stats count(*) as invocations, "
        "sum(input.inputTokenCount) as input_tokens, "
        "sum(output.outputTokenCount) as output_tokens "
        "by modelId, operation"
    ),
    # Stop-reason counts, coalescing Converse (stopReason) + Anthropic InvokeModel (stop_reason).
    "stop": (
        "stats count(*) as cnt by "
        "coalesce(output.outputBodyJson.stopReason, output.outputBodyJson.stop_reason) as stop_reason"
    ),
    # Per-caller counts by identity ARN (masked + re-aggregated in Python).
    "callers": "stats count(*) as cnt by identity.arn as caller",
    # Grounding / hallucination-resistance abstention signal — output text only.
    "grounding": (
        "filter coalesce(output.outputBodyJson.content.0.text, "
        "output.outputBodyJson.output.message.content.0.text) like /"
        + _GROUNDING_ABSTENTION
        + "/ | stats count(*) as grounding_signals"
    ),
}


# ─────────────────────────── Response models ───────────────────────────


class ModelInvocationBreakdown(BaseModel):
    """Per-model (+ operation) invocation + token aggregate. modelId is masked."""

    model_config = ConfigDict(protected_namespaces=())

    model_id: str = Field(..., description="Bedrock modelId (account id masked); may be a bare id or an inference-profile/foundation-model ARN tail")
    operation: Optional[str] = Field(None, description="Converse | InvokeModel | ...")
    invocations: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class StopReasonCount(BaseModel):
    """Count of invocations by (coalesced) stop reason."""

    stop_reason: str
    count: int = 0


class CallerCount(BaseModel):
    """Count of invocations by masked caller identity (session name, or role for random sessions)."""

    caller: str
    count: int = 0


class InvocationAggregatesResponse(BaseModel):
    """Aggregate view of Bedrock model invocations over a trailing hours-window.

    Carries live / source / note per the Govern read-through convention. Contains
    aggregates and counts only — no prompt or completion text, no raw ARNs/account ids.
    """

    model_config = ConfigDict(protected_namespaces=())

    window_hours: int
    total_invocations: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    per_model: List[ModelInvocationBreakdown] = Field(default_factory=list)
    stop_reasons: List[StopReasonCount] = Field(default_factory=list)
    guardrail_intervention_count: int = Field(0, description="Invocations whose stop reason indicates a guardrail/safety intervention")
    grounding_signal_count: int = Field(0, description="Invocations whose OUTPUT text shows a grounding/hallucination-resistance abstention")
    per_caller: List[CallerCount] = Field(default_factory=list)
    callers_truncated: bool = Field(False, description="True if the per-caller query hit its row cap and totals may undercount")
    records_scanned: int = Field(0, description="CloudWatch Logs Insights records scanned (cost signal)")
    live: bool
    source: str
    note: Optional[str] = None


# ─────────────────────────── Helpers ───────────────────────────


def _iso_rows(results: list) -> List[Dict[str, Optional[str]]]:
    """Flatten Logs Insights result rows ([{field,value}, ...]) into dicts."""
    return [{f["field"]: f.get("value") for f in row} for row in results]


def _to_int(v: Optional[str]) -> int:
    if v is None:
        return 0
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return 0


def _looks_random(s: str) -> bool:
    """Heuristic: STS session name looks machine-generated (UUID / long hex run)."""
    if not s:
        return False
    if _UUIDISH.search(s):
        return True
    hexish = sum(c in "0123456789abcdefABCDEF" for c in s)
    return len(s) >= 20 and (hexish / len(s)) > 0.6


def _mask_caller(arn: Optional[str]) -> str:
    """Mask a caller identity to a bounded, meaningful, non-sensitive key.

    For ``assumed-role/<role>/<session>``: prefer the session name (the workload
    identity, e.g. ``ai-trust-production-workload``); when the session is a random
    token (e.g. KB-retrieve UUID sessions) fall back to the role name so cardinality
    stays bounded. The result is passed through ``mask_identity`` + ``mask_account_id``
    (both mandated helpers) so no raw ARN or account id is ever emitted.
    """
    if not arn:
        return "(unknown)"
    m = _ASSUMED_ROLE.search(arn)
    if m:
        role, session = m.group(1), m.group(2)
        base = role if _looks_random(session) else session
    else:
        base = arn
    masked = mask_identity(base) or base
    return mask_account_id(masked) or "(unknown)"


class GovernInvocationsService:
    """Read-through aggregates over the Bedrock model-invocation Logs group."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def _logs(self):
        return boto3.client("logs", region_name=self.region)

    # ─────────────────── Public (cached) ───────────────────

    def get_invocation_aggregates(self, hours: int = 24) -> InvocationAggregatesResponse:
        """Aggregate Bedrock model invocations over the trailing ``hours`` window.

        Cached for _TTL seconds per (region, hours). A live=False (absent/empty/denied)
        result is not cached, so a transient failure doesn't poison the window.
        """
        result, cached_at = get_or_load(
            f"invocations:aggregates:{self.region}:{hours}",
            _TTL,
            lambda: self._fetch_aggregates(hours),
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    # ─────────────────── Fetch + aggregate ───────────────────

    def _fetch_aggregates(self, hours: int) -> InvocationAggregatesResponse:
        try:
            logs = self._logs()
        except (BotoCoreError, ClientError) as e:
            logger.warning("Logs client init failed: %s", type(e).__name__)
            return self._degrade(hours, "unavailable", "CloudWatch Logs client unavailable.")

        exists = self._log_group_exists(logs)
        if exists is False:
            return self._degrade(
                hours,
                "not-configured",
                "Bedrock model-invocation logging not enabled to /aws/bedrock/model-invocations. "
                "Enable in Bedrock console → Settings → Model invocation logging (CloudWatch destination).",
            )

        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        start_s, end_s = int(start.timestamp()), int(end.timestamp())

        batch = self._run_insights(logs, start_s, end_s)
        results = batch["results"]
        stats = batch["stats"]

        if not results:
            # Every query failed to start/complete — group vanished or not permitted.
            return self._degrade(
                hours,
                "unavailable",
                "CloudWatch Logs Insights query did not complete (group missing or insufficient permissions).",
            )

        # ── Per-model breakdown + grand totals ──
        per_model: List[ModelInvocationBreakdown] = []
        total_inv = total_in = total_out = 0
        for row in _iso_rows(results.get("per_model", [])):
            inv = _to_int(row.get("invocations"))
            it = _to_int(row.get("input_tokens"))
            ot = _to_int(row.get("output_tokens"))
            total_inv += inv
            total_in += it
            total_out += ot
            per_model.append(
                ModelInvocationBreakdown(
                    model_id=mask_account_id(row.get("modelId") or "unknown") or "unknown",
                    operation=row.get("operation"),
                    invocations=inv,
                    input_tokens=it,
                    output_tokens=ot,
                    total_tokens=it + ot,
                )
            )
        per_model.sort(key=lambda m: m.invocations, reverse=True)
        per_model = per_model[:_MAX_MODEL_ROWS]

        # ── Stop-reason counts + guardrail signal ──
        stop_reasons: List[StopReasonCount] = []
        guardrail = 0
        for row in _iso_rows(results.get("stop", [])):
            reason = row.get("stop_reason") or "(none)"
            cnt = _to_int(row.get("cnt"))
            stop_reasons.append(StopReasonCount(stop_reason=reason, count=cnt))
            if _GUARDRAIL_STOP.search(reason):
                guardrail += cnt
        stop_reasons.sort(key=lambda s: s.count, reverse=True)

        # ── Per-caller counts (mask + re-aggregate to collapse random sessions) ──
        caller_rows = _iso_rows(results.get("callers", []))
        callers_truncated = len(caller_rows) >= _START_QUERY_LIMIT
        caller_counts: Dict[str, int] = {}
        for row in caller_rows:
            key = _mask_caller(row.get("caller"))
            caller_counts[key] = caller_counts.get(key, 0) + _to_int(row.get("cnt"))
        per_caller = [CallerCount(caller=k, count=v) for k, v in caller_counts.items()]
        per_caller.sort(key=lambda c: c.count, reverse=True)
        per_caller = per_caller[:_MAX_CALLER_ROWS]

        # ── Grounding / hallucination-resistance signal ──
        grounding = 0
        for row in _iso_rows(results.get("grounding", [])):
            grounding = _to_int(row.get("grounding_signals"))

        # ── Cost signal ──
        per_model_stats = stats.get("per_model", {}) or {}
        records_scanned = _to_int(per_model_stats.get("recordsScanned"))
        bytes_scanned = _to_int(per_model_stats.get("bytesScanned"))

        if total_inv == 0:
            return self._degrade(
                hours,
                "empty",
                f"Model-invocation logging is enabled but no invocations were logged in the last {hours}h.",
            )

        note = (
            f"{total_inv} invocation(s) over last {hours}h across {len(per_model)} model(s); "
            f"{total_in + total_out} tokens ({total_in} in / {total_out} out); "
            f"{guardrail} guardrail intervention(s), {grounding} grounding signal(s)."
        )
        if callers_truncated:
            note += " Per-caller list capped; totals may undercount."

        logger.info(
            "invocation aggregates region=%s hours=%s invocations=%s tokens=%s scanned=%s bytes=%s",
            self.region, hours, total_inv, total_in + total_out, records_scanned, bytes_scanned,
        )

        return InvocationAggregatesResponse(
            window_hours=hours,
            total_invocations=total_inv,
            total_input_tokens=total_in,
            total_output_tokens=total_out,
            total_tokens=total_in + total_out,
            per_model=per_model,
            stop_reasons=stop_reasons,
            guardrail_intervention_count=guardrail,
            grounding_signal_count=grounding,
            per_caller=per_caller,
            callers_truncated=callers_truncated,
            records_scanned=records_scanned,
            live=True,
            source="cloudwatch-logs-insights:/aws/bedrock/model-invocations",
            note=note,
        )

    # ─────────────────── Low-level AWS ───────────────────

    def _log_group_exists(self, logs) -> Optional[bool]:
        """True/False if the group is present; None if we can't tell (e.g. denied)."""
        try:
            resp = logs.describe_log_groups(logGroupNamePrefix=LOG_GROUP, limit=5)
            for g in resp.get("logGroups", []):
                if g.get("logGroupName") == LOG_GROUP:
                    return True
            return False
        except (BotoCoreError, ClientError) as e:
            logger.debug("describe_log_groups inconclusive: %s", type(e).__name__)
            return None

    def _run_insights(self, logs, start_s: int, end_s: int) -> Dict[str, Dict]:
        """Start all aggregate queries, then poll until each completes (best-effort)."""
        query_ids: Dict[str, str] = {}
        for name, qstr in _QUERIES.items():
            try:
                r = logs.start_query(
                    logGroupName=LOG_GROUP,
                    startTime=start_s,
                    endTime=end_s,
                    queryString=qstr,
                    limit=_START_QUERY_LIMIT,
                )
                query_ids[name] = r["queryId"]
            except (BotoCoreError, ClientError, KeyError) as e:
                logger.warning("start_query(%s) failed: %s", name, type(e).__name__)

        results: Dict[str, list] = {}
        stats: Dict[str, dict] = {}
        pending = set(query_ids)
        for _ in range(_MAX_POLLS):
            if not pending:
                break
            for name in list(pending):
                try:
                    r = logs.get_query_results(queryId=query_ids[name])
                except (BotoCoreError, ClientError) as e:
                    logger.warning("get_query_results(%s) failed: %s", name, type(e).__name__)
                    pending.discard(name)
                    continue
                status = r.get("status")
                if status in ("Complete", "Failed", "Cancelled", "Timeout"):
                    if status == "Complete":
                        results[name] = r.get("results", [])
                        stats[name] = r.get("statistics", {})
                    else:
                        logger.warning("Logs Insights query %s ended status=%s", name, status)
                    pending.discard(name)
            if pending:
                time.sleep(1)
        return {"results": results, "stats": stats}

    def _degrade(self, hours: int, source: str, note: str) -> InvocationAggregatesResponse:
        return InvocationAggregatesResponse(
            window_hours=hours,
            live=False,
            source=source,
            note=note,
        )
