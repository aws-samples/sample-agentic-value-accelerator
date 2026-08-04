"""
Cost Signal Event Lambda — Triggered by SNS when a budget threshold is breached.

Trigger: SNS subscription on the agent-cost-alerts topic.
         AWS Budgets sends notifications at 80% and 100% thresholds.

What it does:
  - Parses the SNS message to extract budget name and threshold percentage
  - Derives agent name by stripping the budget prefix
  - Computes severity based on threshold
  - Writes to cost-signals DynamoDB table

DynamoDB table: cost-signals (PK: agent_name)
Fields updated: severity, threshold_breached_pct, threshold_breached_at, synced_at, expires_at

Environment Variables:
  - COST_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-cost-signals)
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
BUDGET_PREFIX = os.environ.get("BUDGET_PREFIX", "agent-")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
COST_WARNING_PCT = float(os.environ.get("COST_WARNING_PCT", "80"))
COST_CRITICAL_PCT = float(os.environ.get("COST_CRITICAL_PCT", "95"))

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)


def _compute_severity(threshold_pct: float) -> str:
    """Compute severity from the breached threshold percentage."""
    if threshold_pct >= COST_CRITICAL_PCT:
        return "critical"
    elif threshold_pct >= COST_WARNING_PCT:
        return "medium"
    return "low"


def _parse_sns_budget_message(message: str) -> dict:
    """
    Parse the SNS message from AWS Budgets.

    AWS Budgets SNS messages have this format:
    "AWS Budget Notification May 07, 2026
    AWS Account XXXXXXXXXXXX
    Dear AWS Customer,
    You requested that we alert you when the ACTUAL Cost associated with your
    budget-name budget is greater than $1.60 (80.0% of your budget).
    ..."

    We extract the budget name and threshold percentage.
    """
    result = {"budget_name": "", "threshold_pct": 0.0}

    # Try to find budget name
    if "budget is greater than" in message.lower() or "budget has exceeded" in message.lower():
        # Look for percentage in parentheses: (80.0% of your budget)
        import re
        pct_match = re.search(r'\((\d+\.?\d*)%\s+of your budget\)', message)
        if pct_match:
            result["threshold_pct"] = float(pct_match.group(1))

        # Look for budget name — it's typically between "your" and "budget"
        # Format: "associated with your agent-workshop_agent budget"
        name_match = re.search(r'your\s+(\S+)\s+budget', message)
        if name_match:
            result["budget_name"] = name_match.group(1)

    return result


def handler(event, context):
    """
    Lambda handler — triggered by SNS when a budget threshold is breached.

    SNS event structure:
    {
        "Records": [{
            "Sns": {
                "Message": "AWS Budget Notification...",
                "Subject": "AWS Budgets: budget-name has exceeded..."
            }
        }]
    }
    """
    logger.info(f"Event: {json.dumps(event)}")

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(COST_SIGNALS_TABLE)

    records_processed = 0

    for record in event.get("Records", []):
        sns = record.get("Sns", {})
        message = sns.get("Message", "")
        subject = sns.get("Subject", "")

        logger.info(f"SNS Subject: {subject}")
        logger.info(f"SNS Message: {message[:500]}")

        # Parse the budget notification
        parsed = _parse_sns_budget_message(message)
        budget_name = parsed["budget_name"]
        threshold_pct = parsed["threshold_pct"]

        # Derive agent name from budget name
        if not budget_name:
            # Try to extract from subject
            if BUDGET_PREFIX in subject:
                parts = subject.split(BUDGET_PREFIX)
                if len(parts) > 1:
                    budget_name = BUDGET_PREFIX + parts[1].split(" ")[0]

        if not budget_name or not budget_name.startswith(BUDGET_PREFIX):
            logger.warning(f"Could not extract budget name from message, skipping")
            continue

        agent_name = budget_name[len(BUDGET_PREFIX):]
        if not agent_name:
            logger.warning(f"Empty agent name after stripping prefix, skipping")
            continue

        severity = _compute_severity(threshold_pct)

        # Update cost-signals DynamoDB — only update severity and threshold fields
        # Don't overwrite exact dollar amounts (those come from the poll Lambda)
        try:
            table.update_item(
                Key={"agent_name": agent_name},
                UpdateExpression=(
                    "SET severity = :sev, "
                    "threshold_breached_pct = :pct, "
                    "threshold_breached_at = :at, "
                    "synced_at = :now, "
                    "expires_at = :exp"
                ),
                ExpressionAttributeValues={
                    ":sev": severity,
                    ":pct": str(round(threshold_pct, 1)),
                    ":at": now.isoformat(),
                    ":now": now.isoformat(),
                    ":exp": expires_at,
                },
            )
            logger.info(f"Cost signal updated: agent={agent_name}, severity={severity}, threshold={threshold_pct}%")
            records_processed += 1
        except ClientError as e:
            logger.error(f"Failed to update cost signal for {agent_name}: {e}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "records_processed": records_processed,
        }),
    }
