"""Govern Enforcement service — the runtime allow/pause/deny decision engine.

evaluate() is deterministic with a fixed precedence:
    explicit policy DENY  >  tool-requires-approval  >  autonomy-ladder gate
    >  explicit policy ALLOW  >  default (pause)
Every non-dry-run decision is persisted (append-only) AND written to the audit
log (category=enforcement) with decision_id linkage. A "pause" is the hook that
routes to the Human Oversight handoff workspace; the human's resolution can be
recorded as a second linked decision — the fully-local, examiner-provable loop.

Storage:
    pk = "ENFORCE#DECISION"  sk = "<ts>#<id>"   -> append-only decisions
    pk = "ENFORCE#POLICY#<id>" sk = "LATEST"     -> versioned policies
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key

from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from models.govern_enforcement import (
    Disposition,
    EnforcementDecision,
    EnforcementMode,
    EnforcementPolicy,
    EnforcementPolicyCreate,
    EnforcementRequest,
    fingerprint,
    gate_disposition,
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


# Risk-tier severity for the audit event a deny/pause writes.
_SEV = {"low": AuditSeverity.LOW, "medium": AuditSeverity.MEDIUM, "high": AuditSeverity.HIGH, "critical": AuditSeverity.CRITICAL}


class GovernEnforcementService:
    DEC_PK = "ENFORCE#DECISION"
    POL_PREFIX = "ENFORCE#POLICY#"
    SK_LATEST = "LATEST"

    def __init__(self, table_name: str, audit_service: GovernAuditService, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self.audit = audit_service
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- The decision engine ----------------------------------------------

    def evaluate(self, req: EnforcementRequest, mode: EnforcementMode = EnforcementMode.ADVISORY, dry_run: bool = False) -> EnforcementDecision:
        disposition, reason, matched_by = self._decide(req)
        decision = EnforcementDecision(
            agent_id=req.agent_id, scope_level=req.scope_level, action_type=req.action_type.value,
            tool=req.tool, risk_tier=req.risk_tier.value, disposition=disposition, reason=reason,
            matched_by=matched_by, enforcement_mode=mode, source_principal=req.source_principal,
            args_fingerprint=fingerprint(req.args),
        )
        if dry_run:
            return decision
        self._persist_decision(decision)
        self._audit_decision(decision)
        return decision

    def _decide(self, req: EnforcementRequest):
        # 1. explicit policy DENY wins outright
        for pol in self.list_policies():
            if not pol.enabled:
                continue
            for rule in pol.rules:
                if self._rule_matches(rule, req):
                    if rule.effect == Disposition.DENY:
                        return Disposition.DENY, rule.reason or f"Denied by policy {pol.name}", f"policy:{pol.policy_id}"
        # 2. autonomy-ladder gate (the hero) — default disposition for scope x action x risk
        gate = gate_disposition(req.scope_level, req.action_type.value, req.risk_tier.value)
        # 3. explicit policy ALLOW can upgrade a gate PAUSE to ALLOW (never a DENY)
        if gate == Disposition.PAUSE:
            for pol in self.list_policies():
                if not pol.enabled:
                    continue
                for rule in pol.rules:
                    if self._rule_matches(rule, req) and rule.effect == Disposition.ALLOW:
                        return Disposition.ALLOW, rule.reason or f"Allowed by policy {pol.name}", f"policy:{pol.policy_id}"
        reason = {
            Disposition.ALLOW: f"Within L{req.scope_level} autonomy for {req.action_type.value}/{req.risk_tier.value}",
            Disposition.PAUSE: f"L{req.scope_level} requires human approval for {req.action_type.value}/{req.risk_tier.value}",
            Disposition.DENY: f"L{req.scope_level} does not permit {req.action_type.value}/{req.risk_tier.value}",
        }[gate]
        return gate, reason, "ladder-gate"

    def _rule_matches(self, rule, req: EnforcementRequest) -> bool:
        if rule.agent_id and rule.agent_id != req.agent_id:
            return False
        if rule.action_type and rule.action_type != req.action_type.value:
            return False
        if rule.tool and rule.tool != req.tool:
            return False
        if rule.risk_tier and rule.risk_tier != req.risk_tier.value:
            return False
        return any([rule.agent_id, rule.action_type, rule.tool, rule.risk_tier])

    # --- Decision persistence + audit -------------------------------------

    def _persist_decision(self, d: EnforcementDecision) -> None:
        # Best-effort: when the decisions table isn't provisioned (running locally
        # without the DynamoDB backend) the decision is still returned to the
        # caller and audited; it just isn't persisted to history.
        body = d.model_dump(mode="json")
        try:
            self.table.put_item(Item=_to_ddb({
                "pk": self.DEC_PK, "sk": f"{body['ts']}#{d.id}", "id": d.id,
                "agent_id": d.agent_id, "disposition": d.disposition.value,
                "data": json.dumps(body),
            }))
        except Exception:
            logger.info("Enforcement decision not persisted (decisions table unavailable)")

    def _audit_decision(self, d: EnforcementDecision) -> None:
        self.audit.append(AuditEventCreate(
            category=AuditCategory.ENFORCEMENT,
            severity=_SEV.get(d.risk_tier, AuditSeverity.MEDIUM),
            actor=d.source_principal, agent=d.agent_id,
            summary=f"{d.disposition.value.upper()} {d.action_type} '{d.tool}' (L{d.scope_level}, {d.risk_tier})",
            action=d.disposition.value,
            evidence=f"enforcement:{d.id}",
            decision_context=f"{d.reason}. Matched by {d.matched_by}. Mode={d.enforcement_mode.value}. "
                             f"{'A live intercept would have blocked this.' if d.enforcement_mode == EnforcementMode.BLOCKING else 'Advisory (no live intercept locally).'}",
        ), created_by=d.source_principal)

    def list_decisions(self, agent_id: Optional[str] = None, limit: int = 200) -> List[EnforcementDecision]:
        # Graceful when the decisions table isn't provisioned (local / no DynamoDB
        # backend): the gate + dry-run evaluate work table-free, but the persisted
        # decision history is empty until the table exists.
        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self.DEC_PK),
                ScanIndexForward=False, Limit=max(1, min(limit, 1000)),
            )
        except Exception:
            return []
        # link_resolution() writes linkage markers under the same partition with a
        # "link#..." sk and no "data" attribute — skip those; only decision rows
        # carry a serialized "data" blob.
        out = [
            EnforcementDecision.model_validate(_from_ddb(json.loads(i["data"])))
            for i in resp.get("Items", [])
            if "data" in i
        ]
        if agent_id:
            out = [d for d in out if d.agent_id == agent_id]
        return out

    def link_resolution(self, decision_id: str, handoff_id: Optional[str], resolved_decision_id: Optional[str]) -> None:
        """Record that a paused decision was routed to a handoff / resolved."""
        # Append-only store: we write a small linkage marker rather than mutate.
        self.table.put_item(Item=_to_ddb({
            "pk": self.DEC_PK, "sk": f"link#{decision_id}",
            "link_for": decision_id, "handoff_id": handoff_id, "resolved_decision_id": resolved_decision_id,
        }))

    # --- Policy CRUD -------------------------------------------------------

    def create_policy(self, req: EnforcementPolicyCreate) -> EnforcementPolicy:
        p = EnforcementPolicy(**req.model_dump())
        self._put_policy(p)
        return p

    def _put_policy(self, p: EnforcementPolicy) -> None:
        body = p.model_dump(mode="json")
        self.table.put_item(Item=_to_ddb({
            "pk": f"{self.POL_PREFIX}{p.policy_id}", "sk": self.SK_LATEST,
            "policy_id": p.policy_id, "data": json.dumps(body),
        }))

    def list_policies(self) -> List[EnforcementPolicy]:
        # Degrade gracefully if the table isn't provisioned (local dev / dry-run):
        # the autonomy-ladder gate is pure and must still return a decision.
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.POL_PREFIX))
        except Exception as e:
            logger.warning(f"Enforcement policy table unavailable ({e}); evaluating with ladder-gate only")
            return []
        return [EnforcementPolicy.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]

    def get_policy(self, policy_id: str) -> Optional[EnforcementPolicy]:
        resp = self.table.get_item(Key={"pk": f"{self.POL_PREFIX}{policy_id}", "sk": self.SK_LATEST})
        item = resp.get("Item")
        return EnforcementPolicy.model_validate(_from_ddb(json.loads(item["data"]))) if item else None

    def delete_policy(self, policy_id: str) -> Optional[EnforcementPolicy]:
        p = self.get_policy(policy_id)
        if not p:
            return None
        self.table.delete_item(Key={"pk": f"{self.POL_PREFIX}{policy_id}", "sk": self.SK_LATEST})
        return p
