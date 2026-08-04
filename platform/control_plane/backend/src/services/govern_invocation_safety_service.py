"""Govern Invocation Safety service — live runtime safety telemetry, read-through + cached.

Discovers the Bedrock model-invocation log group (get-model-invocation-logging-
configuration) and runs CloudWatch Logs Insights aggregation queries over it:
  - total calls + stop-reason distribution (guardrail_intervened is the key signal)
  - per-model call + intervention counts
  - input/output token sums
  - a daily calls/interventions trend

Follows the govern_cost / govern_guardrails convention: lazy boto3 clients, honest
live/source/note flags, graceful live=False fallback that never raises, TTL cache.

PRIVACY: emits only aggregates (counts/rates/sums) — never raw prompt/response
bodies or caller identities, which the underlying records contain.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_invocation_safety import (
    DailyPoint,
    InvocationSafetyResponse,
    ModelInvocationRollup,
    StopReasonCount,
)

logger = logging.getLogger(__name__)

_TTL = 180  # 3 min — invocation aggregates move slowly; Logs Insights queries are not free
_QUERY_TIMEOUT_S = 25       # cap the poll loop per query
_QUERY_POLL_INTERVAL = 0.6

_REGION_PREFIX = re.compile(r"^(us|eu|apac|us-gov)\.")


def _short_model(identifier: str) -> str:
    """Reduce a model id / ARN to a readable model name.

    Bedrock model ids look like
      arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0
      arn:aws:bedrock:us-east-1:acct:inference-profile/us.anthropic.claude-opus-4-8
      us.amazon.nova-pro-v1:0
    We take the segment AFTER the last '/' (the resource name, keeping any ':version'
    suffix intact — critically not splitting on ':', which would leave just '0'), then
    strip a cross-region inference prefix.
    """
    if not identifier:
        return "unknown"
    name = identifier.rsplit("/", 1)[-1]  # drop arn: prefix / resource-type
    return _REGION_PREFIX.sub("", name)


class GovernInvocationSafetyService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._bedrock = None
        self._logs = None

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def _logs_client(self):
        if self._logs is None:
            self._logs = boto3.client("logs", region_name=self.region)
        return self._logs

    def get_telemetry(self, days: int = 7) -> InvocationSafetyResponse:
        """Cached wrapper around the Logs-Insights aggregation (3 min TTL)."""
        result, cached_at = get_or_load(
            f"invsafety:telemetry:{self.region}:{days}", _TTL,
            lambda: self._fetch_telemetry(days), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _log_group(self) -> tuple[str | None, bool]:
        """Resolve the Bedrock invocation log group + whether logging is enabled."""
        try:
            cfg = self._bedrock_client().get_model_invocation_logging_configuration()
            lc = (cfg.get("loggingConfig") or {})
            cw = (lc.get("cloudWatchConfig") or {})
            group = cw.get("logGroupName")
            return group, bool(group)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Invocation logging config unavailable: %s", e)
            return None, False

    def _run_query(self, log_group: str, start: int, end: int, query: str) -> list[list[dict]]:
        """Run one Logs Insights query and return its rows (bounded poll)."""
        logs = self._logs_client()
        qid = logs.start_query(
            logGroupName=log_group, startTime=start, endTime=end, queryString=query,
        )["queryId"]
        waited = 0.0
        while waited < _QUERY_TIMEOUT_S:
            resp = logs.get_query_results(queryId=qid)
            status = resp.get("status")
            if status == "Complete":
                return resp.get("results", [])
            if status in ("Failed", "Cancelled", "Timeout"):
                logger.warning("Logs Insights query %s ended: %s", qid, status)
                return []
            time.sleep(_QUERY_POLL_INTERVAL)
            waited += _QUERY_POLL_INTERVAL
        # Timed out our own poll — stop the query so it doesn't linger.
        try:
            logs.stop_query(queryId=qid)
        except (ClientError, BotoCoreError):
            pass
        return []

    @staticmethod
    def _row(fields: list[dict]) -> dict:
        return {f["field"]: f["value"] for f in fields}

    def _fetch_telemetry(self, days: int = 7) -> InvocationSafetyResponse:
        log_group, enabled = self._log_group()
        if not enabled or not log_group:
            return InvocationSafetyResponse(
                window_days=days, logging_enabled=False, live=False, source="logging-disabled",
                note="Bedrock model-invocation logging is not enabled — enable it to see runtime safety telemetry.",
            )
        try:
            end = int(datetime.now(timezone.utc).timestamp())
            start = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())

            # Define the 4 Logs Insights queries to run in parallel.
            queries = {
                "stop_reasons": (
                    'parse @message /"stopReason":"(?<sr>[^"]+)"/ '
                    '| filter ispresent(sr) '
                    '| stats count(*) as n by sr | sort n desc | limit 25'
                ),
                "aggregates": (
                    'stats count(*) as calls, sum(input.inputTokenCount) as inTok, '
                    'sum(output.outputTokenCount) as outTok'
                ),
                "by_model": (
                    'parse @message /"stopReason":"(?<sr>[^"]+)"/ '
                    '| stats count(*) as calls, sum(sr="guardrail_intervened") as intv by modelId '
                    '| sort calls desc | limit 20'
                ),
                "trend": (
                    'parse @message /"stopReason":"(?<sr>[^"]+)"/ '
                    '| stats count(*) as calls, sum(sr="guardrail_intervened") as intv by bin(1d) as day '
                    '| sort day asc | limit 90'
                ),
            }

            # Run all 4 queries in parallel — cuts cold-load from ~10s to ~3s.
            results: dict[str, list] = {}
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = {
                    pool.submit(self._run_query, log_group, start, end, q): name
                    for name, q in queries.items()
                }
                for fut in as_completed(futures):
                    name = futures[fut]
                    try:
                        results[name] = fut.result()
                    except Exception as e:
                        logger.warning("Logs Insights query %s failed: %s", name, e)
                        results[name] = []

            # 1) Parse stop-reason distribution.
            stop_reasons: list[StopReasonCount] = []
            completions_with_sr = 0
            intervened = 0
            for r in results.get("stop_reasons", []):
                d = self._row(r)
                reason = d.get("sr")
                if not reason:
                    continue
                n = int(d.get("n", 0) or 0)
                stop_reasons.append(StopReasonCount(reason=reason, count=n))
                completions_with_sr += n
                if reason == "guardrail_intervened":
                    intervened += n

            # 2) Parse aggregates.
            total_calls = in_tok = out_tok = 0
            agg_rows = results.get("aggregates", [])
            if agg_rows:
                d = self._row(agg_rows[0])
                total_calls = int(float(d.get("calls", 0) or 0))
                in_tok = int(float(d.get("inTok", 0) or 0))
                out_tok = int(float(d.get("outTok", 0) or 0))
            if not total_calls:
                total_calls = completions_with_sr

            # 3) Parse per-model rollup.
            by_model: list[ModelInvocationRollup] = []
            for r in results.get("by_model", []):
                d = self._row(r)
                by_model.append(ModelInvocationRollup(
                    model_id=_short_model(d.get("modelId", "")),
                    calls=int(float(d.get("calls", 0) or 0)),
                    guardrail_intervened=int(float(d.get("intv", 0) or 0)),
                ))

            # 4) Parse daily trend.
            trend: list[DailyPoint] = []
            for r in results.get("trend", []):
                d = self._row(r)
                day_raw = d.get("day", "")
                date = day_raw.split(" ")[0].split("T")[0] if day_raw else ""
                trend.append(DailyPoint(
                    date=date,
                    calls=int(float(d.get("calls", 0) or 0)),
                    guardrail_intervened=int(float(d.get("intv", 0) or 0)),
                ))

            rate = round((intervened / completions_with_sr * 100), 2) if completions_with_sr > 0 else 0.0
            return InvocationSafetyResponse(
                window_days=days,
                total_calls=total_calls,
                completion_calls=completions_with_sr,
                guardrail_intervened=intervened,
                intervention_rate_pct=rate,
                stop_reasons=stop_reasons,
                by_model=by_model,
                trend=trend,
                input_tokens=in_tok,
                output_tokens=out_tok,
                log_group=None,  # Redacted: log group name can reveal internal naming
                logging_enabled=True,
                live=total_calls > 0,
                source="bedrock-invocation-logs",
                note=None if total_calls > 0 else f"Logging enabled but no invocations recorded in the last {days}d.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Invocation safety telemetry unavailable, returning fallback: %s", e)
            return InvocationSafetyResponse(
                window_days=days, logging_enabled=enabled, log_group=None,
                live=False, source="unavailable-fallback",
                note="CloudWatch Logs unreachable or logs:StartQuery not granted.",
            )
