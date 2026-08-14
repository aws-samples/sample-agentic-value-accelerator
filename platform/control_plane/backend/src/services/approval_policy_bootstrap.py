"""Seed default Approval Policies at backend startup.

These defaults are what turns Approval Policies from "UI-only" into
"operational" — every AVA-agent-registry mutating action gets a rule
that routes it through the Approval Queue. Operators can edit or
disable individually via the Secure → Approval Policies page; the
defaults are only seeded on first-run (idempotent by name).

Seed rules (revised — Agent gated, personal-workspace deletes ungated):
  * MCP register     → OPERATOR approval, 24h SLA — cross-team callable
  * A2A register     → OPERATOR approval, 24h SLA — cross-team delegable
  * Agent register   → OPERATOR approval, 24h SLA — highest blast radius
                        of the four record types (autonomous peers)
  * Skills register  → OPERATOR approval, 48h SLA — low blast radius,
                        review is a prompt-injection guard
  * Custom register  → OPERATOR approval, 24h SLA — no schema to validate
  * Identity register → ADMIN approval, 24h SLA — changes who can auth
  * Application delete → ADMIN approval, 4h SLA — removes live infra
  * Harness delete   → NOT gated (personal workspace, UI confirm suffices)
  * Memory delete    → NOT gated (personal workspace, UI confirm suffices)
  * Everything else  → no policy → auto_approve (evaluator default)

Idempotency: keyed on `name` (which is user-visible and unique per
default). A scan-then-put pattern is fine at expected volume (<100
policies per environment); we DON'T update existing rows because
operators may have tuned the seeded defaults after first run.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)


# ─── Default policy set ────────────────────────────────────────────────
# Each entry is a partial row — the DDB writer fills in id + timestamps +
# `mode="require_approval"` (explicit even though the evaluator defaults
# active policies to that mode; makes audit trails unambiguous).

_DEFAULTS: List[Dict[str, Any]] = [
    # ─── MCP Servers registration ────────────────────────────────────
    {
        "name": "AVA Default: MCP register requires OPERATOR",
        "description": "Every MCP server registration routes to the Approval Queue for operator sign-off before the record becomes discoverable in the AVA registry.",
        "resource_kind": "mcp",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": 24,
    },
    # ─── A2A Servers registration ────────────────────────────────────
    {
        "name": "AVA Default: A2A register requires OPERATOR",
        "description": "Every A2A server registration routes to the Approval Queue for operator sign-off before the record becomes discoverable in the AVA registry.",
        "resource_kind": "a2a",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": 24,
    },
    # ─── Skills registration ─────────────────────────────────────────
    # Lower blast radius than MCP/A2A (skills are procedural knowledge,
    # not endpoint access) — review is primarily a prompt-injection
    # guard, so the SLA is looser (48h vs. 24h).
    {
        "name": "AVA Default: Skills register requires OPERATOR",
        "description": "Every Skill published to the AVA registry routes to the Approval Queue for operator sign-off. Primary check is that the skill text doesn't carry prompt-injection payloads — 48h SLA reflects the lower urgency vs. MCP/A2A.",
        "resource_kind": "skill",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": 48,
    },
    # ─── Custom Resources registration ───────────────────────────────
    {
        "name": "AVA Default: Custom Resource register requires OPERATOR",
        "description": "Every Custom Resource published to the AVA registry routes to the Approval Queue for operator sign-off. Since custom resources carry free-form metadata, review is essential.",
        "resource_kind": "custom",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": 24,
    },
    # ─── Agent registration ──────────────────────────────────────────
    # Agents are the HIGHEST-blast-radius registry record type — a
    # rogue agent gets delegated to and runs autonomous logic.
    # Treated as strictly as MCP/A2A (OPERATOR, 24h). Flip to
    # auto_approve only if your org has other governance rails around
    # agent registration (SDLC pipeline gates, mandatory tag audit, etc).
    {
        "name": "AVA Default: Agent register requires OPERATOR",
        "description": "Agents are autonomous peers other agents can delegate to — the highest-blast-radius record type. Registration routes to the Approval Queue for operator sign-off.",
        "resource_kind": "agent",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": 24,
    },
    # ─── Destructive control-plane actions require ADMIN ─────────────
    {
        "name": "AVA Default: Application delete requires ADMIN",
        "description": "Deleting a deployed application removes live infrastructure — requires ADMIN sign-off with a tight 4h SLA to force timely review.",
        "resource_kind": "application",
        "resource_pattern": "*",
        "action_pattern": "delete",
        "required_role": "ADMIN",
        "quorum": 1,
        "sla_hours": 4,
    },
    # Harness/Memory delete are NOT gated: they're personal-workspace
    # resources (not cross-team consumed), so ADMIN sign-off for a
    # personal cleanup is bureaucracy without security payoff. The
    # frontend's window.confirm on the Delete button is sufficient.
    # Re-add via the Approval Policies UI if your org needs it.

    # ─── Application deploy — auto-approve with audit trail ─────────
    # Foundry / reference-app deploys create an Approval Queue row for
    # audit but never block: the row starts APPROVED immediately (via
    # the auto_approve mode). Operators can flip this to
    # require_approval if their org wants gated deploys — no code
    # change, only edit the policy in the UI.
    {
        "name": "AVA Default: Application deploy auto-approves",
        "description": "FSI Foundry / Reference-app deploys create a pre-approved Approval Queue row for audit. On successful deploy the app also auto-publishes as an AGENT record in the AVA registry with status=APPROVED so it becomes discoverable immediately. Flip to require_approval if your org needs gated deploys.",
        "resource_kind": "application",
        "resource_pattern": "*",
        "action_pattern": "deploy",
        "mode": "auto_approve",
        "required_role": "OPERATOR",  # unused when mode=auto_approve
        "quorum": 1,
        "sla_hours": 24,
    },
    # ─── Identity providers — high blast radius ──────────────────────
    {
        "name": "AVA Default: Identity provider register requires ADMIN",
        "description": "Registering a new IdP changes how users authenticate into AVA — requires ADMIN sign-off.",
        "resource_kind": "identity",
        "resource_pattern": "*",
        "action_pattern": "register",
        "required_role": "ADMIN",
        "quorum": 1,
        "sla_hours": 24,
    },
]


def seed_defaults() -> Dict[str, Any]:
    """Insert every default that isn't already present (by `name`).

    Returns a small summary dict so a startup log line can show the
    result. Never raises — bootstrap MUST NOT block backend startup.
    """
    if not settings.APPROVAL_POLICIES_TABLE_NAME:
        logger.info("approval_policy_bootstrap: table name empty, skipping seed")
        return {"seeded": 0, "existing": 0, "skipped": True}
    try:
        ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.APPROVAL_POLICIES_TABLE_NAME
        )
        # Find existing default names in one scan — cheap.
        existing_names = set()
        try:
            resp = ddb.scan()
            for p in resp.get("Items") or []:
                existing_names.add(str(p.get("name") or ""))
        except ClientError as e:
            logger.warning(f"approval_policy_bootstrap: scan failed: {e}")
            return {"seeded": 0, "existing": 0, "error": str(e)}

        now = datetime.now(timezone.utc).isoformat()
        seeded = 0
        for spec in _DEFAULTS:
            if spec["name"] in existing_names:
                continue
            row = {
                "policy_id": str(uuid.uuid4()),
                "name": spec["name"],
                "description": spec["description"],
                "resource_kind": spec["resource_kind"],
                "resource_pattern": spec["resource_pattern"],
                "action_pattern": spec["action_pattern"],
                "required_role": spec["required_role"],
                "quorum": spec["quorum"],
                "sla_hours": spec["sla_hours"],
                # Explicit mode + status so the evaluator picks these up
                # deterministically. Per-spec `mode` overrides the default
                # (only the Agents seed uses `auto_approve` today).
                "mode": spec.get("mode", "require_approval"),
                "status": "active",
                # Provenance — operators can filter to "system-seeded"
                # policies in the UI and reset them if a default drifts.
                "source": "ava-bootstrap",
                "created_at": now,
                "updated_at": now,
            }
            try:
                ddb.put_item(Item=row)
                seeded += 1
            except ClientError as e:
                logger.warning(f"approval_policy_bootstrap: put_item failed for '{spec['name']}': {e}")

        logger.info(
            f"approval_policy_bootstrap: seeded={seeded} existing={len(existing_names)} defaults={len(_DEFAULTS)}"
        )
        return {"seeded": seeded, "existing": len(existing_names), "defaults": len(_DEFAULTS)}
    except Exception as e:
        # Never let bootstrap crash the app. Log and continue.
        logger.exception(f"approval_policy_bootstrap: unhandled: {e}")
        return {"seeded": 0, "error": str(e)}
