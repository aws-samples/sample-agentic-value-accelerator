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
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from models.govern_audit import AuditCategory, AuditEvent, AuditEventCreate, AuditSeverity

logger = logging.getLogger(__name__)


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

    # Ephemeral in-memory audit buffer used when the audit table isn't provisioned
    # (e.g. running locally without the DynamoDB backend). The audit log is the hub
    # the governance signals compute off — seeded/enforcement/A2A events land here
    # so graduation signals, SR 26-2 evidence, and the audit feed all still work
    # table-free. Not durable across restarts. Class-level so it's shared across the
    # lazy-singleton services.
    _mem: List[AuditEvent] = []
    _MEM_CAP = 50000  # bound the buffer so a long-running local process can't grow unbounded
    # Tri-state cache of table availability: None=unknown, True=live, False=absent.
    # Once we learn the table is absent we skip the boto3 round-trip entirely — a
    # failing PutItem per event is ~15ms, which makes seeding thousands of events
    # pathologically slow. Class-level so it's shared across services.
    _table_ok: Optional[bool] = None

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

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
        # Once the table is known-absent, skip the (slow, failing) boto3 call.
        if type(self)._table_ok is False:
            self._buffer(e)
            return e
        try:
            self.table.put_item(Item=self._to_item(e))
            type(self)._table_ok = True
        except Exception:
            # Table not provisioned (local / no DynamoDB backend): buffer in memory so the audit hub
            # still feeds the compute-on-read differentiators.
            type(self)._table_ok = False
            self._buffer(e)
        return e

    def _buffer(self, e: AuditEvent) -> None:
        type(self)._mem.append(e)
        if len(type(self)._mem) > self._MEM_CAP:
            del type(self)._mem[: len(type(self)._mem) - self._MEM_CAP]

    def get(self, event_id: str, ts: Optional[str] = None) -> Optional[AuditEvent]:
        # When ts is known, do a direct GetItem; otherwise fall back to a
        # bounded query filtering by id (id is embedded in the sk).
        # Graceful when the table isn't provisioned (local / no DynamoDB backend): treat as not-found.
        try:
            if ts:
                resp = self.table.get_item(Key={"pk": self.PK, "sk": f"{ts}#{event_id}"})
                item = resp.get("Item")
                return self._from_item(item) if item else None
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self.PK),
                ScanIndexForward=False,
            )
        except Exception:
            # Table absent (local / no DynamoDB backend): search the in-memory buffer.
            return next((e for e in type(self)._mem if e.id == event_id), None)
        for item in resp.get("Items", []):
            if item.get("id") == event_id:
                return self._from_item(item)
        return None

    def list(
        self,
        category: Optional[AuditCategory] = None,
        limit: int = 200,
    ) -> List[AuditEvent]:
        query_kwargs = {
            "KeyConditionExpression": Key("pk").eq(self.PK),
            "ScanIndexForward": False,  # newest-first
            "Limit": max(1, min(limit, 1000)),
        }
        try:
            resp = self.table.query(**query_kwargs)
        except Exception as e:
            # Table not provisioned (local / no DynamoDB backend): serve the in-memory buffer
            # (newest-first) rather than 500-ing.
            logger.info(f"Audit list served from in-memory buffer ({e})")
            events = sorted(type(self)._mem, key=_event_dt, reverse=True)[: query_kwargs["Limit"]]
            if category:
                events = [e for e in events if e.category == category]
            return events
        events = [self._from_item(i) for i in resp.get("Items", [])]
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
            events = [self._from_item(i) for i in resp.get("Items", [])]
            from_table = True
        except Exception:
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
        # In-memory path: cap AFTER filtering so per-agent counts aren't truncated
        # by unrelated agents' events crowding the newest page.
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
        order = {AuditSeverity.LOW: 0, AuditSeverity.MEDIUM: 1, AuditSeverity.HIGH: 2, AuditSeverity.CRITICAL: 3}
        floor = order.get(severity_min) if severity_min else None
        events = self.query_events(agent=agent, category=category, since_days=since_days)
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
        events = self.query_events(agent=agent, category=category, since_days=since_days)
        counts: Dict[str, int] = {}
        for e in events:
            key = (e.action or "").strip().lower()
            counts[key] = counts.get(key, 0) + 1
        return counts
