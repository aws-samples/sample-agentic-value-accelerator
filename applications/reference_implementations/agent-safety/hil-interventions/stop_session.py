"""
StopSession Lambda — Stops an AgentCore Runtime session.

Human-only: All interventions require a human operator.
No automated circuit breakers — signals route to the dashboard,
the human reviews and decides.

Can be triggered by:
  - Dashboard API (human-in-the-loop)
  - CLI (manual intervention)

Every stop action is logged to the intervention-log DynamoDB table
with the reason, who triggered it, and full context.

Environment variables:
  - REGION: AWS region (default: us-east-1)
  - INTERVENTION_TABLE: DynamoDB table name (default: intervention-log)
  - REGISTRY_TABLE: DynamoDB table name (default: agent-registry)
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION", "us-east-1")
INTERVENTION_TABLE = os.environ.get("INTERVENTION_TABLE", "intervention-log")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "agent-registry")

agentcore = boto3.client("bedrock-agentcore", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
intervention_table = dynamodb.Table(INTERVENTION_TABLE)
registry_table = dynamodb.Table(REGISTRY_TABLE)


def _log_intervention(
    agent_arn: str,
    session_id: str,
    action: str,
    triggered_by: str,
    reason: str,
    admin_user: str = "",
    alert_id: str = "",
    extra: dict | None = None,
) -> str:
    """Write an entry to the intervention-log table."""
    intervention_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "intervention_id": intervention_id,
        "timestamp": now,
        "agent_runtime_arn": agent_arn,
        "agent_name": agent_arn.split("/")[-1] if "/" in agent_arn else agent_arn,
        "session_id": session_id,
        "action": action,
        "triggered_by": triggered_by,  # "auto" | "human"
        "reason": reason,
        "admin_user": admin_user,
        "alert_id": alert_id,
        "rollback_status": "none",
        "extra": extra or {},
    }

    intervention_table.put_item(Item=item)
    logger.info(f"Intervention logged: {intervention_id} | {action} | {session_id}")
    return intervention_id


def _resolve_agent_arn(agent_name: str) -> str | None:
    """Look up agent ARN from registry by name."""
    response = registry_table.get_item(Key={"agent_name": agent_name})
    item = response.get("Item")
    return item["agent_runtime_arn"] if item else None


def stop_session(
    agent_runtime_arn: str,
    session_id: str,
    reason: str,
    triggered_by: str = "human",
    admin_user: str = "",
    alert_id: str = "",
) -> dict:
    """
    Stop an AgentCore Runtime session and log the intervention.

    Args:
        agent_runtime_arn: ARN of the agent runtime.
        session_id: ID of the session to stop.
        reason: Why the session is being stopped (required).
        triggered_by: "auto" for circuit breakers, "human" for HIL.
        admin_user: Username of the admin (for HIL actions).
        alert_id: ID of the alert that triggered this (for auto actions).

    Returns:
        dict with intervention_id and status.
    """
    # Generate idempotency token from session_id to prevent duplicate stops
    client_token = f"stop-{session_id}-{uuid.uuid5(uuid.NAMESPACE_DNS, session_id)}"

    try:
        response = agentcore.stop_runtime_session(
            agentRuntimeArn=agent_runtime_arn,
            runtimeSessionId=session_id,
            clientToken=client_token,
        )

        intervention_id = _log_intervention(
            agent_arn=agent_runtime_arn,
            session_id=session_id,
            action="stop_session",
            triggered_by=triggered_by,
            reason=reason,
            admin_user=admin_user,
            alert_id=alert_id,
        )

        logger.info(f"Session stopped: {session_id} | Reason: {reason}")

        return {
            "status": "stopped",
            "session_id": session_id,
            "intervention_id": intervention_id,
            "http_status": response.get("statusCode", 200),
        }

    except ClientError as e:
        error_code = e.response["Error"]["Code"]

        if error_code == "ResourceNotFoundException":
            logger.warning(f"Session not found (may have already ended): {session_id}")
            return {"status": "not_found", "session_id": session_id}

        if error_code == "ConflictException":
            logger.warning(f"Session already being stopped: {session_id}")
            return {"status": "already_stopping", "session_id": session_id}

        logger.error(f"Failed to stop session {session_id}: {e}")
        raise


def handler(event: dict, context) -> dict:
    """
    Lambda handler — triggered by Dashboard API or API Gateway.

    All interventions are human-initiated. Automated circuit breakers
    are not enabled — alerts route to the dashboard for human review.

    Dashboard API event format:
    {
        "detail": {
            "agentRuntimeArn": "arn:...",   # or "agentName": "loan-processor"
            "sessionId": "sess-abc123",
            "reason": "Admin observed abnormal behavior",  # REQUIRED
            "adminUser": "jane.doe@company.com"            # REQUIRED
        }
    }
    """
    detail = event.get("detail", {})

    agent_arn = detail.get("agentRuntimeArn", "")
    session_id = detail.get("sessionId", "")
    reason = detail.get("reason", "")
    admin_user = detail.get("adminUser", "")

    # Reason and admin user are mandatory for human interventions
    if not reason:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "reason is required — explain why you are stopping this session"}),
        }

    if not admin_user:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "adminUser is required — identify who is taking this action"}),
        }

    # If agent name provided instead of ARN, resolve it
    if not agent_arn and detail.get("agentName"):
        agent_arn = _resolve_agent_arn(detail["agentName"]) or ""

    if not agent_arn or not session_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "agentRuntimeArn (or agentName) and sessionId required"}),
        }

    result = stop_session(
        agent_runtime_arn=agent_arn,
        session_id=session_id,
        reason=reason,
        triggered_by="human",
        admin_user=admin_user,
        alert_id=detail.get("alertId", ""),
    )
    return {"statusCode": 200, "body": json.dumps(result)}