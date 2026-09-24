"""Enforcement tools — policy evaluation and management.

Wraps GovernEnforcementService for use as LangChain tools.
Includes both read-only (evaluate, list) and write (create policy) operations.
"""

import json
from langchain_core.tools import tool

from models.govern_enforcement import (
    ActionType,
    EnforcementMode,
    EnforcementPolicyCreate,
    EnforcementRequest,
    EnforcementRule,
    Disposition,
    RiskTier,
)


def _get_service():
    """Get enforcement service (lazy import to avoid circular deps)."""
    # In production, this would be injected or use a service locator
    # For now, we'll import from the control plane
    from services.govern_enforcement_service import GovernEnforcementService
    from services.govern_audit_service import GovernAuditService
    import os

    table_name = os.getenv("GOVERN_TABLE_NAME", "ava-govern-dev")
    region = os.getenv("AWS_REGION", "us-east-1")
    audit_svc = GovernAuditService(table_name=table_name, region=region)
    return GovernEnforcementService(table_name=table_name, audit_service=audit_svc, region=region)


@tool
def evaluate_enforcement_tool(
    agent_id: str,
    action_type: str,
    tool_name: str,
    risk_tier: str = "medium",
    scope_level: int = 2,
    dry_run: bool = True,
) -> str:
    """Evaluate whether an action is allowed by enforcement policies.

    Checks the autonomy ladder and explicit policies to determine if an agent
    action would be ALLOW, PAUSE (requires human approval), or DENY.

    Precedence: explicit DENY > tool-requires-approval > autonomy-ladder gate > explicit ALLOW > default (pause)

    Args:
        agent_id: ID of the agent performing the action
        action_type: Type of action (read, write, execute, external, admin)
        tool_name: Name of the tool being used
        risk_tier: Risk level (low, medium, high, critical)
        scope_level: Autonomy scope level (1-4)
        dry_run: If True, don't persist the decision (default: True)

    Returns:
        JSON with disposition (allow/pause/deny), reason, and matched policy
    """
    svc = _get_service()

    # Map string to enum
    action_map = {
        "read": ActionType.READ,
        "write": ActionType.WRITE,
        "execute": ActionType.EXECUTE,
        "external": ActionType.EXTERNAL,
        "admin": ActionType.ADMIN,
    }
    risk_map = {
        "low": RiskTier.LOW,
        "medium": RiskTier.MEDIUM,
        "high": RiskTier.HIGH,
        "critical": RiskTier.CRITICAL,
    }

    req = EnforcementRequest(
        agent_id=agent_id,
        scope_level=scope_level,
        action_type=action_map.get(action_type, ActionType.READ),
        tool=tool_name,
        risk_tier=risk_map.get(risk_tier, RiskTier.MEDIUM),
        source_principal="govern_compliance_agent",
    )

    decision = svc.evaluate(req, mode=EnforcementMode.ADVISORY, dry_run=dry_run)

    return json.dumps({
        "disposition": decision.disposition.value,
        "reason": decision.reason,
        "matched_by": decision.matched_by,
        "agent_id": decision.agent_id,
        "action_type": decision.action_type,
        "tool": decision.tool,
        "risk_tier": decision.risk_tier,
        "scope_level": decision.scope_level,
        "decision_id": decision.id,
    }, indent=2)


@tool
def list_policies_tool() -> str:
    """List all enforcement policies.

    Returns all configured enforcement policies with their rules.
    Policies can explicitly ALLOW or DENY specific actions for agents.

    Returns:
        JSON with list of policies and their rules
    """
    svc = _get_service()
    policies = svc.list_policies()

    return json.dumps({
        "policies": [
            {
                "policy_id": p.policy_id,
                "name": p.name,
                "description": p.description,
                "enabled": p.enabled,
                "rules": [
                    {
                        "agent_id": r.agent_id,
                        "action_type": r.action_type,
                        "tool": r.tool,
                        "risk_tier": r.risk_tier,
                        "effect": r.effect.value,
                        "reason": r.reason,
                    }
                    for r in p.rules
                ],
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in policies
        ],
        "total": len(policies),
    }, indent=2)


@tool
def create_policy_tool(
    name: str,
    description: str,
    agent_id: str,
    action_type: str,
    effect: str,
    reason: str,
    tool_name: str = None,
    risk_tier: str = None,
) -> str:
    """Create a new enforcement policy.

    WARNING: This is a write operation that affects agent behavior.
    Use with caution and ensure proper approval before execution.

    Creates a policy with a single rule. For complex policies with multiple
    rules, call this tool multiple times or use the control plane UI.

    Args:
        name: Human-readable policy name
        description: Policy description
        agent_id: Agent ID this policy applies to (or "*" for all)
        action_type: Action type to match (invoke_model, use_tool, etc.)
        effect: Policy effect (allow or deny)
        reason: Reason for this policy rule
        tool_name: Optional tool name to match
        risk_tier: Optional risk tier to match (low, medium, high, critical)

    Returns:
        JSON with created policy details
    """
    svc = _get_service()

    effect_map = {
        "allow": Disposition.ALLOW,
        "deny": Disposition.DENY,
        "pause": Disposition.PAUSE,
    }

    rule = EnforcementRule(
        agent_id=agent_id if agent_id != "*" else None,
        action_type=action_type,
        tool=tool_name,
        risk_tier=risk_tier,
        effect=effect_map.get(effect.lower(), Disposition.DENY),
        reason=reason,
    )

    policy_create = EnforcementPolicyCreate(
        name=name,
        description=description,
        rules=[rule],
        enabled=True,
    )

    policy = svc.create_policy(policy_create)

    return json.dumps({
        "success": True,
        "policy_id": policy.policy_id,
        "name": policy.name,
        "description": policy.description,
        "rules_count": len(policy.rules),
        "note": "Policy created and active. Agents are now subject to this enforcement rule.",
    }, indent=2)
