"""
Stop Sessions Lambda — Bulk-stops all active sessions for an agent.

Reads agent ARN from agent-registry DynamoDB (no AgentCore control plane calls).
Stops sessions via AgentCore data plane, logs interventions, cascades to cost-signals.

Environment Variables:
  - SESSION_TABLE: DynamoDB table for session tracking (default: session-token-usage)
  - INTERVENTION_TABLE: DynamoDB table for audit log (default: intervention-log)
  - REGISTRY_TABLE: DynamoDB table for agent registry (default: agent-registry)
  - COST_SIGNALS_TABLE: DynamoDB table for cost signals (default: cost-signals)
  - REGION: AWS region (default: us-east-1)

Input event:
  {
    "agent_name": "my_agent",
    "reason": "Cost budget exceeded",
    "admin_user": "jane.doe@company.com"
  }
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
SESSION_TABLE = os.environ.get("SESSION_TABLE", "session-token-usage")
INTERVENTION_TABLE = os.environ.get("INTERVENTION_TABLE", "intervention-log")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "agent-registry")
COST_SIGNALS_TABLE = os.environ.get("COST_SIGNALS_TABLE", "cost-signals")
ACTIVE_THRESHOLD_MIN = 6
IDLE_THRESHOLD_MIN = 30

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
agentcore_data = boto3.client("bedrock-agentcore", region_name=REGION, config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name=REGION)

def _normalize(name: str) -> str:
    return name.lower().replace("-", "").replace("_", "")


def _classify_status(last_hb_str: str, stored_status: str = "") -> str:
    if stored_status in ("terminated", "completed"):
        return "inactive"
    try:
        mins = (datetime.now(timezone.utc) - datetime.fromisoformat(last_hb_str)).total_seconds() / 60
        if mins <= ACTIVE_THRESHOLD_MIN:
            return "active"
        elif mins <= IDLE_THRESHOLD_MIN:
            return "idle"
        return "inactive"
    except (ValueError, TypeError):
        return "unknown"


def _resolve_agent_arn(agent_name: str) -> str | None:
    """Look up agent ARN from DynamoDB registry (no AgentCore API call)."""
    norm = _normalize(agent_name)
    try:
        table = dynamodb.Table(REGISTRY_TABLE)
        # Try exact match first
        resp = table.get_item(Key={"agent_name": agent_name})
        item = resp.get("Item")
        if item and item.get("agent_runtime_arn"):
            return item["agent_runtime_arn"]
        # Try normalized scan if exact match fails
        items = table.scan().get("Items", [])
        for r in items:
            if _normalize(r.get("agent_name", "")) == norm and r.get("agent_runtime_arn"):
                return r["agent_runtime_arn"]
    except ClientError as e:
        logger.warning(f"Registry lookup failed: {e}")
    return None


def _cascade_cost_signal(agent_name: str, session_id: str):
    """Mark cost signal as acted upon so dashboard reflects the action."""
    try:
        dynamodb.Table(COST_SIGNALS_TABLE).update_item(
            Key={"agent_name": agent_name},
            UpdateExpression="SET last_action = :a, last_action_at = :t, last_action_session_id = :s",
            ExpressionAttributeValues={
                ":a": "session_stopped",
                ":t": datetime.now(timezone.utc).isoformat(),
                ":s": session_id,
            },
        )
    except ClientError:
        pass  # Best effort — don't fail the stop operation


def handler(event, context):
    """Lambda handler — stops all active sessions for an agent."""
    agent_name = event.get("agent_name", "")
    reason = event.get("reason", "")
    admin_user = event.get("admin_user", "")

    if not all([agent_name, reason, admin_user]):
        return {"statusCode": 400, "body": json.dumps({"error": "agent_name, reason, admin_user required"})}

    # 1. Resolve agent ARN from DynamoDB registry
    agent_arn = _resolve_agent_arn(agent_name)
    if not agent_arn:
        return {"statusCode": 404, "body": json.dumps({"error": f"Agent '{agent_name}' not found in registry"})}

    # 2. Get active/idle sessions from DynamoDB
    sess_table = dynamodb.Table(SESSION_TABLE)
    norm = _normalize(agent_name)
    try:
        all_sessions = sess_table.scan().get("Items", [])
    except ClientError as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    active = [s for s in all_sessions
              if _normalize(s.get("agent_name", "")) == norm
              and _classify_status(s.get("last_heartbeat", ""), s.get("status", "")) in ("active", "idle")]

    if not active:
        return {"statusCode": 200, "body": json.dumps({
            "agent_name": agent_name, "agent_runtime_arn": agent_arn,
            "total_sessions": 0, "stopped": 0, "failed": 0,
            "results": [], "intervention_ids": []})}

    # 3. Stop each session
    results, iids = [], []
    int_table = dynamodb.Table(INTERVENTION_TABLE)

    for s in active:
        sid = s["session_id"]
        sr, se = "stopped", ""
        try:
            agentcore_data.stop_runtime_session(
                agentRuntimeArn=agent_arn, runtimeSessionId=sid,
                clientToken=f"stop-{sid}-{uuid.uuid5(uuid.NAMESPACE_DNS, sid)}")
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in ("ResourceNotFoundException", "404"):
                sr = "not_found"
            elif code == "ConflictException":
                sr = "already_stopping"
            else:
                sr, se = "error", str(e)

        results.append({"session_id": sid, "status": sr})
        if se:
            results[-1]["error"] = se

        # Mark session terminated
        if sr in ("stopped", "not_found", "already_stopping"):
            try:
                sess_table.update_item(Key={"session_id": sid},
                    UpdateExpression="SET #st = :s",
                    ExpressionAttributeNames={"#st": "status"},
                    ExpressionAttributeValues={":s": "terminated"})
            except ClientError:
                pass

        # Log intervention
        iid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            item = {"intervention_id": iid, "timestamp": now,
                "agent_runtime_arn": agent_arn, "agent_name": agent_name,
                "session_id": sid, "action": "stop_session",
                "triggered_by": "human", "reason": reason,
                "admin_user": admin_user, "stop_result": sr, "rollback_status": "none"}
            if se:
                item["error_detail"] = se
            int_table.put_item(Item=item)
            iids.append(iid)
        except ClientError as e:
            logger.warning(f"Log failed: {e}")

        # Cascade to cost-signals
        _cascade_cost_signal(agent_name, sid)

    stopped = sum(1 for r in results if r["status"] in ("stopped", "not_found", "already_stopping"))

    logger.info(f"Stop all: {agent_name} | Total:{len(active)} Stopped:{stopped} | By:{admin_user}")

    return {"statusCode": 200, "body": json.dumps({
        "agent_name": agent_name, "agent_runtime_arn": agent_arn,
        "total_sessions": len(active), "stopped": stopped,
        "failed": len(active) - stopped, "results": results,
        "intervention_ids": iids})}
