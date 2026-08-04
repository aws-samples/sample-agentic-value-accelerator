"""
Evaluation Signal Event Lambda — Triggered by EventBridge on eval alarm state changes.

Trigger: EventBridge rule matching:
  - source: aws.cloudwatch
  - detail-type: CloudWatch Alarm State Change
  - Filter: alarm name prefix "AgentSafety-Eval-"

What it does:
  - Parses agent name and endpoint from alarm description (reliable, not masked)
  - Falls back to alarm name parsing for backward compatibility
  - Maps alarm state to severity (ALARM→critical, INSUFFICIENT_DATA→medium, OK→low)
  - Updates the alarm_summary record in eval-signals DynamoDB table
  - Supports multi-endpoint: uses signal_key "alarm_summary#endpoint" for non-DEFAULT

DynamoDB table: eval-signals (PK: agent_name, SK: signal_key)
Record updated: signal_key = "alarm_summary" (DEFAULT) or "alarm_summary#endpoint"
Fields updated: alarm_state, alarm_reason, alarm_updated_at, severity, endpoint, synced_at, expires_at

Environment Variables:
  - EVAL_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-eval-signals)
  - REGION: AWS region (default: us-east-1)
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EVAL_SIGNALS_TABLE = os.environ.get("EVAL_SIGNALS_TABLE", "safety-dashboard-eval-signals")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
EVAL_ALARM_PREFIX = "AgentSafety-Eval-"

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)


def _state_to_severity(state: str) -> str:
    """Map CloudWatch alarm state to severity."""
    if state == "ALARM":
        return "critical"
    elif state == "INSUFFICIENT_DATA":
        return "medium"
    return "low"


def _parse_agent_and_endpoint_from_description(description: str) -> tuple[str, str]:
    """Parse agent name and endpoint from alarm description.

    Our auto-eval Lambda sets description to:
      "Agent quality alarm for {agent_name}/{endpoint}."
    This field is NOT masked by CloudTrail.

    Returns (agent_name, endpoint) or ("", "") if parsing fails.
    """
    # Match: "Agent quality alarm for {name}/{endpoint}."
    # Also match: "Agent quality alarm for {name}/{endpoint}. Fires when..."
    match = re.search(r'Agent quality alarm for ([^/]+)/([^.]+)', description)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    # Legacy format (single endpoint): "Agent quality alarm for {name}. Fires when..."
    match = re.search(r'Agent quality alarm for ([^.]+)\.', description)
    if match:
        name = match.group(1).strip()
        # Check if it contains a slash (shouldn't for legacy, but be safe)
        if '/' not in name:
            return name, "DEFAULT"
    return "", ""


def _parse_agent_and_endpoint_from_alarm_name(alarm_name: str) -> tuple[str, str]:
    """Fallback: parse from alarm name (may contain *** if masked).

    Alarm naming convention:
      DEFAULT: AgentSafety-Eval-{agent_name}
      Non-DEFAULT: AgentSafety-Eval-{agent_name}-{endpoint}

    Problem: agent_name itself may contain hyphens, making it ambiguous.
    This is why we prefer the description-based parsing.
    """
    name_part = alarm_name[len(EVAL_ALARM_PREFIX):]
    if not name_part or "***" in name_part:
        return "", ""
    # For now, treat the entire suffix as agent_name with DEFAULT endpoint
    # (can't reliably distinguish agent-name hyphens from endpoint separator)
    return name_part, "DEFAULT"


def handler(event, context):
    """
    Lambda handler — triggered by EventBridge on eval alarm state change.

    Supports both DEFAULT and per-endpoint alarms.
    Uses alarm description to reliably extract agent name and endpoint
    (immune to CloudTrail field masking).
    """
    logger.info(f"Event: {json.dumps(event)}")

    detail = event.get("detail", {})
    alarm_name = detail.get("alarmName", "")

    # Only process eval alarms
    if not alarm_name.startswith(EVAL_ALARM_PREFIX):
        logger.info(f"Skipping non-eval alarm: {alarm_name}")
        return {"statusCode": 200, "body": "skipped — not an eval alarm"}

    # Extract state info
    state_info = detail.get("state", {})
    alarm_state = state_info.get("value", "INSUFFICIENT_DATA")
    state_reason = state_info.get("reason", "")
    state_timestamp = state_info.get("timestamp", "")

    # Parse agent name and endpoint from alarm description (NOT masked)
    config = detail.get("configuration", {})
    description = config.get("description", "")
    agent_name, endpoint = _parse_agent_and_endpoint_from_description(description)

    # Fallback to alarm name parsing if description parsing fails
    if not agent_name:
        agent_name, endpoint = _parse_agent_and_endpoint_from_alarm_name(alarm_name)

    if not agent_name:
        logger.warning(f"Cannot determine agent name from alarm: {alarm_name}")
        return {"statusCode": 200, "body": "skipped — cannot determine agent name"}

    # Determine signal_key based on endpoint
    if endpoint and endpoint != "DEFAULT":
        signal_key = f"alarm_summary#{endpoint}"
    else:
        signal_key = "alarm_summary"
        endpoint = "DEFAULT"

    severity = _state_to_severity(alarm_state)
    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400

    # Update the alarm_summary record in eval-signals DynamoDB
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    try:
        table.update_item(
            Key={"agent_name": agent_name, "signal_key": signal_key},
            UpdateExpression=(
                "SET alarm_state = :state, "
                "alarm_reason = :reason, "
                "alarm_updated_at = :updated, "
                "severity = :sev, "
                "endpoint = :ep, "
                "synced_at = :now, "
                "expires_at = :exp, "
                "alarm_name = :aname"
            ),
            ExpressionAttributeValues={
                ":state": alarm_state,
                ":reason": state_reason[:500] if alarm_state == "ALARM" else "",
                ":updated": state_timestamp,
                ":sev": severity,
                ":ep": endpoint,
                ":now": now.isoformat(),
                ":exp": expires_at,
                ":aname": alarm_name,
            },
        )
        logger.info(f"Eval signal updated: agent={agent_name}, endpoint={endpoint}, state={alarm_state}, severity={severity}")
    except ClientError as e:
        logger.error(f"Failed to update eval signal for {agent_name}/{endpoint}: {e}")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "detail": str(e)})}

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "agent_name": agent_name,
            "endpoint": endpoint,
            "alarm_state": alarm_state,
            "severity": severity,
        }),
    }
