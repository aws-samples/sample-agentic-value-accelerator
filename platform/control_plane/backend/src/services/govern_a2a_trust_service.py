"""Govern A2A Trust service — delegation authorization with the autonomy ceiling.

evaluate() is pure + deterministic: priority-sorted policy match (fnmatch on
source/target) -> explicit-deny-wins -> action check -> chain-depth -> THEN the
autonomy ceiling = min(source.scope, target.scope, policy.max_delegated_autonomy);
if requested autonomy > ceiling -> deny(autonomy_ceiling). Default-deny =>
no_policy. Every call appends a category=a2a audit event.

Composes with (does not duplicate) the org's Cedar PolicyService — export_cedar()
emits a Cedar statement as the bridge to AgentCore gateway enforcement.

Storage: pk="TRUSTPOLICY#<id>" sk=LATEST ; pk="AGENTIDENTITY#<id>" sk=LATEST.
"""

from __future__ import annotations

import fnmatch
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from models.govern_a2a_trust import (
    AgentIdentity,
    AgentIdentityCreate,
    DelegationDecision,
    DelegationRequest,
    DeniedBy,
    TrustEffect,
    TrustPolicy,
    TrustPolicyCreate,
    TrustPolicyUpdate,
)
from services.govern_audit_service import GovernAuditService

logger = logging.getLogger(__name__)


# Built-in baseline policy used when the trust-policy table isn't provisioned
# (e.g. running locally without the DynamoDB backend). The autonomy-ceiling differentiator is
# pure logic and must demonstrate with no table — mirrors how the enforcement gate
# ships a FALLBACK_GATE. A permissive "any-to-any, cap L4" baseline lets the
# ceiling = min(source, target, cap) still bind on the source/target scopes.
def _default_policies() -> List["TrustPolicy"]:
    return [
        TrustPolicy(
            policy_id="tp-baseline",
            name="Baseline delegation (built-in)",
            source_pattern="*",
            target_pattern="*",
            allowed_actions=[],  # any action
            effect=TrustEffect.PERMIT,
            priority=1000,  # lowest precedence — real policies win
            max_delegated_autonomy=4,
        )
    ]


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


class GovernA2ATrustService:
    POL_PREFIX = "TRUSTPOLICY#"
    ID_PREFIX = "AGENTIDENTITY#"
    SK_LATEST = "LATEST"

    def __init__(self, table_name: str, audit_service: GovernAuditService, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self.audit = audit_service
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- Trust policy CRUD -------------------------------------------------

    def create_policy(self, req: TrustPolicyCreate) -> TrustPolicy:
        p = TrustPolicy(**req.model_dump())
        self._put(f"{self.POL_PREFIX}{p.policy_id}", p.model_dump(mode="json"), p.policy_id, "policy_id")
        return p

    def list_policies(self) -> List[TrustPolicy]:
        # Graceful when the table isn't provisioned (local / no DynamoDB backend): return [] so the
        # caller can fall back to the built-in baseline. Mirrors the enforcement
        # service's table-free fallback.
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.POL_PREFIX))
        except Exception:
            return []
        return [TrustPolicy.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]

    def get_policy(self, policy_id: str) -> Optional[TrustPolicy]:
        item = self.table.get_item(Key={"pk": f"{self.POL_PREFIX}{policy_id}", "sk": self.SK_LATEST}).get("Item")
        return TrustPolicy.model_validate(_from_ddb(json.loads(item["data"]))) if item else None

    def update_policy(self, policy_id: str, req: TrustPolicyUpdate) -> Optional[TrustPolicy]:
        p = self.get_policy(policy_id)
        if not p:
            return None
        for f, v in req.model_dump(exclude_none=True).items():
            setattr(p, f, v)
        p.updated_at = datetime.utcnow()
        self._put(f"{self.POL_PREFIX}{p.policy_id}", p.model_dump(mode="json"), p.policy_id, "policy_id")
        return p

    def delete_policy(self, policy_id: str) -> Optional[TrustPolicy]:
        p = self.get_policy(policy_id)
        if not p:
            return None
        self.table.delete_item(Key={"pk": f"{self.POL_PREFIX}{policy_id}", "sk": self.SK_LATEST})
        return p

    # --- Agent identity CRUD (real persisted scope binding) ----------------

    def upsert_identity(self, req: AgentIdentityCreate) -> AgentIdentity:
        existing = self.get_identity(req.agent_id)
        if existing:
            for f, v in req.model_dump(exclude_none=True).items():
                setattr(existing, f, v)
            existing.updated_at = datetime.utcnow()
            ident = existing
        else:
            ident = AgentIdentity(**req.model_dump())
        self._put(f"{self.ID_PREFIX}{ident.agent_id}", ident.model_dump(mode="json"), ident.agent_id, "agent_id")
        return ident

    def get_identity(self, agent_id: str) -> Optional[AgentIdentity]:
        # Graceful when the table isn't provisioned (local / no DynamoDB backend): treat as an
        # unregistered identity (None) rather than raising — evaluate() then
        # floors its scope to L1, keeping the autonomy ceiling honest.
        try:
            item = self.table.get_item(Key={"pk": f"{self.ID_PREFIX}{agent_id}", "sk": self.SK_LATEST}).get("Item")
        except Exception:
            return None
        return AgentIdentity.model_validate(_from_ddb(json.loads(item["data"]))) if item else None

    def list_identities(self) -> List[AgentIdentity]:
        # Graceful when the table isn't provisioned (local / no DynamoDB backend): return [].
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.ID_PREFIX))
        except Exception:
            return []
        return [AgentIdentity.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]

    def _put(self, pk: str, body: dict, ident: str, id_field: str) -> None:
        self.table.put_item(Item=_to_ddb({"pk": pk, "sk": self.SK_LATEST, id_field: ident, "data": json.dumps(body)}))

    # --- The differentiator: evaluate a delegation with the autonomy ceiling

    def evaluate(self, req: DelegationRequest) -> DelegationDecision:
        src = self.get_identity(req.source_agent_id)
        tgt = self.get_identity(req.target_agent_id)
        # An unregistered identity has no attested scope, so it must NOT be able to
        # self-assert the autonomy it's requesting — that would defeat the ceiling
        # ("cannot delegate more autonomy than either party holds"). Default a
        # missing identity to the conservative floor (L1) instead of req.requested_autonomy.
        src_scope = src.scope_level if src else 1
        tgt_scope = tgt.scope_level if tgt else 1

        policies = sorted([p for p in self.list_policies() if p.enabled], key=lambda p: p.priority)
        # Table-free (local / no DynamoDB backend): no persisted policies — fall back to the built-in
        # baseline so the autonomy-ceiling differentiator still evaluates.
        if not policies:
            policies = _default_policies()
        decision = self._decide(req, policies, src_scope, tgt_scope)
        self._audit(decision)
        return decision

    def _decide(self, req, policies, src_scope, tgt_scope) -> DelegationDecision:
        base = dict(
            source_agent_id=req.source_agent_id, target_agent_id=req.target_agent_id, action=req.action,
            requested_autonomy=req.requested_autonomy, source_scope=src_scope, target_scope=tgt_scope,
        )
        for p in policies:
            if not (fnmatch.fnmatch(req.source_agent_id, p.source_pattern) and
                    fnmatch.fnmatch(req.target_agent_id, p.target_pattern)):
                continue
            # explicit deny wins
            if p.effect == TrustEffect.DENY:
                return DelegationDecision(**base, effect=TrustEffect.DENY, denied_by=DeniedBy.EXPLICIT_DENY,
                                          reason=f"Denied by trust policy {p.name}", matched_policy_id=p.policy_id,
                                          effective_autonomy_ceiling=0)
            # action allowed?
            if p.allowed_actions and req.action not in p.allowed_actions:
                return DelegationDecision(**base, effect=TrustEffect.DENY, denied_by=DeniedBy.ACTION_NOT_ALLOWED,
                                          reason=f"Action '{req.action}' not in policy {p.name} allowed actions",
                                          matched_policy_id=p.policy_id, effective_autonomy_ceiling=0)
            # chain depth
            if req.chain_depth > p.constraint.max_chain_depth:
                return DelegationDecision(**base, effect=TrustEffect.DENY, denied_by=DeniedBy.CHAIN_DEPTH,
                                          reason=f"Delegation chain depth {req.chain_depth} > max {p.constraint.max_chain_depth}",
                                          matched_policy_id=p.policy_id, effective_autonomy_ceiling=0)
            # THE DIFFERENTIATOR: autonomy ceiling
            ceiling = min(src_scope, tgt_scope, p.max_delegated_autonomy)
            if req.requested_autonomy > ceiling:
                return DelegationDecision(**base, effect=TrustEffect.DENY, denied_by=DeniedBy.AUTONOMY_CEILING,
                                          reason=f"Requested autonomy L{req.requested_autonomy} exceeds ceiling L{ceiling} "
                                                 f"(min of source L{src_scope}, target L{tgt_scope}, policy cap L{p.max_delegated_autonomy})",
                                          matched_policy_id=p.policy_id, effective_autonomy_ceiling=ceiling)
            # permit
            return DelegationDecision(**base, effect=TrustEffect.PERMIT, reason=f"Permitted by trust policy {p.name} within L{ceiling} ceiling",
                                      matched_policy_id=p.policy_id, effective_autonomy_ceiling=ceiling)
        # default-deny
        return DelegationDecision(**base, effect=TrustEffect.DENY, denied_by=DeniedBy.NO_POLICY,
                                  reason="No matching trust policy — default deny", effective_autonomy_ceiling=0)

    def _audit(self, d: DelegationDecision) -> None:
        # Best-effort: the audit table may be absent (local / no DynamoDB backend). A missing audit
        # sink must not fail the evaluation — the decision is still returned.
        try:
            self.audit.append(AuditEventCreate(
                category=AuditCategory.A2A,
                severity=AuditSeverity.MEDIUM if d.effect == TrustEffect.DENY else AuditSeverity.LOW,
                actor=d.source_agent_id, agent=d.target_agent_id,
                summary=f"A2A {d.effect.value.upper()}: {d.source_agent_id} -> {d.target_agent_id} for '{d.action}'",
                action=d.effect.value,
                evidence=f"trust-policy:{d.matched_policy_id or 'none'}",
                decision_context=f"{d.reason}. Autonomy ceiling L{d.effective_autonomy_ceiling} "
                                 f"(source L{d.source_scope}, target L{d.target_scope}, requested L{d.requested_autonomy}).",
            ), created_by=d.source_agent_id)
        except Exception:
            logger.info("A2A audit append skipped (audit sink unavailable)")

    # --- Cedar export: the bridge to the existing AgentCore policy engine ---

    def export_cedar(self, policy_id: str) -> Optional[str]:
        """Emit a Cedar statement for a trust policy — the honest bridge across
        the PDP/PEP seam to the org's existing AgentCore gateway enforcement."""
        p = self.get_policy(policy_id)
        if not p:
            return None
        effect = "permit" if p.effect == TrustEffect.PERMIT else "forbid"
        actions = ", ".join(f'Action::"{a}"' for a in p.allowed_actions) if p.allowed_actions else "*"
        return (
            f'// AVA Govern A2A trust policy {p.policy_id} ({p.name})\n'
            f'// autonomy ceiling: min(source, target, L{p.max_delegated_autonomy})\n'
            f'{effect}(\n'
            f'  principal in Agent::"{p.source_pattern}",\n'
            f'  action in [{actions}],\n'
            f'  resource in Agent::"{p.target_pattern}"\n'
            f') when {{ context.delegated_autonomy <= {p.max_delegated_autonomy} }};'
        )
