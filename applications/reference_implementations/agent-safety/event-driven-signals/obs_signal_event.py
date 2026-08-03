"""
Observability Signal Event Lambda — Triggered by EventBridge on CloudWatch alarm state changes.

Trigger: EventBridge rule matching:
  - source: aws.cloudwatch
  - detail-type: CloudWatch Alarm State Change
  - Filters: alarm names with agent-related suffixes (not eval alarms)

What it does:
  - Extracts agent name from alarm name (strips suffix)
  - Maps alarm state to severity (ALARM→critical, INSUFFICIENT_DATA→medium, OK→low)
  - Writes to obs-signals DynamoDB table

DynamoDB table: obs-signals (PK: agent_name, SK: signal_key)
Fields written: signal_type, severity, alarm_state, alarm_name, description,
                state_reason, state_updated_at, generated_at, expires_at

Environment Variables:
  - OBS_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-obs-signals)
  - REGION: AWS region (default: us-east-1)
"""

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

OBS_SIGNALS_TABLE = os.environ.get("OBS_SIGNALS_TABLE", "safety-dashboard-obs-signals")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)

# Alarm name suffixes that belong to observability (not evaluation)
OBS_SUFFIXES = ("-high-latency", "-error-rate", "-token-usage", "-invocation-count", "-composite")

# Map suffix to signal type
SUFFIX_TO_TYPE = {
    "-high-latency": "latency_alarm",
    "-error-rate": "error_alarm",
    "-token-usage": "token_alarm",
    "-invocation-count": "invocation_alarm",
    "-composite": "composite_alarm",
}


def _is_obs_alarm(alarm_name: str) -> bool:
    """Check if this alarm belongs to observability (not evaluation)."""
    # Skip eval alarms
    if alarm_name.startswith("AgentSafety-Eval-"):
        return False
    # Must end with one of the obs suffixes
    return any(alarm_name.endswith(s) for s in OBS_SUFFIXES)


def _extract_agent_name(alarm_name: str) -> str:
    """Extract agent name by stripping the suffix from alarm name."""
    for suffix in OBS_SUFFIXES:
        if alarm_name.endswith(suffix):
            return alarm_name[: -len(suffix)]
    return ""


def _get_signal_type(alarm_name: str) -> str:
    """Get the signal type from the alarm name suffix."""
    for suffix, signal_type in SUFFIX_TO_TYPE.items():
        if alarm_name.endswith(suffix):
            return signal_type
    return "unknown"


def _state_to_severity(state: str) -> str:
    """Map CloudWatch alarm state to severity."""
    if state == "ALARM":
        return "critical"
    elif state == "INSUFFICIENT_DATA":
        return "medium"
    return "low"


def handler(event, context):
    """
    Lambda handler — triggered by EventBridge on CloudWatch alarm state change.

    EventBridge event structure:
    {
        "source": "aws.cloudwatch",
        "detail-type": "CloudWatch Alarm State Change",
        "detail": {
            "alarmName": "workshop_agent-high-latency",
            "state": {"value": "ALARM", "reason": "...", "timestamp": "..."},
            "previousState": {"value": "OK", ...},
            "configuration": {...}
        }
    }
    """
    logger.info(f"Event: {json.dumps(event)}")

    detail = event.get("detail", {})
    alarm_name = detail.get("alarmName", "")

    # Only process observability alarms
    if not _is_obs_alarm(alarm_name):
        logger.info(f"Skipping non-obs alarm: {alarm_name}")
        return {"statusCode": 200, "body": "skipped — not an obs alarm"}

    # Only process composite alarms — child alarms trigger the composite automatically
    if not alarm_name.endswith("-composite"):
        logger.info(f"Skipping child alarm: {alarm_name} (composite will fire automatically)")
        return {"statusCode": 200, "body": "skipped — child alarm, waiting for composite"}

    agent_name = _extract_agent_name(alarm_name)
    if not agent_name:
        logger.warning(f"Could not extract agent name from: {alarm_name}")
        return {"statusCode": 200, "body": "skipped — no agent name"}

    # Extract state info
    state_info = detail.get("state", {})
    alarm_state = state_info.get("value", "INSUFFICIENT_DATA")
    state_reason = state_info.get("reason", "")
    state_timestamp = state_info.get("timestamp", "")

    signal_type = _get_signal_type(alarm_name)
    severity = _state_to_severity(alarm_state)

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400

    # Use composite alarm as the signal_key (aggregated view)
    # For child alarms, use the specific alarm name
    signal_key = f"{agent_name}-composite" if signal_type == "composite_alarm" else alarm_name

    # Write to DynamoDB
    table = dynamodb.Table(OBS_SIGNALS_TABLE)
    try:
        table.put_item(Item={
            "agent_name": agent_name,
            "signal_key": signal_key,
            "signal_type": signal_type,
            "severity": severity,
            "alarm_state": alarm_state,
            "alarm_name": alarm_name,
            "current_value": alarm_state,
            "description": state_reason[:200] if state_reason else f"Alarm {alarm_name}: {alarm_state}",
            "state_reason": state_reason[:500] if alarm_state == "ALARM" else "",
            "state_updated_at": state_timestamp,
            "generated_at": now.isoformat(),
            "expires_at": expires_at,
        })
        logger.info(f"Obs signal written: agent={agent_name}, alarm={alarm_name}, state={alarm_state}, severity={severity}")
    except ClientError as e:
        logger.error(f"Failed to write obs signal for {agent_name}: {e}")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "detail": str(e)})}

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "agent_name": agent_name,
            "alarm_state": alarm_state,
            "severity": severity,
        }),
    }
