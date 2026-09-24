"""
Govern Tools for Strands Agents.

Tools for accessing Govern services (agents, guardrails, enforcement, security)
from Strands agent implementations.
"""

import json
import os
from strands.tools.decorator import tool
import structlog

logger = structlog.get_logger()


def _get_region():
    return os.getenv("AWS_REGION", "us-east-1")


def _get_table_name():
    return os.getenv("GOVERN_TABLE_NAME", "ava-govern-dev")


# =============================================================================
# Read-only discovery tools
# =============================================================================

@tool
def list_agents_tool(include_runtimes: bool = True, region: str = "") -> str:
    """
    List all agents (Bedrock agents and AgentCore runtimes).

    Returns agent metadata including guardrail assignments and autonomy tiers.

    Args:
        include_runtimes: Include AgentCore runtimes (default: True)
        region: AWS region (default: us-east-1)

    Returns:
        JSON with list of agents, their guardrails, and autonomy tiers
    """
    from services.govern_agentcore_service import GovernAgentCoreService

    region = region or _get_region()
    svc = GovernAgentCoreService(region=region, table_name=_get_table_name())

    try:
        result = svc.discover_agents()
        return json.dumps({
            "agents": [a.model_dump() for a in result.agents],
            "total_bedrock_agents": result.total_bedrock_agents,
            "total_agentcore_runtimes": result.total_agentcore_runtimes,
            "live": result.live,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("list_agents_error", error=str(e))
        return json.dumps({"error": str(e)})


@tool
def list_guardrails_tool(days: int = 30, region: str = "") -> str:
    """
    List all Bedrock guardrails with telemetry data.

    Returns guardrails with invocation counts and intervention rates.

    Args:
        days: Number of days of telemetry to include (default: 30)
        region: AWS region (default: us-east-1)

    Returns:
        JSON with guardrail list, telemetry, and counts
    """
    from services.govern_guardrails_service import GovernGuardrailsService

    region = region or _get_region()
    svc = GovernGuardrailsService(region=region)

    try:
        result = svc.get_telemetry(days=days)
        return json.dumps({
            "guardrails": [g.model_dump() for g in result.guardrails],
            "total_guardrails": result.total_guardrails,
            "total_invocations": result.total_invocations,
            "total_interventions": result.total_interventions,
            "window_days": result.window_days,
            "live": result.live,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("list_guardrails_error", error=str(e))
        return json.dumps({"error": str(e)})


@tool
def list_models_tool(region: str = "") -> str:
    """
    List all models in the Model Inventory with governance metadata.

    Returns models with revalidation status, provenance, and metrics.

    Args:
        region: AWS region (default: us-east-1)

    Returns:
        JSON with model list and governance metadata
    """
    from services.govern_model_inventory_service import GovernModelInventoryService

    region = region or _get_region()
    svc = GovernModelInventoryService(region=region, table_name=_get_table_name())

    try:
        result = svc.list_models()
        return json.dumps({
            "models": [m.model_dump() for m in result.models],
            "total_models": result.total_models,
            "live": result.live,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("list_models_error", error=str(e))
        return json.dumps({"error": str(e)})


# =============================================================================
# Security tools
# =============================================================================

@tool
def list_guardduty_findings_tool(severity_filter: str = "all", days: int = 30, region: str = "") -> str:
    """
    List GuardDuty findings related to AI workloads.

    Filters for findings affecting Bedrock, SageMaker, and AgentCore resources.

    Args:
        severity_filter: Filter by severity (all, high, critical). Default: all
        days: Number of days to look back. Default: 30
        region: AWS region (default: us-east-1)

    Returns:
        JSON with findings list and counts by severity
    """
    from services.govern_guardduty_ai_service import GovernGuardDutyAIService

    region = region or _get_region()
    svc = GovernGuardDutyAIService(region=region)

    try:
        result = svc.list_findings(days=days)
        findings = result.findings

        if severity_filter == "critical":
            findings = [f for f in findings if f.severity >= 8.0]
        elif severity_filter == "high":
            findings = [f for f in findings if f.severity >= 7.0]

        return json.dumps({
            "findings": [f.model_dump() for f in findings],
            "total_findings": len(findings),
            "counts_by_severity": result.counts_by_severity,
            "live": result.live,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("guardduty_error", error=str(e))
        return json.dumps({"error": str(e)})


@tool
def list_securityhub_findings_tool(severity_filter: str = "all", days: int = 30, region: str = "") -> str:
    """
    List Security Hub findings related to AI resources.

    Filters for compliance findings affecting AI workloads.

    Args:
        severity_filter: Filter by severity (all, high, critical). Default: all
        days: Number of days to look back. Default: 30
        region: AWS region (default: us-east-1)

    Returns:
        JSON with findings list and counts
    """
    from services.govern_securityhub_ai_service import GovernSecurityHubAIService

    region = region or _get_region()
    svc = GovernSecurityHubAIService(region=region)

    try:
        result = svc.list_ai_findings(days=days)
        findings = result.findings

        if severity_filter == "critical":
            findings = [f for f in findings if f.severity == "CRITICAL"]
        elif severity_filter == "high":
            findings = [f for f in findings if f.severity in ("CRITICAL", "HIGH")]

        return json.dumps({
            "findings": [f.model_dump() for f in findings],
            "total_findings": len(findings),
            "live": result.live,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("securityhub_error", error=str(e))
        return json.dumps({"error": str(e)})


# =============================================================================
# Enforcement tools
# =============================================================================

@tool
def evaluate_enforcement_tool(
    agent_id: str,
    action_type: str,
    tool_name: str,
    risk_tier: str = "medium",
    scope_level: int = 2,
) -> str:
    """
    Evaluate whether an action is allowed by enforcement policies.

    Checks the autonomy ladder and explicit policies to determine if an agent
    action would be ALLOW, PAUSE (requires human approval), or DENY.

    Args:
        agent_id: ID of the agent performing the action
        action_type: Type of action (read, write, execute, external, admin)
        tool_name: Name of the tool being used
        risk_tier: Risk level (low, medium, high, critical)
        scope_level: Autonomy scope level (1-4)

    Returns:
        JSON with disposition (allow/pause/deny), reason, and matched policy
    """
    from services.govern_enforcement_service import GovernEnforcementService
    from services.govern_audit_service import GovernAuditService
    from models.govern_enforcement import (
        ActionType, EnforcementMode, EnforcementRequest, RiskTier
    )

    table_name = _get_table_name()
    region = _get_region()
    audit_svc = GovernAuditService(table_name=table_name, region=region)
    svc = GovernEnforcementService(table_name=table_name, audit_service=audit_svc, region=region)

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

    try:
        req = EnforcementRequest(
            agent_id=agent_id,
            scope_level=scope_level,
            action_type=action_map.get(action_type, ActionType.READ),
            tool=tool_name,
            risk_tier=risk_map.get(risk_tier, RiskTier.MEDIUM),
            source_principal="govern_compliance_agent",
        )
        decision = svc.evaluate(req, mode=EnforcementMode.ADVISORY, dry_run=True)

        return json.dumps({
            "disposition": decision.disposition.value,
            "reason": decision.reason,
            "matched_by": decision.matched_by,
            "agent_id": decision.agent_id,
        }, indent=2)
    except Exception as e:
        logger.error("enforcement_error", error=str(e))
        return json.dumps({"error": str(e)})


# =============================================================================
# Write/remediation tools (require approval gates in orchestrator)
# =============================================================================

@tool
def assign_guardrail_tool(agent_id: str, guardrail_id: str, dry_run: bool = True) -> str:
    """
    Assign a guardrail to an agent.

    WARNING: This modifies agent configuration. Use dry_run=True to preview.

    Args:
        agent_id: The agent to update
        guardrail_id: The guardrail to assign
        dry_run: If True, only preview the change (default: True)

    Returns:
        JSON with result of the assignment
    """
    if dry_run:
        return json.dumps({
            "action": "assign_guardrail",
            "agent_id": agent_id,
            "guardrail_id": guardrail_id,
            "dry_run": True,
            "status": "would_execute",
            "note": "Set dry_run=False to execute",
        }, indent=2)

    from services.govern_agentcore_service import GovernAgentCoreService

    svc = GovernAgentCoreService(region=_get_region(), table_name=_get_table_name())

    try:
        result = svc.assign_guardrail(agent_id=agent_id, guardrail_id=guardrail_id)
        return json.dumps({
            "action": "assign_guardrail",
            "agent_id": agent_id,
            "guardrail_id": guardrail_id,
            "dry_run": False,
            "status": "executed",
            "result": result,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("assign_guardrail_error", error=str(e))
        return json.dumps({"error": str(e), "action": "assign_guardrail"})


@tool
def create_policy_tool(
    name: str,
    description: str,
    agent_id: str,
    action_type: str,
    effect: str,
    reason: str,
    dry_run: bool = True,
) -> str:
    """
    Create a new enforcement policy.

    WARNING: This creates a new policy that affects agent behavior.
    Requires human approval in production.

    Args:
        name: Human-readable policy name
        description: Policy description
        agent_id: Agent ID this policy applies to (or "*" for all)
        action_type: Action type to match
        effect: Policy effect (allow, deny, pause)
        reason: Reason for this policy rule
        dry_run: If True, only preview the policy (default: True)

    Returns:
        JSON with created policy details
    """
    if dry_run:
        return json.dumps({
            "action": "create_policy",
            "name": name,
            "description": description,
            "agent_id": agent_id,
            "effect": effect,
            "dry_run": True,
            "status": "would_execute",
            "note": "Set dry_run=False to execute",
        }, indent=2)

    from services.govern_enforcement_service import GovernEnforcementService
    from services.govern_audit_service import GovernAuditService
    from models.govern_enforcement import (
        EnforcementPolicyCreate, EnforcementRule, Disposition
    )

    table_name = _get_table_name()
    region = _get_region()
    audit_svc = GovernAuditService(table_name=table_name, region=region)
    svc = GovernEnforcementService(table_name=table_name, audit_service=audit_svc, region=region)

    effect_map = {
        "allow": Disposition.ALLOW,
        "deny": Disposition.DENY,
        "pause": Disposition.PAUSE,
    }

    try:
        rule = EnforcementRule(
            agent_id=agent_id if agent_id != "*" else None,
            action_type=action_type,
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
            "action": "create_policy",
            "policy_id": policy.policy_id,
            "name": policy.name,
            "dry_run": False,
            "status": "executed",
        }, indent=2)
    except Exception as e:
        logger.error("create_policy_error", error=str(e))
        return json.dumps({"error": str(e), "action": "create_policy"})


@tool
def update_autonomy_tool(
    agent_id: str,
    new_tier: int,
    reason: str,
    dry_run: bool = True,
) -> str:
    """
    Update an agent's autonomy tier.

    WARNING: This changes agent permissions. Increases require human approval.

    Args:
        agent_id: The agent to update
        new_tier: New autonomy tier (1-4)
        reason: Justification for the change
        dry_run: If True, only preview the change (default: True)

    Returns:
        JSON with result of the update
    """
    if dry_run:
        return json.dumps({
            "action": "update_autonomy",
            "agent_id": agent_id,
            "new_tier": new_tier,
            "reason": reason,
            "dry_run": True,
            "status": "would_execute",
            "note": "Set dry_run=False to execute",
        }, indent=2)

    from services.govern_agentcore_service import GovernAgentCoreService

    svc = GovernAgentCoreService(region=_get_region(), table_name=_get_table_name())

    try:
        result = svc.update_autonomy_tier(agent_id=agent_id, new_tier=new_tier, reason=reason)
        return json.dumps({
            "action": "update_autonomy",
            "agent_id": agent_id,
            "new_tier": new_tier,
            "dry_run": False,
            "status": "executed",
            "result": result,
        }, indent=2, default=str)
    except Exception as e:
        logger.error("update_autonomy_error", error=str(e))
        return json.dumps({"error": str(e), "action": "update_autonomy"})
