"""Govern CloudTrail Lake service — real long-window AI-activity denominators.

Source of truth: a CloudTrail Lake event data store — the scoped
AI-Management-events store named "ava-govern-ai-activity" when present, else the
original broad store named "CTLake"
(cloudtrail:StartQuery / GetQueryResults). Where govern_trail's
cloudtrail:LookupEvents is capped at 200/500 recent rows over a short window,
CloudTrail Lake runs SQL over the full retained history — so this slice can
return honest *aggregate denominators* (how many Bedrock/SageMaker/AgentCore
API calls, by which principals, over which days) across a 30/60/90-day window.

Design (verified live against the real CTLake store, boto3 cloudtrail):
  - Discover the store via ListEventDataStores and PREFER the scoped
    "ava-govern-ai-activity" store, falling back to "CTLake" if the AI store is
    absent (NOT the AuditManager evidence store).
  - Run ONE aggregating query that scans the window a single time and emits all
    three rollups via GROUP BY GROUPING SETS ((eventSource,eventName),
    (principal),(day)). A grouping() bitmask column tags which rollup each row
    belongs to, so classification is unambiguous even when a principal is null.
  - Return AGGREGATES ONLY — counts by action / principal / day. Never raw event
    rows, so there is no 200/500-row cap and no per-event PII surface.

COST (load-bearing): CloudTrail Lake bills per query by bytes scanned. To bound
spend we (a) run exactly one query per refresh, (b) cap the scan window at
_MAX_WINDOW_DAYS, and (c) cache the whole response at a LONG TTL (>= 1h) via
core.ttl_cache.get_or_load — caching successful-but-empty results too, so a
quiet account cannot re-bill the query on every page load. Only hard failures
(timeout / not-permitted / query error) are left uncached. A cost_note carrying
the real bytes-scanned figure rides in every response.

PRIVACY: principals come off userIdentity.arn (which carries the real 12-digit
account id). Every principal is passed through mask_identity + mask_account_id
before it leaves the process — no raw ARN or account id is ever returned.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.security_utils import mask_account_id, mask_identity
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# ── Tuning ────────────────────────────────────────────────────────────────────
_TTL = 3600                 # 1h — CloudTrail Lake queries are billed; refresh at most hourly.
_MAX_WINDOW_DAYS = 90       # Cap the scan window so a huge `days` can't scan (and bill) unbounded.
_QUERY_TIMEOUT_S = 90       # Bounded poll — larger windows take longer to finish.
_POLL_INTERVAL = 1.5
_SQL_ROW_CAP = 3000         # Hard LIMIT on the aggregate query result set.
_MAX_PRINCIPALS = 50        # Output cap: keep the top-N principals (long tail truncated).
_MAX_ACTIONS = 100          # Output cap: keep the top-N (source, action) pairs.
# Event-data-store selection, in preference order. We PREFER the scoped
# AI-Management-events store ("ava-govern-ai-activity") and fall back to the
# original broad store ("CTLake") when the AI store is not present — never the
# AuditManager evidence store.
_PREFERRED_STORE_NAME = "ava-govern-ai-activity"  # scoped AI-activity store (preferred)
_FALLBACK_STORE_NAME = "CTLake"                    # original store (fallback; NOT the AuditManager one)
_STORE_NAMES = (_PREFERRED_STORE_NAME, _FALLBACK_STORE_NAME)  # preference order

# The AI-service CloudTrail event sources we count. Bedrock (incl. InvokeModel data
# events), AgentCore data + control planes, and SageMaker management + runtime.
_AI_EVENT_SOURCES = [
    "bedrock.amazonaws.com",
    "bedrock-agentcore.amazonaws.com",
    "bedrock-agentcore-control.amazonaws.com",
    "sagemaker.amazonaws.com",
    "runtime.sagemaker.amazonaws.com",
]

# Approx CloudTrail Lake analysis price used only to frame the cost note.
_USD_PER_GB_SCANNED = 0.005


# ── Response models (kept in-module: this slice ships as two files only) ────────
class CtLakeActionCount(BaseModel):
    """count(*) for one (eventSource, eventName) pair over the window."""

    event_source: str = Field(..., description="e.g. 'bedrock.amazonaws.com'")
    event_name: str = Field(..., description="e.g. 'InvokeModel'")
    count: int = 0


class CtLakePrincipalCount(BaseModel):
    """count(*) for one invoking principal over the window (identity MASKED)."""

    principal: str = Field(..., description="Masked caller identity (account id / random session stripped)")
    count: int = 0


class CtLakeDayCount(BaseModel):
    """count(*) for one calendar day (UTC) over the window."""

    date: str = Field(..., description="YYYY-MM-DD (UTC)")
    count: int = 0


class CtLakeAiActivityResponse(BaseModel):
    """Aggregate-only AI-activity denominators from CloudTrail Lake.

    Honest live/source/note flags; graceful live=False fallback that never raises.
    `live` is True only when the query executed AND matched >0 AI events.
    """

    window_days: int
    total_events: int = 0
    distinct_actions: int = Field(0, description="Distinct (eventSource, eventName) pairs seen")
    distinct_principals: int = Field(0, description="Distinct invoking principals seen")
    active_days: int = Field(0, description="Calendar days with >=1 AI event")
    by_action: List[CtLakeActionCount] = Field(default_factory=list)
    by_principal: List[CtLakePrincipalCount] = Field(default_factory=list)
    by_day: List[CtLakeDayCount] = Field(default_factory=list)
    store_name: Optional[str] = Field(None, description="Event data store name (never its ARN/account id)")
    mb_scanned: Optional[float] = Field(None, description="Bytes scanned by the last query, in MB")
    live: bool = False
    source: str = ""
    note: Optional[str] = None
    cost_note: Optional[str] = None


class GovernCtLakeService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._client = None

    def _cloudtrail(self):
        if self._client is None:
            self._client = boto3.client("cloudtrail", region_name=self.region)
        return self._client

    # ── Public (cached) entrypoint ──────────────────────────────────────────────
    def get_ai_activity(self, days: int = 30) -> CtLakeAiActivityResponse:
        """Cached wrapper (LONG TTL). Caps `days`; caches every executed result
        (incl. empty) so at most one billed query runs per window per TTL. Only
        hard failures (source == 'unavailable-fallback') are left uncached."""
        window = max(1, min(int(days), _MAX_WINDOW_DAYS))
        result, cached_at = get_or_load(
            f"ctlake:ai-activity:{self.region}:{window}",
            _TTL,
            lambda: self._fetch_ai_activity(window),
            should_cache=lambda r: r.source != "unavailable-fallback",
        )
        if (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    # ── Store discovery ──────────────────────────────────────────────────────────
    def _find_store(self) -> Optional[Tuple[str, str]]:
        """Return (event-data-store id (ARN tail), resolved store name), or None.

        Scans all stores, then picks by preference: the scoped AI-Management-events
        store `_PREFERRED_STORE_NAME` ("ava-govern-ai-activity") first, falling back
        to `_FALLBACK_STORE_NAME` ("CTLake") when the AI store is not present — never
        the AuditManager evidence store. Raises on API error so the caller can
        distinguish 'not-permitted' from 'no-store'.
        """
        ct = self._cloudtrail()
        found: dict[str, str] = {}  # store name -> id (ARN tail)
        next_token = None
        while True:
            kwargs = {"MaxResults": 100}
            if next_token:
                kwargs["NextToken"] = next_token
            resp = ct.list_event_data_stores(**kwargs)
            for s in resp.get("EventDataStores", []):
                name = s.get("Name")
                if name in _STORE_NAMES and name not in found:
                    arn = s.get("EventDataStoreArn", "")
                    eds_id = arn.rsplit("/", 1)[-1] if arn else None
                    if eds_id:
                        found[name] = eds_id
            next_token = resp.get("NextToken")
            if not next_token:
                break
        # Preference order: AI-scoped store first, then the original store.
        for name in _STORE_NAMES:
            if name in found:
                return found[name], name
        return None

    # ── Query build + bounded poll ────────────────────────────────────────────────
    def _build_query(self, eds_id: str, days: int) -> str:
        """ONE aggregating GROUPING SETS query over a capped window.

        The inner SELECT projects the nested field (userIdentity.arn) and the day
        expression into plain column aliases; GROUP BY GROUPING SETS then groups
        over those aliases (CloudTrail Lake rejects nested/expr refs directly in
        GROUP BY). grouping(...) tags each row's rollup. Aggregates only — the
        query never selects a raw event row.
        """
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S.000")
        in_list = ", ".join(f"'{s}'" for s in _AI_EVENT_SOURCES)
        return (
            "SELECT eventSource, eventName, principal, day, "
            "grouping(eventSource, eventName) AS g_action, "
            "grouping(principal) AS g_prin, "
            "grouping(day) AS g_day, "
            "count(*) AS event_count "
            "FROM ("
            "SELECT eventSource AS eventSource, eventName AS eventName, "
            "userIdentity.arn AS principal, "
            "date_format(eventTime, '%Y-%m-%d') AS day "
            f"FROM {eds_id} "
            f"WHERE eventTime > '{since}' AND eventSource IN ({in_list})"
            ") "
            "GROUP BY GROUPING SETS ((eventSource, eventName), (principal), (day)) "
            f"ORDER BY event_count DESC LIMIT {_SQL_ROW_CAP}"
        )

    def _run_query(self, sql: str):
        """Start the query, poll GetQueryResults with a bounded loop, and page
        through all result rows once FINISHED. Returns (rows, bytes_scanned) or
        None on failure/timeout (caller degrades to unavailable-fallback)."""
        ct = self._cloudtrail()
        qid = ct.start_query(QueryStatement=sql)["QueryId"]
        waited = 0.0
        while waited < _QUERY_TIMEOUT_S:
            resp = ct.get_query_results(QueryId=qid, MaxQueryResults=1000)
            status = resp.get("QueryStatus")
            if status == "FINISHED":
                stats = resp.get("QueryStatistics") or {}
                bytes_scanned = stats.get("BytesScanned")
                rows = list(resp.get("QueryResultRows", []))
                token = resp.get("NextToken")
                while token and len(rows) < _SQL_ROW_CAP:
                    resp = ct.get_query_results(QueryId=qid, MaxQueryResults=1000, NextToken=token)
                    rows.extend(resp.get("QueryResultRows", []))
                    token = resp.get("NextToken")
                return rows, bytes_scanned
            if status in ("FAILED", "CANCELLED", "TIMED_OUT"):
                logger.warning("CloudTrail Lake query %s ended %s: %s", qid, status, resp.get("ErrorMessage"))
                return None
            time.sleep(_POLL_INTERVAL)
            waited += _POLL_INTERVAL
        # Our own poll budget expired — stop the query so it doesn't linger/bill on.
        try:
            ct.cancel_query(QueryId=qid)
        except (ClientError, BotoCoreError):
            pass
        logger.warning("CloudTrail Lake query %s exceeded local poll budget", qid)
        return None

    @staticmethod
    def _row_to_dict(row: list) -> dict:
        """A result row is a list of single-key {column: value} dicts — merge it."""
        out: dict = {}
        for cell in row:
            if isinstance(cell, dict):
                out.update(cell)
        return out

    @staticmethod
    def _as_int(v) -> int:
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return 0

    # ── Fetch (uncached inner) ─────────────────────────────────────────────────────
    def _fetch_ai_activity(self, days: int) -> CtLakeAiActivityResponse:
        # 1) Discover the event data store (prefer the scoped AI-activity store).
        try:
            found = self._find_store()
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("CloudTrail ListEventDataStores unavailable: %s", e)
            return CtLakeAiActivityResponse(
                window_days=days, live=False, source="unavailable-fallback",
                note="cloudtrail:ListEventDataStores unreachable or not permitted.",
                cost_note=self._cost_note(days, None),
            )
        if not found:
            return CtLakeAiActivityResponse(
                window_days=days, live=False, source="no-store",
                note=(
                    f"No CloudTrail Lake event data store named '{_PREFERRED_STORE_NAME}' "
                    f"or '{_FALLBACK_STORE_NAME}' found in "
                    f"{self.region} — long-window AI-activity denominators are unavailable "
                    "(create a CloudTrail Lake store capturing Bedrock/SageMaker/AgentCore events)."
                ),
                cost_note=self._cost_note(days, None),
            )
        eds_id, store_name = found

        # 2) Run the single aggregating query.
        try:
            out = self._run_query(self._build_query(eds_id, days))
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudTrail Lake StartQuery/GetQueryResults failed: %s", e)
            return CtLakeAiActivityResponse(
                window_days=days, live=False, source="unavailable-fallback",
                note="cloudtrail:StartQuery / GetQueryResults failed or not permitted.",
                cost_note=self._cost_note(days, None),
            )
        if out is None:
            return CtLakeAiActivityResponse(
                window_days=days, store_name=store_name, live=False, source="unavailable-fallback",
                note="CloudTrail Lake query failed or exceeded the poll budget.",
                cost_note=self._cost_note(days, None),
            )

        rows, bytes_scanned = out
        mb = round(bytes_scanned / 1_000_000, 2) if bytes_scanned else 0.0

        # 3) Classify each row by its grouping() bitmask (unambiguous):
        #    g_day==0  -> day rollup, g_prin==0 -> principal rollup, g_action==0 -> action rollup.
        by_action: List[CtLakeActionCount] = []
        by_principal: List[CtLakePrincipalCount] = []
        by_day: List[CtLakeDayCount] = []
        for raw in rows:
            d = self._row_to_dict(raw)
            n = self._as_int(d.get("event_count"))
            if self._as_int(d.get("g_day")) == 0:
                day = (d.get("day") or "").strip()
                if day:
                    by_day.append(CtLakeDayCount(date=day, count=n))
            elif self._as_int(d.get("g_prin")) == 0:
                # userIdentity.arn carries the real account id — mask hard (defense in depth).
                raw_principal = (d.get("principal") or "").strip()
                principal = mask_account_id(mask_identity(raw_principal)) or "(unattributed)"
                by_principal.append(CtLakePrincipalCount(principal=principal, count=n))
            elif self._as_int(d.get("g_action")) == 0:
                src = (d.get("eventSource") or "").strip()
                name = (d.get("eventName") or "").strip()
                if src or name:
                    by_action.append(CtLakeActionCount(event_source=src, event_name=name, count=n))

        # Canonical total: every event lands in exactly one day bucket.
        total_events = sum(x.count for x in by_day)
        if total_events == 0:  # fall back to the action rollup if day binning yielded nothing
            total_events = sum(x.count for x in by_action)

        distinct_actions = len(by_action)
        distinct_principals = len(by_principal)
        active_days = len(by_day)

        # Sort + cap output (aggregates stay small; long-tail principals/actions truncated).
        by_action.sort(key=lambda x: x.count, reverse=True)
        by_principal.sort(key=lambda x: x.count, reverse=True)
        by_day.sort(key=lambda x: x.date)
        by_action = by_action[:_MAX_ACTIONS]
        by_principal = by_principal[:_MAX_PRINCIPALS]

        live = total_events > 0
        note = None if live else (
            f"CloudTrail Lake store '{store_name}' returned no Bedrock/SageMaker/AgentCore "
            f"activity in the last {days}d. The query executed against the real store, but this "
            "store captured no matching events for the window (it may log only S3/data events, or "
            "no AI API calls occurred)."
        )
        return CtLakeAiActivityResponse(
            window_days=days,
            total_events=total_events,
            distinct_actions=distinct_actions,
            distinct_principals=distinct_principals,
            active_days=active_days,
            by_action=by_action,
            by_principal=by_principal,
            by_day=by_day,
            store_name=store_name,
            mb_scanned=mb,
            live=live,
            source="cloudtrail-lake",
            note=note,
            cost_note=self._cost_note(days, mb),
        )

    # ── Cost note ─────────────────────────────────────────────────────────────────
    @staticmethod
    def _cost_note(days: int, mb: Optional[float]) -> str:
        base = (
            f"CloudTrail Lake bills per query by bytes scanned (~${_USD_PER_GB_SCANNED:.3f}/GB; verify "
            f"current pricing). This endpoint runs ONE aggregating query over a capped {days}-day window "
            f"(max {_MAX_WINDOW_DAYS}d) and caches the result for {_TTL // 60} min, so at most one query "
            "is billed per window per hour."
        )
        if mb is None:
            return base + " No query billed on this response (store discovery / fallback only)."
        gb = mb / 1000.0
        est = gb * _USD_PER_GB_SCANNED
        return base + f" Last scan: {mb} MB (~${est:.4f})."
