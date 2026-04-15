"""
Agent Budget Sync — Creates and manages per-agent AWS Budgets with centralized SNS notifications.

Automatically:
  - Creates a shared SNS topic (agent-cost-alerts) if it doesn't exist
  - Lists all AgentCore runtimes
  - Creates a tag-filtered budget for any agent that doesn't have one
  - Attaches 80% (medium) and 100% (critical) notifications to the shared SNS topic
  - Optionally cleans up budgets for deleted agents

Run manually or on a schedule (cron / Lambda / EventBridge):
    python budgets.py sync --region us-east-1
    python budgets.py sync --region us-east-1 --default-limit 5.0
    python budgets.py sync --region us-east-1 --cleanup
    python budgets.py list --region us-east-1

Scale: Works for 1-20,000 agents (AWS Budgets limit per account).
"""

import argparse
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BUDGET_PREFIX = "agent-"
SNS_TOPIC_NAME = "agent-cost-alerts"
DEFAULT_BUDGET_LIMIT = 2.0  # USD per month

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})


def _ensure_sns_topic(sns_client) -> str:
    """Create the shared SNS topic if it doesn't exist. Returns the topic ARN."""
    try:
        resp = sns_client.create_topic(Name=SNS_TOPIC_NAME)
        return resp["TopicArn"]
    except ClientError as e:
        logger.error(f"Failed to create SNS topic: {e}")
        raise


def _get_live_agents(agentcore_client) -> dict[str, dict]:
    """List all AgentCore runtimes. Returns {name: {arn, id, tags}}."""
    agents: dict[str, dict] = {}
    paginator = agentcore_client.get_paginator("list_agent_runtimes")
    for page in paginator.paginate():
        for rt in page.get("agentRuntimes", []):
            name = rt["agentRuntimeName"]
            agents[name] = {
                "arn": rt["agentRuntimeArn"],
                "id": rt["agentRuntimeId"],
                "status": rt["status"],
            }
    return agents


def _get_existing_budgets(budgets_client, account_id: str) -> dict[str, dict]:
    """List all agent-* budgets. Returns {budget_name: budget_dict}."""
    budgets: dict[str, dict] = {}
    paginator = budgets_client.get_paginator("describe_budgets")
    for page in paginator.paginate(AccountId=account_id):
        for b in page.get("Budgets", []):
            name = b["BudgetName"]
            if name.startswith(BUDGET_PREFIX):
                budgets[name] = b
    return budgets


def _get_agent_tag_value(agentcore_client, arn: str) -> str | None:
    """Get the agent-name tag value from an AgentCore runtime."""
    try:
        resp = agentcore_client.list_tags_for_resource(resourceArn=arn)
        return resp.get("tags", {}).get("agent-name")
    except ClientError:
        return None


def _create_budget(
    budgets_client,
    account_id: str,
    agent_name: str,
    tag_value: str,
    limit_usd: float,
    sns_topic_arn: str,
) -> None:
    """Create a tag-filtered budget with 80% and 100% SNS notifications."""
    budget_name = f"{BUDGET_PREFIX}{agent_name}"

    try:
        budgets_client.create_budget(
            AccountId=account_id,
            Budget={
                "BudgetName": budget_name,
                "BudgetLimit": {"Amount": str(limit_usd), "Unit": "USD"},
                "BudgetType": "COST",
                "TimeUnit": "MONTHLY",
                "CostFilters": {
                    "TagKeyValue": [f"user:agent-name${tag_value}"],
                },
            },
            NotificationsWithSubscribers=[
                {
                    "Notification": {
                        "NotificationType": "ACTUAL",
                        "ComparisonOperator": "GREATER_THAN",
                        "Threshold": 80.0,
                        "ThresholdType": "PERCENTAGE",
                    },
                    "Subscribers": [
                        {"SubscriptionType": "SNS", "Address": sns_topic_arn},
                    ],
                },
                {
                    "Notification": {
                        "NotificationType": "ACTUAL",
                        "ComparisonOperator": "GREATER_THAN",
                        "Threshold": 100.0,
                        "ThresholdType": "PERCENTAGE",
                    },
                    "Subscribers": [
                        {"SubscriptionType": "SNS", "Address": sns_topic_arn},
                    ],
                },
            ],
        )
        logger.info(f"[CREATED] {budget_name} — ${limit_usd}/mo, tag={tag_value}")
    except ClientError as e:
        if "DuplicateRecordException" in str(e):
            logger.info(f"[EXISTS]  {budget_name}")
        else:
            logger.error(f"[ERROR]   {budget_name}: {e}")


def _delete_budget(budgets_client, account_id: str, budget_name: str) -> None:
    """Delete a budget."""
    try:
        budgets_client.delete_budget(AccountId=account_id, BudgetName=budget_name)
        logger.info(f"[DELETED] {budget_name}")
    except ClientError as e:
        logger.error(f"[ERROR]   delete {budget_name}: {e}")


def sync_budgets(
    region: str,
    account_id: str,
    default_limit: float = DEFAULT_BUDGET_LIMIT,
    cleanup: bool = False,
) -> None:
    """
    Sync agent budgets: create missing, optionally delete orphaned.

    For each live AgentCore runtime:
      1. Check if agent-<name> budget exists
      2. If not, get the agent-name tag and create a tag-filtered budget
      3. Attach 80% + 100% notifications to the shared SNS topic

    If cleanup=True, delete budgets for agents that no longer exist.
    """
    session = boto3.Session(region_name=region)
    agentcore = session.client("bedrock-agentcore-control", config=retry_config)
    budgets_client = session.client("budgets", config=retry_config)
    sns_client = session.client("sns", config=retry_config)

    # 1. Ensure shared SNS topic exists
    sns_topic_arn = _ensure_sns_topic(sns_client)
    logger.info(f"SNS topic: {sns_topic_arn}")

    # 2. Get live agents and existing budgets
    live_agents = _get_live_agents(agentcore)
    existing_budgets = _get_existing_budgets(budgets_client, account_id)

    logger.info(f"Live agents: {len(live_agents)}, Existing budgets: {len(existing_budgets)}")

    # 3. Create budgets for agents that don't have one
    created = 0
    for agent_name, agent_info in live_agents.items():
        budget_name = f"{BUDGET_PREFIX}{agent_name}"
        if budget_name in existing_budgets:
            continue

        # Get the agent-name tag value for cost filtering
        tag_value = _get_agent_tag_value(agentcore, agent_info["arn"])
        if not tag_value:
            logger.warning(f"[SKIP]    {agent_name} — no 'agent-name' tag, cannot create tag-filtered budget")
            continue

        _create_budget(budgets_client, account_id, agent_name, tag_value, default_limit, sns_topic_arn)
        created += 1

    # 4. Optionally clean up orphaned budgets
    deleted = 0
    if cleanup:
        live_budget_names = {f"{BUDGET_PREFIX}{name}" for name in live_agents}
        for budget_name in existing_budgets:
            if budget_name not in live_budget_names:
                _delete_budget(budgets_client, account_id, budget_name)
                deleted += 1

    logger.info(f"Done. Created: {created}, Deleted: {deleted}, Total budgets: {len(existing_budgets) + created - deleted}")


def list_budgets(region: str, account_id: str) -> None:
    """List all agent budgets with their status."""
    session = boto3.Session(region_name=region)
    budgets_client = session.client("budgets", config=retry_config)
    existing = _get_existing_budgets(budgets_client, account_id)

    if not existing:
        print("No agent budgets found.")
        return

    print(f"{'Budget Name':40s} {'Limit':>8s} {'Actual':>10s} {'Forecast':>10s} {'Status':>8s}")
    print("-" * 80)
    for name, b in sorted(existing.items()):
        limit = b["BudgetLimit"]["Amount"]
        actual = b.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", "0")
        forecast = b.get("CalculatedSpend", {}).get("ForecastedSpend", {}).get("Amount", "N/A")
        pct = float(actual) / float(limit) * 100 if float(limit) > 0 else 0
        status = "CRITICAL" if pct >= 100 else "MEDIUM" if pct >= 80 else "OK"
        print(f"{name:40s} ${float(limit):>7.2f} ${float(actual):>9.2f} {'$' + forecast if forecast != 'N/A' else 'N/A':>10s} {status:>8s}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Budget Sync CLI")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--account-id", default=None,
                       help="AWS Account ID (auto-detected via STS if not provided)")
    sub = parser.add_subparsers(dest="command")

    # sync
    s = sub.add_parser("sync", help="Sync budgets for all agents")
    s.add_argument("--default-limit", type=float, default=DEFAULT_BUDGET_LIMIT,
                   help="Default monthly budget in USD for new agents")
    s.add_argument("--cleanup", action="store_true",
                   help="Delete budgets for agents that no longer exist")

    # list
    sub.add_parser("list", help="List all agent budgets")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    # Auto-detect account ID if not provided
    if not args.account_id:
        try:
            sts = boto3.Session(region_name=args.region).client("sts")
            args.account_id = sts.get_caller_identity()["Account"]
            print(f"Auto-detected AWS Account ID: {args.account_id}")
        except Exception as e:
            print(f"ERROR: Cannot detect AWS Account ID. Provide --account-id or configure credentials: {e}")
            return

    if args.command == "sync":
        sync_budgets(args.region, args.account_id, args.default_limit, args.cleanup)
    elif args.command == "list":
        list_budgets(args.region, args.account_id)


if __name__ == "__main__":
    main()
