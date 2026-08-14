"""Approval Policy evaluator + priority resolver.

Called from every mutating route to answer: "for this resource + action,
what does policy say?" Returns a `PolicyVerdict` the caller acts on:

    verdict = engine.evaluate(kind='mcp', resource_id='sec-edgar', action='register')
    if verdict.mode == 'deny':
        raise HTTPException(403, verdict.reason)
    if verdict.mode == 'require_approval':
        record = create_pending(...)
        enqueue_approval(record, verdict=verdict)
    else:  # auto_approve
        record = create_approved(...)

Priority resolution — when multiple active policies match:
  1. `mode` strictness wins    (deny > require_approval > auto_approve)
  2. resource_pattern specificity — 'agent-safety' beats 'prod-*' beats '*'
  3. action_pattern specificity — 'deploy' beats '*'
  4. Ties → the more restrictive `required_role` (ADMIN > OPERATOR)
  5. Final tie → deterministic on policy_id

The evaluator is a plain module-level function; no long-lived state. Each
call re-reads the policies table because operators may edit policies
between requests, and stale caches would silently apply old rules. DDB
scan is cheap at expected volume (<100 policies per environment); if that
changes we add a 30-second in-process cache.
"""

from __future__ import annotations

import fnmatch
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)


# Evaluation modes surfaced to callers. Kept as string constants (not enum)
# so the value can round-trip through JSON without a converter.
MODE_AUTO_APPROVE     = "auto_approve"      # no policy or policy explicitly allows
MODE_REQUIRE_APPROVAL = "require_approval"  # queue and wait
MODE_DENY             = "deny"              # refuse outright

# `mode` values a policy row may carry. `status='active'` policies default
# to `require_approval` if `mode` is absent — matches the existing UI
# assumption that active-policy == needs-approval.
_STRICTNESS = {
    MODE_AUTO_APPROVE: 0,
    MODE_REQUIRE_APPROVAL: 1,
    MODE_DENY: 2,
}

_ROLE_STRICTNESS = {"VIEWER": 0, "OPERATOR": 1, "ADMIN": 2}


@dataclass
class PolicyVerdict:
    """The evaluator's answer. `mode` is the primary switch; the other
    fields carry the policy details the caller needs to enqueue an
    approval-queue row with the right required_role / quorum / SLA."""
    mode: str = MODE_AUTO_APPROVE
    policy_id: str = ""
    policy_name: str = ""
    required_role: str = "OPERATOR"
    quorum: int = 1
    sla_hours: int = 24
    reason: str = ""
    # Full snapshot of the matched policy at evaluation time. Persisted on
    # the queue row so audit sees the exact rule that fired — policies
    # evolve, decisions must not.
    snapshot: Dict[str, Any] = field(default_factory=dict)


# ─── DDB access ─────────────────────────────────────────────────────────


_table = None


def _policies_table():
    """Cached handle to the approval-policies table. `None` if the env var
    isn't set — evaluator falls back to `auto_approve` in that case so
    the platform stays usable during Terraform bring-up."""
    global _table
    if _table is None and settings.APPROVAL_POLICIES_TABLE_NAME:
        _table = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.APPROVAL_POLICIES_TABLE_NAME
        )
    return _table


def _load_active_policies() -> List[Dict[str, Any]]:
    tbl = _policies_table()
    if tbl is None:
        return []
    try:
        resp = tbl.scan()
        return [p for p in (resp.get("Items") or []) if p.get("status") == "active"]
    except ClientError as e:
        logger.warning(f"approval_policies scan failed: {e}")
        return []


# ─── Priority resolution ────────────────────────────────────────────────


def _specificity(pattern: str) -> int:
    """Rough measure of glob specificity — literal segments outrank
    wildcards. Simple and deterministic; a `*` pattern scores 0, a
    literal string scores its own length. Enough to sort 'agent-safety'
    ahead of 'prod-*' ahead of '*'.
    """
    if not pattern or pattern == "*":
        return 0
    wildcards = pattern.count("*") + pattern.count("?")
    return max(len(pattern) - 5 * wildcards, 1)


def _score(policy: Dict[str, Any]) -> tuple:
    """Sort key: bigger tuple wins. Order matches the doc contract above."""
    mode = _normalize_mode(policy)
    return (
        _STRICTNESS.get(mode, 1),
        _specificity(policy.get("resource_pattern", "*")),
        _specificity(policy.get("action_pattern", "*")),
        _ROLE_STRICTNESS.get(policy.get("required_role", "OPERATOR"), 1),
        # Final deterministic tiebreak on id
        policy.get("policy_id", ""),
    )


def _normalize_mode(policy: Dict[str, Any]) -> str:
    """Policies today don't carry a `mode` column — that's a v2 addition
    tracked in the schema. Until the frontend exposes it, `active`
    policies are treated as `require_approval` and inactive as
    `auto_approve`. When the column ships, it takes precedence.
    """
    if "mode" in policy:
        val = str(policy["mode"]).strip().lower()
        if val in _STRICTNESS:
            return val
    # No explicit mode → the existence of an active matching policy IS
    # the "require approval" signal, matching the UI copy in the
    # Approval Policies wizard.
    return MODE_REQUIRE_APPROVAL


# ─── Public API ─────────────────────────────────────────────────────────


def evaluate(kind: str, resource_id: str, action: str) -> PolicyVerdict:
    """Return the winning verdict for (kind, resource_id, action).

    - kind: 'mcp', 'a2a', 'harness', 'memory', 'identity', 'application', 'registry_record'
    - resource_id: opaque string per-kind; matched against `resource_pattern` glob
    - action: 'register', 'deploy', 'delete', 'invoke', 'update', etc.

    If no active policy matches → auto_approve. If multiple match, the
    priority rules above pick one; the others are shadowed but recorded
    in the snapshot for audit if the caller wants them (we don't return
    them in v1 to keep the shape simple).
    """
    policies = _load_active_policies()
    matches: List[Dict[str, Any]] = []
    for p in policies:
        rk = str(p.get("resource_kind") or "*")
        if rk not in ("*", kind):
            continue
        rp = str(p.get("resource_pattern") or "*")
        if not fnmatch.fnmatchcase(resource_id, rp):
            continue
        ap = str(p.get("action_pattern") or "*")
        if not fnmatch.fnmatchcase(action, ap):
            continue
        matches.append(p)

    if not matches:
        return PolicyVerdict(mode=MODE_AUTO_APPROVE)

    # Highest score wins. `sorted(..., reverse=True)[0]` reads clearest.
    winner = sorted(matches, key=_score, reverse=True)[0]
    return PolicyVerdict(
        mode=_normalize_mode(winner),
        policy_id=str(winner.get("policy_id", "")),
        policy_name=str(winner.get("name", "")),
        required_role=str(winner.get("required_role") or "OPERATOR"),
        quorum=int(winner.get("quorum") or 1),
        sla_hours=int(winner.get("sla_hours") or 24),
        reason=str(winner.get("description") or ""),
        snapshot=dict(winner),
    )
