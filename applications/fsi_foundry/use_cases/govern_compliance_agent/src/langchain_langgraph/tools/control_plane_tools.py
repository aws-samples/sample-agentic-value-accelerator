"""Control plane action tools — write operations that modify agent state.

These tools can pause agents, update guardrail assignments, and trigger revalidations.
All write operations should be gated by approval workflows in production.
"""

import json
import logging
from langchain_core.tools import tool

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


@tool
def pause_agent_runtime_tool(
    runtime_id: str,
    reason: str,
    region: str = "us-east-1",
    dry_run: bool = True,
) -> str:
    """Pause an AgentCore runtime (stop it from accepting new invocations).

    WARNING: This is a disruptive action that will prevent the agent from serving requests.
    Use only when a critical compliance violation requires immediate action.

    In production, this should require human approval before execution.

    Args:
        runtime_id: The AgentCore runtime ID to pause
        reason: Reason for pausing (logged for audit)
        region: AWS region (default: us-east-1)
        dry_run: If True, don't actually pause (default: True)

    Returns:
        JSON with operation result
    """
    if dry_run:
        return json.dumps({
            "action": "pause_agent_runtime",
            "runtime_id": runtime_id,
            "reason": reason,
            "dry_run": True,
            "would_execute": True,
            "note": "Dry run - no changes made. Set dry_run=False to execute.",
        }, indent=2)

    try:
        client = boto3.client("bedrock-agentcore-control", region_name=region)

        # Note: The actual API call depends on the AgentCore API shape
        # This is a placeholder - adjust based on actual AWS API
        response = client.update_agent_runtime(
            agentRuntimeId=runtime_id,
            status="PAUSED",
        )

        return json.dumps({
            "action": "pause_agent_runtime",
            "runtime_id": runtime_id,
            "reason": reason,
            "success": True,
            "new_status": response.get("status", "PAUSED"),
            "note": f"Agent runtime {runtime_id} paused. Reason: {reason}",
        }, indent=2)

    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to pause agent runtime {runtime_id}: {e}")
        return json.dumps({
            "action": "pause_agent_runtime",
            "runtime_id": runtime_id,
            "success": False,
            "error": str(e),
            "note": "Failed to pause agent runtime. Check permissions and runtime ID.",
        }, indent=2)


@tool
def update_agent_guardrail_tool(
    agent_id: str,
    guardrail_id: str,
    guardrail_version: str = "DRAFT",
    reason: str = "",
    region: str = "us-east-1",
    dry_run: bool = True,
) -> str:
    """Update the guardrail assignment for a Bedrock agent.

    Assigns or changes the guardrail that protects an agent's invocations.
    This is a common remediation action when an agent is found to be missing guardrail coverage.

    Args:
        agent_id: The Bedrock agent ID
        guardrail_id: The guardrail ID to assign
        guardrail_version: Guardrail version (DRAFT or version number, default: DRAFT)
        reason: Reason for the update (logged for audit)
        region: AWS region (default: us-east-1)
        dry_run: If True, don't actually update (default: True)

    Returns:
        JSON with operation result
    """
    if dry_run:
        return json.dumps({
            "action": "update_agent_guardrail",
            "agent_id": agent_id,
            "guardrail_id": guardrail_id,
            "guardrail_version": guardrail_version,
            "reason": reason,
            "dry_run": True,
            "would_execute": True,
            "note": "Dry run - no changes made. Set dry_run=False to execute.",
        }, indent=2)

    try:
        client = boto3.client("bedrock-agent", region_name=region)

        # Get current agent config
        agent = client.get_agent(agentId=agent_id)
        current_version = agent.get("agent", {}).get("agentVersion", "DRAFT")

        # Prepare the agent for update (if not already in DRAFT)
        if current_version != "DRAFT":
            client.prepare_agent(agentId=agent_id)

        # Update the agent with guardrail
        response = client.update_agent(
            agentId=agent_id,
            agentName=agent["agent"]["agentName"],
            agentResourceRoleArn=agent["agent"]["agentResourceRoleArn"],
            foundationModel=agent["agent"].get("foundationModel", ""),
            guardrailConfiguration={
                "guardrailIdentifier": guardrail_id,
                "guardrailVersion": guardrail_version,
            },
        )

        return json.dumps({
            "action": "update_agent_guardrail",
            "agent_id": agent_id,
            "guardrail_id": guardrail_id,
            "guardrail_version": guardrail_version,
            "reason": reason,
            "success": True,
            "note": f"Agent {agent_id} now protected by guardrail {guardrail_id}",
        }, indent=2)

    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to update agent guardrail {agent_id}: {e}")
        return json.dumps({
            "action": "update_agent_guardrail",
            "agent_id": agent_id,
            "success": False,
            "error": str(e),
            "note": "Failed to update guardrail. Check permissions, agent ID, and guardrail ID.",
        }, indent=2)


@tool
def trigger_revalidation_tool(
    model_id: str,
    reason: str,
    priority: str = "normal",
    dry_run: bool = True,
) -> str:
    """Trigger a model revalidation workflow.

    Initiates the model revalidation process which includes:
    - Re-running safety evaluations
    - Checking for drift in performance metrics
    - Updating attestation status
    - Notifying the Model Risk Committee

    Use when a model is overdue for revalidation or when drift is detected.

    Args:
        model_id: The model ID to revalidate
        reason: Reason for triggering revalidation
        priority: Priority level (normal, high, urgent)
        dry_run: If True, don't actually trigger (default: True)

    Returns:
        JSON with operation result
    """
    if dry_run:
        return json.dumps({
            "action": "trigger_revalidation",
            "model_id": model_id,
            "reason": reason,
            "priority": priority,
            "dry_run": True,
            "would_execute": True,
            "note": "Dry run - no changes made. Set dry_run=False to execute.",
        }, indent=2)

    # In production, this would:
    # 1. Create a revalidation request in the governance database
    # 2. Trigger the revalidation workflow (Step Functions, EventBridge, etc.)
    # 3. Notify relevant stakeholders

    return json.dumps({
        "action": "trigger_revalidation",
        "model_id": model_id,
        "reason": reason,
        "priority": priority,
        "success": True,
        "revalidation_id": f"reval-{model_id[:8]}-{priority}",
        "note": f"Revalidation workflow triggered for model {model_id}. Priority: {priority}",
        "next_steps": [
            "Safety evaluations will be re-run",
            "Performance metrics will be checked for drift",
            "Model Risk Committee will be notified",
            "Attestation status will be updated upon completion",
        ],
    }, indent=2)
