"""
Cost Signal Poll Lambda — Fetches exact budget spend values on a schedule.

Trigger: EventBridge Scheduler (every 5 minutes) OR manual invocation from dashboard.

What it does:
  - Calls AWS Budgets DescribeBudgets API (paginated)
  - Filters budgets by prefix (agent-)
  - Extracts ActualSpend, ForecastedSpend, BudgetLimit
  - Computes pct_used, forecast_pct, severity
  - Writes complete cost signal to DynamoDB

DynamoDB table: cost-signals (PK: agent_name)
Fields written: budget_name, budget_limit_usd, actual_spend_usd, forecasted_spend_usd,
                pct_used, forecast_pct, severity, synced_at, expires_at

Environment Variables:
  - COST_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-cost-signals)
  - REGISTRY_TABLE: DynamoDB table for agent registry (default: safety-dashboard-registry)
  - BUDGET_PREFIX: Prefix for budget names (default: agent-)
  - REGION: AWS region (default: us-east-1)
  - COST_WARNING_PCT: Warning threshold (default: 80)
  - COST_CRITICAL_PCT: Critical threshold (default: 95)
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

COST_SIGNALS_TABLE = os.environ.get("COST_SIGNALS_TABLE", "safety-dashboard-cost-signals")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "safety-dashboard-registry")
BUDGET_PREFIX = os.environ.get("BUDGET_PREFIX", "agent-")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
COST_WARNING_PCT = float(os.environ.get("COST_WARNING_PCT", "80"))
COST_CRITICAL_PCT = float(os.environ.get("COST_CRITICAL_PCT", "95"))

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
budgets_client = boto3.client("budgets", region_name="us-east-1", config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)

# Auto-detect account ID
try:
    AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "") or \
        boto3.client("sts").get_caller_identity()["Account"]
except Exception:
    AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")


def _normalize(name: str) -> str:
    """Normalize agent name for matching (strip hyphens/underscores, lowercase)."""
    return name.lower().replace("-", "").replace("_", "")


def _compute_severity(pct_used: float, forecast_pct: float) -> str:
    """Compute severity from budget utilization percentages."""
    if pct_used >= COST_CRITICAL_PCT:
        return "critical"
    elif pct_used >= COST_WARNING_PCT or forecast_pct >= COST_CRITICAL_PCT:
        return "medium"
    return "low"


def handler(event, context):
    """
    Lambda handler — fetches current budget spend and writes to DynamoDB.

    Can be triggered by:
    - EventBridge Scheduler (every 5 min)
    - Manual invocation from dashboard (POST /api/sync triggers Lambda)
    """
    logger.info(f"Event: {json.dumps(event)}")

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(COST_SIGNALS_TABLE)

    # Load registry to filter — only show agents that are registered
    registry_names = set()
    try:
        reg_table = dynamodb.Table(REGISTRY_TABLE)
        items = reg_table.scan().get("Items", [])
        registry_names = {_normalize(item.get("agent_name", "")) for item in items}
    except ClientError as e:
        logger.warning(f"Failed to load registry: {e}")

    written = 0
    synced_agents = set()

    try:
        for page in budgets_client.get_paginator("describe_budgets").paginate(AccountId=AWS_ACCOUNT_ID):
            for budget in page.get("Budgets", []):
                budget_name = budget.get("BudgetName", "")
                if not budget_name.startswith(BUDGET_PREFIX):
                    continue

                agent_name = budget_name[len(BUDGET_PREFIX):]

                # Only include agents that exist in the registry
                if registry_names and _normalize(agent_name) not in registry_names:
                    continue

                synced_agents.add(agent_name)

                # Extract spend data
                limit = float(budget.get("BudgetLimit", {}).get("Amount", 0))
                actual = float(budget.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", 0))
                forecast_raw = budget.get("CalculatedSpend", {}).get("ForecastedSpend", {}).get("Amount")
                forecast = float(forecast_raw) if forecast_raw is not None else 0.0

                # Compute percentages
                pct_used = (actual / limit * 100) if limit > 0 else 0.0
                forecast_pct = (forecast / limit * 100) if limit > 0 else 0.0

                severity = _compute_severity(pct_used, forecast_pct)

                # Write to DynamoDB
                try:
                    table.put_item(Item={
                        "agent_name": agent_name,
                        "budget_name": budget_name,
                        "budget_limit_usd": str(round(limit, 2)),
                        "actual_spend_usd": str(round(actual, 4)),
                        "forecasted_spend_usd": str(round(forecast, 4)),
                        "pct_used": str(round(pct_used, 1)),
                        "forecast_pct": str(round(forecast_pct, 1)),
                        "severity": severity,
                        "synced_at": now.isoformat(),
                        "expires_at": expires_at,
                    })
                    written += 1
                except ClientError as e:
                    logger.error(f"Failed to write cost signal for {agent_name}: {e}")

    except ClientError as e:
        logger.error(f"Failed to describe budgets: {e}")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "detail": str(e)})}

    # Cleanup: remove DynamoDB entries for budgets that no longer exist
    removed = 0
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            if item.get("agent_name") not in synced_agents:
                try:
                    table.delete_item(Key={"agent_name": item["agent_name"]})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    logger.info(f"Cost poll complete: written={written}, removed={removed}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "signals_written": written,
            "removed": removed,
        }),
    }
