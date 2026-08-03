"""
Observability Signal Poll Lambda — Fetches current alarm states on a schedule.

Trigger: EventBridge Scheduler (every 5 minutes) OR manual invocation from dashboard.

What it does:
  - Calls CloudWatch DescribeAlarms API (paginated)
  - Filters for agent observability alarms (skips eval alarms)
  - Aggregates per-agent (worst severity wins for composite view)
  - Writes to obs-signals DynamoDB table

DynamoDB table: obs-signals (PK: agent_name, SK: signal_key)
Fields written: signal_type, severity, alarm_state, alarm_name, description,
                state_updated_at, generated_at, expires_at

Environment Variables:
  - OBS_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-obs-signals)
  - REGISTRY_TABLE: DynamoDB table for agent registry (default: safety-dashboard-registry)
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
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "safety-dashboard-registry")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
cw = boto3.client("cloudwatch", region_name=REGION, config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)

# Child alarm suffixes (we skip these in the aggregated view)
CHILD_SUFFIXES = ("-high-latency", "-error-rate", "-token-usage", "-invocation-count")


def _normalize(name: str) -> str:
    """Normalize agent name for matching."""
    return name.lower().replace("-", "").replace("_", "")


def _state_to_severity(state: str) -> str:
    """Map CloudWatch alarm state to severity."""
    if state == "ALARM":
        return "critical"
    elif state == "INSUFFICIENT_DATA":
        return "medium"
    return "low"


def _extract_agent_name(alarm, registry):
    """Extract agent name from alarm using multiple strategies."""
    name = alarm.get("AlarmName", "")
    desc = alarm.get("AlarmDescription", "")

    # Strategy 1: strip known suffixes
    for suffix in CHILD_SUFFIXES + ("-composite",):
        if name.endswith(suffix):
            return name[: -len(suffix)]

    # Strategy 2: match against registry names
    for agent in registry:
        an = agent.get("agent_name", "")
        if an and (an in name or an in desc):
            return an

    # Strategy 3: check dimensions
    for dim in alarm.get("Dimensions", []):
        if dim.get("Name") == "AgentName":
            return dim["Value"]

    return None


def handler(event, context):
    """
    Lambda handler — fetches current alarm states and writes to DynamoDB.

    Can be triggered by:
    - EventBridge Scheduler (every 5 min)
    - Manual invocation from dashboard
    """
    logger.info(f"Event: {json.dumps(event)}")

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(OBS_SIGNALS_TABLE)

    # Load registry for agent name matching
    registry = []
    registry_names = set()
    try:
        reg_table = dynamodb.Table(REGISTRY_TABLE)
        registry = reg_table.scan().get("Items", [])
        registry_names = {_normalize(item.get("agent_name", "")) for item in registry}
    except ClientError as e:
        logger.warning(f"Failed to load registry: {e}")

    # Fetch all alarms
    alarms = []
    try:
        for page in cw.get_paginator("describe_alarms").paginate(
            AlarmTypes=["MetricAlarm", "CompositeAlarm"]
        ):
            alarms.extend(page.get("MetricAlarms", []))
            alarms.extend(page.get("CompositeAlarms", []))
    except ClientError as e:
        logger.error(f"Failed to describe alarms: {e}")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "detail": str(e)})}

    # Aggregate: one signal per agent (worst severity wins)
    sev_rank = {"critical": 2, "medium": 1, "low": 0}
    agent_signals = {}
    written = 0

    for alarm in alarms:
        alarm_name = alarm.get("AlarmName", "")

        # Skip eval alarms
        if alarm_name.startswith("AgentSafety-Eval-"):
            continue

        # Skip individual child alarms — only show composite
        if any(alarm_name.endswith(s) for s in CHILD_SUFFIXES):
            continue

        agent_name = _extract_agent_name(alarm, registry)
        if not agent_name:
            continue
        if registry_names and _normalize(agent_name) not in registry_names:
            continue

        state = alarm.get("StateValue", "INSUFFICIENT_DATA")
        severity = _state_to_severity(state)
        updated = alarm.get("StateUpdatedTimestamp", "")
        if hasattr(updated, "isoformat"):
            updated = updated.isoformat()
        reason = alarm.get("StateReason", "") if state == "ALARM" else ""
        desc = alarm.get("AlarmDescription", "") or f"Alarm {alarm_name}: {state}"

        existing = agent_signals.get(agent_name)
        if existing is None or sev_rank.get(severity, 0) > sev_rank.get(existing["severity"], 0):
            agent_signals[agent_name] = {
                "agent_name": agent_name,
                "signal_key": f"{agent_name}-composite",
                "signal_type": "alarm",
                "severity": severity,
                "alarm_state": state,
                "alarm_name": alarm_name,
                "current_value": state,
                "description": (reason[:200] if reason else desc[:200]),
                "state_updated_at": str(updated),
                "generated_at": now.isoformat(),
                "expires_at": expires_at,
            }

    # Write aggregated signals to DynamoDB
    for agent_name, sig in agent_signals.items():
        try:
            table.put_item(Item=sig)
            written += 1
        except ClientError as e:
            logger.error(f"Failed to write obs signal for {agent_name}: {e}")

    # Cleanup: remove entries for agents whose alarms no longer exist
    removed = 0
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            an = item.get("agent_name", "")
            if an not in agent_signals:
                try:
                    table.delete_item(Key={"agent_name": an, "signal_key": item.get("signal_key", "")})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    logger.info(f"Obs poll complete: written={written}, alarms_checked={len(alarms)}, removed={removed}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "signals_written": written,
            "alarms_checked": len(alarms),
            "removed": removed,
        }),
    }
