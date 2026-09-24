"""Govern Audit service — DynamoDB-backed, append-only audit log.

Storage scheme (single-table):
    pk = "AUDIT"            sk = "<ts_iso>#<id>"   -> one audit event

All events share a single partition ("AUDIT") with a sortable sk of
"<timestamp>#<id>", so a Query returns them newest-first without a scan. The log
is append-only: create + list/get only (no update/delete) — it is an
examiner-facing system-of-record.

Mirrors the DDB shape/serialization used by OperatingModelService for
consistency across the control plane.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from core.ttl_cache import get_or_load, invalidate
from models.govern_audit import AuditCategory, AuditEvent, AuditEventCreate, AuditSeverity

logger = logging.getLogger(__name__)

# How long a failed DynamoDB call keeps this service on its in-memory buffer before
# the next call is allowed to re-probe the table. Same tradeoff, and the same value,
# as govern_operations_service._TABLE_RETRY_COOLDOWN_SECONDS:
#
#   0s (re-probe every call) is what the audit path must NOT do - a failing PutItem
#   costs ~15ms plus botocore retries, and seeding thousands of events one at a time
#   against a table that genuinely is not provisioned is pathologically slow.
#
#   Infinity (the previous behaviour: a one-way latch, set False and never reset)
#   means one throttled PutItem sends every later event in the process to a buffer
#   that dies on restart, while the API keeps answering 200. That is silent loss of
#   the examiner-facing system of record.
#
# 60s keeps the absent-table cost at about one failed call per minute and bounds how
# much of the audit log a transient failure can divert.
_TABLE_RETRY_COOLDOWN_SECONDS = 60


def _event_dt(e) -> datetime:
    """Best-effort parse of an audit event ts (datetime or 'YYYY-MM-DD HH:mm')."""
    ts = getattr(e, "ts", None)
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(ts[:26] if "." in ts else ts, fmt)
            except ValueError:
                continue
    return datetime.min


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernAuditService:
    PK = "AUDIT"

    # TTLs for cached data (in seconds)
    _TTL_LIST = 60  # List results change frequently (events appended)
    _TTL_QUERY = 60  # Query results for agreement rate, signals
    _TTL_COUNT = 60  # Count results for SR 26-2 evidence

    # Ephemeral in-memory audit buffer used when the audit table isn't provisioned
    # (e.g. running locally without the DynamoDB backend). The audit log is the hub
    # the governance signals compute off — seeded/enforcement/A2A events land here
    # so graduation signals, SR 26-2 evidence, and the audit feed all still work
    # table-free. Not durable across restarts. Class-level so it's shared across the
    # lazy-singleton services.
    _mem: List[AuditEvent] = []
    _MEM_CAP = 50000  # bound the buffer so a long-running local process can't grow unbounded
    # Tri-state cache of table availability: None=unknown, True=live, False=the last
    # call failed. Once we learn the table is unavailable we skip the boto3 round-trip
    # entirely — a failing PutItem per event is ~15ms, which makes seeding thousands of
    # events pathologically slow. Class-level so it's shared across services.
    #
    # False is a TEMPORARY state, not a latch: _table_failed_at records when it was set
    # and the next call after _TABLE_RETRY_COOLDOWN_SECONDS re-probes the table. A
    # throttle, a brief network partition, or a table created after this process
    # started therefore heals on its own. It used to be permanent, which meant one bad
    # PutItem quietly downgraded the whole audit log - the append-only examiner record -
    # to an in-memory buffer for the process lifetime.
    _table_ok: Optional[bool] = None
    _table_failed_at: Optional[float] = None

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- Table availability (temporary degrade, not a latch) ----------------

    @classmethod
    def _table_available(cls) -> bool:
        """Whether a DynamoDB call should be attempted right now.

        Only False during the cool-off window after a failure. Monotonic clock so a
        wall-clock adjustment cannot extend or skip the window.
        """
        if cls._table_ok is not False:
            return True
        if cls._table_failed_at is None:
            return True
        return (time.monotonic() - cls._table_failed_at) >= _TABLE_RETRY_COOLDOWN_SECONDS

    @classmethod
    def _mark_table_ok(cls) -> None:
        """Record that the table answered - clears any pending cool-off."""
        cls._table_ok = True
        cls._table_failed_at = None

    @classmethod
    def _mark_table_failed(cls) -> None:
        """Record a failure and start the cool-off before the next probe."""
        cls._table_ok = False
        cls._table_failed_at = time.monotonic()

    # --- DDB shape ---------------------------------------------------------

    def _sk(self, ts: datetime, event_id: str) -> str:
        return f"{ts.isoformat()}#{event_id}"

    def _to_item(self, e: AuditEvent) -> dict:
        body = e.model_dump(mode="json")
        return _to_ddb({
            "pk": self.PK,
            "sk": self._sk(e.ts, e.id),
            "id": e.id,
            "ts": body["ts"],
            "category": e.category.value,
            "severity": e.severity.value,
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> AuditEvent:
        body = _from_ddb(json.loads(item["data"]))
        return AuditEvent.model_validate(body)

    # --- Append-only CRUD --------------------------------------------------

    def append(
        self,
        req: AuditEventCreate,
        created_by: Optional[str] = None,
        ts: Optional[datetime] = None,
    ) -> AuditEvent:
        # `ts` lets callers backdate an event (e.g. seeding a historical roster);
        # when omitted the model's default_factory stamps it at "now".
        fields = req.model_dump(exclude_none=False)
        if ts is not None:
            fields["ts"] = ts
        e = AuditEvent(**fields, created_by=created_by)
        # Skip the (slow, failing) boto3 call while a recent failure is still cooling
        # off; _table_available() lets the next append after the cool-off try again.
        if not self._table_available():
            self._buffer(e)
            self._invalidate_caches()
            return e
        try:
            self.table.put_item(Item=self._to_item(e))
            self._mark_table_ok()
        except Exception as ex:
            # Table not provisioned (local / no DynamoDB backend), throttled, or denied:
            # buffer in memory so the audit hub still feeds the compute-on-read
            # differentiators. Logged at warning because a buffered audit event is a
            # record that will not be there for an examiner after the next restart.
            self._mark_table_failed()
            logger.warning(
                "Audit event %s buffered in memory: put_item on '%s' (%s) failed (%s); "
                "retrying the table in ~%ss.",
                e.id, self.table_name, self.region, ex, _TABLE_RETRY_COOLDOWN_SECONDS,
            )
            self._buffer(e)
        self._invalidate_caches()
        return e

    def _invalidate_caches(self) -> None:
        """Invalidate audit-related caches after a write operation."""
        # Invalidate list cache
        invalidate(f"audit:list:{self.table_name}")
        # Note: query/count caches are keyed by parameters, so we use prefix invalidation
        # by clearing any cached keys that start with our table. In practice, the short
        # TTL (60s) means stale data is bounded.

    # --- Cache provenance -----------------------------------------------------

    @staticmethod
    def _degrade_flag() -> Dict[str, bool]:
        """A fresh flag the read impls stamp when they fall back to the buffer.

        Every cached read here has to answer one question before it is stored: did this
        value come from the table, or from the in-memory buffer? A buffer-served value
        cached for the TTL means the table can recover and no request is able to refresh
        it - the exact "one transient failure degrades the endpoint for a whole TTL" bug
        the retry cool-off above was added to prevent, reintroduced one layer up.

        Two properties matter:

          - It tests PROVENANCE, not the value. `bool(result)` would refuse to cache a
            legitimately empty list, a count of 0, or an agent with no events, and would
            re-query DynamoDB on every request for those - while conflating "measured
            empty" with "degraded". A measured zero from a reachable table is live data
            and must cache.
          - It is closure-local, not the class-level _table_ok. _table_ok is shared by
            every instance and every call path; an append failing between this loader
            returning and the predicate being evaluated would flip it and suppress
            caching of a value that genuinely came from the table (and the reverse: a
            successful append would let a buffer-served value be cached). The dict is
            written only by the load it belongs to, so it cannot be wrong about it.
        """
        return {"table_read_failed": False}

    def _buffered_shadow(self, events: List[AuditEvent]) -> List[AuditEvent]:
        """Buffered events missing from `events` (which came from the table).

        This closes the hazard the retry cool-off opens. An event appended while
        DynamoDB was unavailable lands in _mem; the moment the table answers again every
        read path switches to the table arm, and that event silently vanishes from the
        audit feed and from the signals computed off it - even though it was never
        written anywhere durable. Under the old permanent latch the buffer stayed
        visible for the process lifetime, so recovery could not lose it; now it can.

        Matching on id cannot double-count: append() either puts OR buffers, never both,
        so _mem holds exactly the events that are not in the table.
        """
        if not type(self)._mem:
            return []
        seen = {e.id for e in events}
        return [e for e in type(self)._mem if e.id not in seen]

    def _buffer(self, e: AuditEvent) -> None:
        type(self)._mem.append(e)
        if len(type(self)._mem) > self._MEM_CAP:
            del type(self)._mem[: len(type(self)._mem) - self._MEM_CAP]

    def _from_buffer(self, event_id: str) -> Optional[AuditEvent]:
        """Look an event up in the in-memory buffer."""
        return next((e for e in type(self)._mem if e.id == event_id), None)

    def get(self, event_id: str, ts: Optional[str] = None) -> Optional[AuditEvent]:
        # When ts is known, do a direct GetItem; otherwise fall back to a
        # bounded query filtering by id (id is embedded in the sk).
        # Graceful when the table isn't provisioned (local / no DynamoDB backend): treat as not-found.
        try:
            if ts:
                resp = self.table.get_item(Key={"pk": self.PK, "sk": f"{ts}#{event_id}"})
                self._mark_table_ok()
                item = resp.get("Item")
                if item:
                    return self._from_item(item)
                return self._from_buffer(event_id)
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self.PK),
                ScanIndexForward=False,
            )
            # A successful read clears the cool-off, so the next append writes to the
            # table instead of waiting out its own timer.
            self._mark_table_ok()
        except Exception:
            # Table absent (local / no DynamoDB backend): search the in-memory buffer.
            self._mark_table_failed()
            return self._from_buffer(event_id)
        for item in resp.get("Items", []):
            if item.get("id") == event_id:
                return self._from_item(item)
        # A miss against a healthy table is not proof the event does not exist: it may
        # have been buffered during an outage and never written (see _buffered_shadow).
        # Returning None here made a real event 404 the instant the table recovered.
        return self._from_buffer(event_id)

    def list(
        self,
        category: Optional[AuditCategory] = None,
        limit: int = 200,
    ) -> List[AuditEvent]:
        cat_key = category.value if category else "all"
        cache_key = f"audit:list:{self.table_name}:{cat_key}:{limit}"
        # See _degrade_flag: without should_cache, get_or_load stores whatever the loader
        # returned (core/ttl_cache.py:83), so a buffer-served list would be pinned for the
        # whole TTL even after DynamoDB recovered.
        degraded = self._degrade_flag()
        result, _ = get_or_load(
            cache_key, self._TTL_LIST,
            lambda: self._list_impl(category, limit, degraded),
            should_cache=lambda _r: not degraded["table_read_failed"],
        )
        return result

    def _list_impl(
        self,
        category: Optional[AuditCategory],
        limit: int,
        degraded: Optional[Dict[str, bool]] = None,
    ) -> List[AuditEvent]:
        query_kwargs = {
            "KeyConditionExpression": Key("pk").eq(self.PK),
            "ScanIndexForward": False,  # newest-first
            "Limit": max(1, min(limit, 1000)),
        }
        try:
            resp = self.table.query(**query_kwargs)
            self._mark_table_ok()
        except Exception as e:
            # Table not provisioned (local / no DynamoDB backend): serve the in-memory buffer
            # (newest-first) rather than 500-ing.
            self._mark_table_failed()
            if degraded is not None:
                degraded["table_read_failed"] = True
            logger.info(f"Audit list served from in-memory buffer ({e})")
            events = sorted(type(self)._mem, key=_event_dt, reverse=True)[: query_kwargs["Limit"]]
            if category:
                events = [e for e in events if e.category == category]
            return events
        events = [self._from_item(i) for i in resp.get("Items", [])]
        # Union in anything still only in the buffer. The read itself succeeded, so this
        # result is NOT degraded and is safe to cache - the merge exists so recovery does
        # not hide unpersisted events, not because the table failed.
        shadow = self._buffered_shadow(events)
        if shadow:
            events = sorted(events + shadow, key=_event_dt, reverse=True)[: query_kwargs["Limit"]]
        if category:
            events = [e for e in events if e.category == category]
        return events

    # --- Query primitives (for earned-autonomy signals + SR 26-2 evidence) --

    def query_events(
        self,
        agent: Optional[str] = None,
        category: Optional[AuditCategory] = None,
        severity: Optional[AuditSeverity] = None,
        since_days: Optional[int] = None,
        scan_limit: int = 1000,
    ) -> List[AuditEvent]:
        """Filtered fetch: by agent, category, severity, and/or a trailing window.

        Note: filtering is applied client-side over a newest-first page (single
        partition, sortable sk) — fine at demo/control-plane volume. `since_days`
        filters on the event ts. This is the primitive earned-autonomy (agreement
        rate) and SR 26-2 (evidence-backed) evaluation both consume.
        """
        agent_key = agent or "all"
        cat_key = category.value if category else "all"
        sev_key = severity.value if severity else "all"
        days_key = str(since_days) if since_days is not None else "all"
        cache_key = f"audit:query:{self.table_name}:{agent_key}:{cat_key}:{sev_key}:{days_key}:{scan_limit}"
        # Provenance predicate, see _degrade_flag. This one matters most: the
        # earned-autonomy agreement rate and the SR 26-2 evidence counts are computed off
        # this result, so caching a buffer-served answer would freeze a governance
        # decision on incomplete data for the TTL.
        degraded = self._degrade_flag()
        result, _ = get_or_load(
            cache_key, self._TTL_QUERY,
            lambda: self._query_events_impl(
                agent, category, severity, since_days, scan_limit, degraded
            ),
            should_cache=lambda _r: not degraded["table_read_failed"],
        )
        return result

    def _query_events_impl(
        self,
        agent: Optional[str],
        category: Optional[AuditCategory],
        severity: Optional[AuditSeverity],
        since_days: Optional[int],
        scan_limit: int,
        degraded: Optional[Dict[str, bool]] = None,
    ) -> List[AuditEvent]:
        # Graceful when the audit table isn't provisioned (local / no DynamoDB backend): filter the
        # in-memory buffer instead of raising, so downstream compute-on-read
        # consumers (SR 26-2 evaluate, earned-autonomy signals) still see the
        # seeded/enforcement/A2A events.
        #
        # from_table drives WHERE the scan_limit applies: for the DynamoDB query
        # the Limit is applied server-side over the newest page (pre-filter, by
        # design at control-plane volume); for the in-memory buffer we filter
        # FIRST, then cap — otherwise a per-agent query over a large shared buffer
        # would only see its slice of the newest N events and undercount.
        from_table = False
        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self.PK),
                ScanIndexForward=False,
                Limit=max(1, min(scan_limit, 5000)),
            )
            # Marked before parsing: the table answered, which is the only thing this
            # flag is about. A successful read here also clears a cool-off started by a
            # failed append, so the next append goes to the table.
            self._mark_table_ok()
            events = [self._from_item(i) for i in resp.get("Items", [])]
            from_table = True
            # Events buffered during an earlier outage are still real and still not
            # durable; the table answering must not make them disappear. Merging shifts
            # this to the filter-first/cap-after path below, because the server-side
            # Limit no longer describes the list we actually hold.
            shadow = self._buffered_shadow(events)
            if shadow:
                events = sorted(events + shadow, key=_event_dt, reverse=True)
                from_table = False
        except Exception:
            self._mark_table_failed()
            if degraded is not None:
                degraded["table_read_failed"] = True
            events = sorted(type(self)._mem, key=_event_dt, reverse=True)
        cutoff = None
        if since_days is not None:
            cutoff = datetime.utcnow() - timedelta(days=since_days)
        out: List[AuditEvent] = []
        for e in events:
            if agent and e.agent != agent:
                continue
            if category and e.category != category:
                continue
            if severity and e.severity != severity:
                continue
            if cutoff is not None and _event_dt(e) < cutoff:
                continue
            out.append(e)
        # Buffer path, and the merged path: cap AFTER filtering so per-agent counts
        # aren't truncated by unrelated agents' events crowding the newest page. Only an
        # unmerged table page is already capped server-side.
        if not from_table:
            out = out[: max(1, min(scan_limit, 5000))]
        return out

    def count_events(
        self,
        category: Optional[AuditCategory] = None,
        severity_min: Optional[AuditSeverity] = None,
        agent: Optional[str] = None,
        since_days: Optional[int] = None,
    ) -> int:
        """Count events matching filters — the primitive SR 26-2 evaluate() uses
        to resolve a control's windowed expectation (e.g. 'guardrail interventions
        in last 30d'). severity_min applies an ordered floor (low<medium<high<critical)."""
        cat_key = category.value if category else "all"
        sev_key = severity_min.value if severity_min else "all"
        agent_key = agent or "all"
        days_key = str(since_days) if since_days is not None else "all"
        cache_key = f"audit:count:{self.table_name}:{cat_key}:{sev_key}:{agent_key}:{days_key}"
        # Provenance predicate, see _degrade_flag. Note what is NOT used here: bool(result)
        # or result > 0. A control whose expectation is "0 guardrail breaches in 30d" is
        # SATISFIED by a measured 0, and refusing to cache that would re-scan DynamoDB on
        # every SR 26-2 evaluation while implying the store was broken.
        degraded = self._degrade_flag()
        result, _ = get_or_load(
            cache_key, self._TTL_COUNT,
            lambda: self._count_events_impl(category, severity_min, agent, since_days, degraded),
            should_cache=lambda _r: not degraded["table_read_failed"],
        )
        return result

    def _count_events_impl(
        self,
        category: Optional[AuditCategory],
        severity_min: Optional[AuditSeverity],
        agent: Optional[str],
        since_days: Optional[int],
        degraded: Optional[Dict[str, bool]] = None,
    ) -> int:
        order = {AuditSeverity.LOW: 0, AuditSeverity.MEDIUM: 1, AuditSeverity.HIGH: 2, AuditSeverity.CRITICAL: 3}
        floor = order.get(severity_min) if severity_min else None
        # The flag is threaded down because the count itself cannot show its provenance:
        # a 0 from a reachable table and a 0 from an empty buffer are the same integer.
        events = self._query_events_impl(
            agent=agent, category=category, severity=None, since_days=since_days,
            scan_limit=1000, degraded=degraded,
        )
        if floor is not None:
            events = [e for e in events if order.get(e.severity, 0) >= floor]
        return len(events)

    def count_by_action(
        self,
        agent: str,
        category: AuditCategory = AuditCategory.APPROVAL,
        since_days: Optional[int] = None,
    ) -> Dict[str, int]:
        """Count events for an agent bucketed by their `action` value.

        The agreement-rate numerator/denominator: e.g. {"approve": 12,
        "reject": 2, "escalate": 1, ...}. Empty dict if the agent has no events.
        """
        cat_key = category.value
        days_key = str(since_days) if since_days is not None else "all"
        cache_key = f"audit:count_by_action:{self.table_name}:{agent}:{cat_key}:{days_key}"
        # Provenance predicate, see _degrade_flag. An empty dict is the correct answer for
        # an agent with no approvals yet, so truthiness would permanently uncache exactly
        # the agents that are cheapest to serve and most often asked about.
        degraded = self._degrade_flag()
        result, _ = get_or_load(
            cache_key, self._TTL_COUNT,
            lambda: self._count_by_action_impl(agent, category, since_days, degraded),
            should_cache=lambda _r: not degraded["table_read_failed"],
        )
        return result

    def _count_by_action_impl(
        self,
        agent: str,
        category: AuditCategory,
        since_days: Optional[int],
        degraded: Optional[Dict[str, bool]] = None,
    ) -> Dict[str, int]:
        events = self._query_events_impl(
            agent=agent, category=category, severity=None, since_days=since_days,
            scan_limit=1000, degraded=degraded,
        )
        counts: Dict[str, int] = {}
        for e in events:
            key = (e.action or "").strip().lower()
            counts[key] = counts.get(key, 0) + 1
        return counts
