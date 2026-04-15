"""
Auto Budget Lambda — Automatically manages AWS Budgets + DynamoDB when agents are created/deleted.

Triggered by EventBridge when AgentCore runtime lifecycle events occur:
  - CreateAgentRuntime → creates budget + writes to cost-signals + agent-registry DynamoDB
  - DeleteAgentRuntime → deletes budget + removes from cost-signals + marks deleted in agent-registry

DynamoDB tables written:
  - cost-signals: per-agent budget data (dashboard reads this)
  - agent-registry: agent metadata (dashboard reads this)

Environment Variables:
  - DEFAULT_BUDGET_USD: Default monthly budget for new agents (default: 2.0)
  - SNS_TOPIC_ARN: ARN of the shared SNS topic for budget alerts
  - BUDGET_PREFIX: Prefix for budget names (default: agent-)
  - COST_SIGNALS_TABLE: DynamoDB table for cost signals (default: cost-signals)
  - REGISTRY_TABLE: DynamoDB table for agent registry (default: agent-registry)
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

DEFAULT_BUDGET_USD = float(os.environ.get("DEFAULT_BUDGET_USD", "2.0"))
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")
BUDGET_PREFIX = os.environ.get("BUDGET_PREFIX", "agent-")
COST_SIGNALS_TABLE = os.environ.get("COST_SIGNALS_TABLE", "cost-signals")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "agent-registry")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
budgets_client = boto3.client("budgets", config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name=REGION)

# Auto-detect account ID
try:
    AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "") or \
        boto3.client("sts").get_caller_identity()["Account"]
except Exception:
    AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")

def _write_cost_signal(agent_name: str, budget_name: str, limit_usd: float):
    """Write initial cost signal to DynamoDB so dashboard sees it immediately."""
    now = datetime.now(timezone.utc)
    try:
        dynamodb.Table(COST_SIGNALS_TABLE).put_item(Item={
            "agent_name": agent_name,
            "budget_name": budget_name,
            "budget_limit_usd": str(round(limit_usd, 2)),
            "actual_spend_usd": "0.0",
            "forecasted_spend_usd": "0.0",
            "pct_used": "0.0",
            "forecast_pct": "0.0",
            "severity": "low",
            "synced_at": now.isoformat(),
            "expires_at": int(now.timestamp()) + 86400,
        })
        logger.info(f"Cost signal written: {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to write cost signal for {agent_name}: {e}")


def _delete_cost_signal(agent_name: str):
    """Remove cost signal from DynamoDB when agent is deleted."""
    try:
        dynamodb.Table(COST_SIGNALS_TABLE).delete_item(Key={"agent_name": agent_name})
        logger.info(f"Cost signal deleted: {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete cost signal for {agent_name}: {e}")


def _write_registry(agent_name: str, agent_arn: str, tags: dict):
    """Write/update agent in registry so dashboard sees it immediately."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        dynamodb.Table(REGISTRY_TABLE).update_item(
            Key={"agent_name": agent_name},
            UpdateExpression=(
                "SET agent_runtime_arn = :arn, runtime_status = :st, "
                "tags = :tags, last_synced = :now, "
                "team = if_not_exists(team, :dt), "
                "environment = if_not_exists(environment, :de), "
                "#s = if_not_exists(#s, :ds), "
                "created_at = if_not_exists(created_at, :now)"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":arn": agent_arn, ":st": "CREATING", ":tags": tags,
                ":now": now, ":dt": "default", ":de": "production", ":ds": "active",
            },
        )
        logger.info(f"Registry updated: {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to update registry for {agent_name}: {e}")


def _create_budget(agent_name: str, tag_value: str) -> dict:
    """Create a tag-filtered budget with 80% and 100% SNS notifications."""
    budget_name = f"{BUDGET_PREFIX}{agent_name}"
    notifications = []
    if SNS_TOPIC_ARN:
        for threshold in [80.0, 100.0]:
            notifications.append({
                "Notification": {
                    "NotificationType": "ACTUAL",
                    "ComparisonOperator": "GREATER_THAN",
                    "Threshold": threshold,
                    "ThresholdType": "PERCENTAGE",
                },
                "Subscribers": [{"SubscriptionType": "SNS", "Address": SNS_TOPIC_ARN}],
            })
    try:
        params = {
            "AccountId": AWS_ACCOUNT_ID,
            "Budget": {
                "BudgetName": budget_name,
                "BudgetLimit": {"Amount": str(DEFAULT_BUDGET_USD), "Unit": "USD"},
                "BudgetType": "COST",
                "TimeUnit": "MONTHLY",
                "CostFilters": {"TagKeyValue": [f"user:agent-name${tag_value}"]},
            },
        }
        if notifications:
            params["NotificationsWithSubscribers"] = notifications
        budgets_client.create_budget(**params)
        logger.info(f"Budget created: {budget_name} (${DEFAULT_BUDGET_USD}/mo)")
        return {"status": "created", "budget_name": budget_name}
    except ClientError as e:
        if "DuplicateRecordException" in str(e):
            logger.info(f"Budget already exists: {budget_name}")
            return {"status": "exists", "budget_name": budget_name}
        logger.error(f"Failed to create budget {budget_name}: {e}")
        return {"status": "error", "budget_name": budget_name, "error": str(e)}


def _delete_budget(agent_name: str) -> dict:
    """Delete a budget for a deleted agent."""
    budget_name = f"{BUDGET_PREFIX}{agent_name}"
    try:
        budgets_client.delete_budget(AccountId=AWS_ACCOUNT_ID, BudgetName=budget_name)
        logger.info(f"Budget deleted: {budget_name}")
        return {"status": "deleted", "budget_name": budget_name}
    except ClientError as e:
        if "NotFoundException" in str(e):
            return {"status": "not_found", "budget_name": budget_name}
        logger.error(f"Failed to delete budget {budget_name}: {e}")
        return {"status": "error", "budget_name": budget_name, "error": str(e)}


def handler(event, context):
    """
    Lambda handler — triggered by EventBridge on AgentCore runtime events.

    CreateAgentRuntime → creates budget + writes to cost-signals + agent-registry
    DeleteAgentRuntime → deletes budget + removes from cost-signals
    """
    logger.info(f"Event: {json.dumps(event)}")

    detail = event.get("detail", {})
    event_name = detail.get("eventName", "")
    request_params = detail.get("requestParameters", {})
    response_elements = detail.get("responseElements", {})

    agent_name = request_params.get("agentRuntimeName", "")
    agent_arn = response_elements.get("agentRuntimeArn", "")
    agent_runtime_id = (request_params.get("agentRuntimeId", "")
                        or response_elements.get("agentRuntimeId", ""))

    # For delete events, extract name from runtime ID
    if not agent_name and agent_runtime_id:
        parts = agent_runtime_id.rsplit("-", 1)
        agent_name = parts[0] if len(parts) == 2 else agent_runtime_id

    if not agent_name:
        logger.warning("No agentRuntimeName in event, skipping")
        return {"statusCode": 200, "body": "no agent name"}

    if event_name == "CreateAgentRuntime":
        tags = request_params.get("tags", {})
        tag_value = tags.get("agent-name", agent_name)

        # 1. Create AWS Budget
        result = _create_budget(agent_name, tag_value)

        # 2. Write to cost-signals DynamoDB (dashboard sees it immediately)
        budget_name = f"{BUDGET_PREFIX}{agent_name}"
        _write_cost_signal(agent_name, budget_name, DEFAULT_BUDGET_USD)

        # 3. Write to agent-registry DynamoDB
        _write_registry(agent_name, agent_arn, tags)

        return {"statusCode": 200, "body": json.dumps(result)}

    elif event_name == "DeleteAgentRuntime":
        # 1. Delete AWS Budget
        result = _delete_budget(agent_name)

        # 2. Remove from cost-signals DynamoDB
        _delete_cost_signal(agent_name)

        # 3. Mark agent as deleted in agent-registry
        try:
            now = datetime.now(timezone.utc).isoformat()
            dynamodb.Table(REGISTRY_TABLE).update_item(
                Key={"agent_name": agent_name},
                UpdateExpression="SET runtime_status = :st, #s = :ds, deleted_at = :now, last_synced = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":st": "DELETED", ":ds": "deleted", ":now": now},
            )
            logger.info(f"Registry marked deleted: {agent_name}")
        except ClientError as e:
            logger.warning(f"Failed to update registry for deleted agent {agent_name}: {e}")

        return {"statusCode": 200, "body": json.dumps(result)}

    else:
        logger.info(f"Unhandled event: {event_name}")
        return {"statusCode": 200, "body": f"unhandled: {event_name}"}
