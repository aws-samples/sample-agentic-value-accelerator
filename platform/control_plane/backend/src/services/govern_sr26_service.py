"""Govern SR 26-2 service — CRUD + live evaluate() against the real audit log.

Storage: pk = "SR26#<id>"  sk = "LATEST"  (same pattern as conformance).

evaluate() is the differentiator: it walks each control's binding and resolves
it against real signals — audit-log queries (via GovernAuditService), the live
guardrail signal, or client-supplied autonomy/graduation values — flipping the
control to pass/warning/fail with a signal_source tag and computing
evidence_backed_pct. Each evaluate() run appends a category=config audit event,
so the SR 26-2 mapping's own state changes are themselves in the examiner log.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from models.govern_conformance import ConformanceStatus
from models.govern_sr26 import (
    BindingKind,
    SignalSource,
    SR26Mapping,
    SR26MappingCreate,
    SR26MappingUpdate,
    compute,
    default_catalog,
)
from services.govern_audit_service import GovernAuditService

logger = logging.getLogger(__name__)


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


class GovernSr26Service:
    PK_PREFIX = "SR26#"
    SK_LATEST = "LATEST"

    # Ephemeral in-memory store used when the SR26 table isn't provisioned (e.g.
    # running locally without the DynamoDB backend). SR 26-2 mappings are stateful
    # CRUD, so a table-free environment can't PERSIST across restarts — but the full
    # agent-reframed catalog and live evaluate still work. Writes go here when
    # DynamoDB is absent.
    # Class-level so it survives the lazy-singleton service across requests.
    _mem: Dict[str, SR26Mapping] = {}

    def __init__(self, table_name: str, audit_service: GovernAuditService, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self.audit = audit_service
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    def _to_item(self, m: SR26Mapping) -> dict:
        body = m.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{m.sr26_id}", "sk": self.SK_LATEST,
            "sr26_id": m.sr26_id, "name": m.name, "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> SR26Mapping:
        return SR26Mapping.model_validate(_from_ddb(json.loads(item["data"])))

    # --- Persistence with table-free fallback ------------------------------

    def _persist(self, m: SR26Mapping) -> None:
        """Write to DynamoDB; fall back to the ephemeral in-memory store when the
        table isn't provisioned so the surface stays fully functional locally."""
        try:
            self.table.put_item(Item=self._to_item(m))
        except Exception:
            type(self)._mem[m.sr26_id] = m

    # --- CRUD --------------------------------------------------------------

    def create(self, req: SR26MappingCreate, created_by: Optional[str] = None) -> SR26Mapping:
        # exclude_none so an unset `pillars` (Optional on the create model) doesn't
        # flow as None into SR26Mapping's non-optional List field; we set the
        # default catalog immediately below regardless.
        m = SR26Mapping(**req.model_dump(exclude_none=True), created_by=created_by)
        if not m.pillars:
            m.pillars = default_catalog()
        m.computed = compute(m)
        self._persist(m)
        return m

    def get(self, sr26_id: str) -> Optional[SR26Mapping]:
        try:
            resp = self.table.get_item(Key={"pk": f"{self.PK_PREFIX}{sr26_id}", "sk": self.SK_LATEST})
            item = resp.get("Item")
            if item:
                return self._from_item(item)
        except Exception:
            pass
        return type(self)._mem.get(sr26_id)

    def list(self) -> List[SR26Mapping]:
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.PK_PREFIX))
            out = [self._from_item(i) for i in resp.get("Items", [])]
        except Exception:
            # Table absent (local / no DynamoDB backend): serve whatever is in the ephemeral store.
            out = list(type(self)._mem.values())
        out.sort(key=lambda x: x.updated_at, reverse=True)
        return out

    def update(self, sr26_id: str, req: SR26MappingUpdate) -> Optional[SR26Mapping]:
        m = self.get(sr26_id)
        if not m:
            return None
        for f, v in req.model_dump(exclude_none=True).items():
            setattr(m, f, v)
        m.updated_at = datetime.utcnow()
        m.computed = compute(m)
        self._persist(m)
        return m

    def delete(self, sr26_id: str) -> Optional[SR26Mapping]:
        m = self.get(sr26_id)
        if not m:
            return None
        try:
            self.table.delete_item(Key={"pk": f"{self.PK_PREFIX}{sr26_id}", "sk": self.SK_LATEST})
        except Exception:
            pass
        type(self)._mem.pop(sr26_id, None)
        return m

    def build_default_catalog(self, sr26_id: str) -> Optional[SR26Mapping]:
        m = self.get(sr26_id)
        if not m:
            return None
        m.pillars = default_catalog()
        m.updated_at = datetime.utcnow()
        m.computed = compute(m)
        self._persist(m)
        return m

    # --- The differentiator: evaluate bindings against real signals --------

    def evaluate(self, sr26_id: str, autonomy_level: Optional[int] = None, graduation_ready: Optional[bool] = None) -> Optional[SR26Mapping]:
        """Resolve each control's binding against real signals; flip status +
        tag signal_source; recompute; audit the evaluation run."""
        m = self.get(sr26_id)
        if not m:
            return None
        agent = m.agent_id

        for pillar in m.pillars:
            for c in pillar.controls:
                b = c.binding
                if b.kind == BindingKind.AUDIT_QUERY:
                    self._eval_audit_query(c, b, agent)
                elif b.kind == BindingKind.HANDOFF_RECORD:
                    self._eval_audit_query(c, b, agent)  # same mechanism: count decisions
                elif b.kind == BindingKind.GUARDRAIL_CHECK:
                    self._eval_guardrail(c, b, agent)
                elif b.kind == BindingKind.AUTONOMY_LEVEL:
                    self._eval_client(c, autonomy_level is not None,
                                      f"scope L{autonomy_level}" if autonomy_level is not None else "not supplied")
                elif b.kind == BindingKind.GRADUATION_SIGNAL:
                    self._eval_client(c, graduation_ready is not None,
                                      f"graduation {'ready' if graduation_ready else 'not-ready'}" if graduation_ready is not None else "not supplied")
                else:  # MANUAL
                    c.signal_source = SignalSource.PENDING
                    if c.status == ConformanceStatus.NOT_STARTED:
                        c.status = ConformanceStatus.IN_PROGRESS
                    c.evaluated_value = "manual attestation"

        m.updated_at = datetime.utcnow()
        m.computed = compute(m)
        self._persist(m)

        # Audit the evaluation itself (category=config) — SR 26-2 mapping state
        # changes live in the same examiner log. Best-effort: the audit table may
        # be absent locally, which must not fail the evaluation.
        try:
            self.audit.append(AuditEventCreate(
                category=AuditCategory.CONFIG, severity=AuditSeverity.LOW, actor="user",
                agent=agent,
                summary=f"SR 26-2 mapping '{m.name}' evaluated: {m.computed.conformance_pct}% conformant, {m.computed.evidence_backed_pct}% evidence-backed",
                action="sr26-evaluate",
                decision_context=f"Evaluated {m.computed.total_controls} agent-reframed SR 26-2 controls against live signals for agent {agent or '(fleet)'}.",
            ), created_by="user")
        except Exception:
            logger.info("SR26 audit append skipped (audit sink unavailable)")
        return m

    def _eval_audit_query(self, c, b, agent):
        # Binding category/severity_min are free strings on the stored model — coerce
        # defensively so a hand-authored binding can't 500 the evaluate endpoint.
        try:
            cat = AuditCategory(b.category) if b.category else AuditCategory.APPROVAL
        except ValueError:
            cat = AuditCategory.APPROVAL
        try:
            sev = AuditSeverity(b.severity_min) if b.severity_min else None
        except ValueError:
            sev = None
        n = self.audit.count_events(category=cat, severity_min=sev, agent=agent, since_days=b.since_days)
        c.signal_source = SignalSource.LIVE
        c.evaluated_value = f"{n} events / {b.since_days}d"
        if b.max_count is not None:
            c.status = ConformanceStatus.PASS if n <= b.max_count else ConformanceStatus.FAIL
        else:
            need = b.min_count if b.min_count is not None else 1
            c.status = ConformanceStatus.PASS if n >= need else ConformanceStatus.FAIL

    def _eval_guardrail(self, c, b, agent):
        # Live if any guardrail events exist for this agent; else pending (the
        # signal is wired but hasn't fired) — honest, not a fake pass.
        n = self.audit.count_events(category=AuditCategory.GUARDRAIL, agent=agent, since_days=b.since_days)
        if n > 0:
            c.signal_source = SignalSource.LIVE
            c.status = ConformanceStatus.PASS
            c.evaluated_value = f"{n} guardrail events / {b.since_days}d"
        else:
            c.signal_source = SignalSource.PENDING
            c.status = ConformanceStatus.IN_PROGRESS
            c.evaluated_value = "guardrail wired; no interventions logged yet"

    def _eval_client(self, c, supplied: bool, value: str):
        c.signal_source = SignalSource.CLIENT_SUPPLIED if supplied else SignalSource.PENDING
        c.evaluated_value = value
        c.status = ConformanceStatus.PASS if supplied else ConformanceStatus.IN_PROGRESS
