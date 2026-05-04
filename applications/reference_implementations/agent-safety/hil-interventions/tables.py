"""
Create DynamoDB tables for the Agent Safety Controls system.
All tables are independent — create any subset you need.

Usage:
    python tables.py --region us-east-1
    python tables.py --region us-east-1 --table agent-registry
    python tables.py --region us-east-1 --table all

Tables:
    1. agent-registry          — Central registry of all agents, their config, and status
    2. session-token-usage     — Live token tracking per session
    3. intervention-log        — Audit trail of all stop/revoke/scp actions
    4. eval-baselines          — Evaluation baselines per agent type
    5. alert-dedup             — Short-lived deduplication for alert storms
    6. cost-signals            — Per-agent cost data from AWS Budgets (synced)
    7. observability-signals   — Per-agent obs metrics from CloudWatch (synced)
    8. evaluation-signals      — Per-agent eval scores from AgentCore Evaluations (synced)
"""

import argparse
import boto3
from botocore.exceptions import ClientError


TABLE_DEFINITIONS: dict[str, dict] = {
    "agent-registry": {
        "TableName": "agent-registry",
        "KeySchema": [
            {"AttributeName": "agent_name", "KeyType": "HASH"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "agent_name", "AttributeType": "S"},
            {"AttributeName": "team", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "team-index",
                "KeySchema": [
                    {"AttributeName": "team", "KeyType": "HASH"},
                    {"AttributeName": "agent_name", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "status-index",
                "KeySchema": [
                    {"AttributeName": "status", "KeyType": "HASH"},
                    {"AttributeName": "agent_name", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
    },
    "session-token-usage": {
        "TableName": "session-token-usage",
        "KeySchema": [
            {"AttributeName": "session_id", "KeyType": "HASH"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "session_id", "AttributeType": "S"},
            {"AttributeName": "agent_name", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "agent-index",
                "KeySchema": [
                    {"AttributeName": "agent_name", "KeyType": "HASH"},
                    {"AttributeName": "session_id", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
        # TTL enabled on 'expires_at' field — set in application code
    },
    "intervention-log": {
        "TableName": "intervention-log",
        "KeySchema": [
            {"AttributeName": "intervention_id", "KeyType": "HASH"},
            {"AttributeName": "timestamp", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "intervention_id", "AttributeType": "S"},
            {"AttributeName": "timestamp", "AttributeType": "S"},
            {"AttributeName": "agent_name", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "agent-index",
                "KeySchema": [
                    {"AttributeName": "agent_name", "KeyType": "HASH"},
                    {"AttributeName": "timestamp", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
    },
    "eval-baselines": {
        "TableName": "eval-baselines",
        "KeySchema": [
            {"AttributeName": "agent_type", "KeyType": "HASH"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "agent_type", "AttributeType": "S"},
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
    },
    "alert-dedup": {
        "TableName": "alert-dedup",
        "KeySchema": [
            {"AttributeName": "dedup_key", "KeyType": "HASH"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "dedup_key", "AttributeType": "S"},
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
        # TTL enabled on 'expires_at' field — 5 min default
    },
    "cost-signals": {
        "TableName": "cost-signals",
        "KeySchema": [
            {"AttributeName": "agent_name", "KeyType": "HASH"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "agent_name", "AttributeType": "S"},
            {"AttributeName": "severity", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "severity-index",
                "KeySchema": [
                    {"AttributeName": "severity", "KeyType": "HASH"},
                    {"AttributeName": "agent_name", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
        # TTL on 'expires_at' — signals refreshed by sync
    },
    "observability-signals": {
        "TableName": "observability-signals",
        "KeySchema": [
            {"AttributeName": "agent_name", "KeyType": "HASH"},
            {"AttributeName": "signal_key", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "agent_name", "AttributeType": "S"},
            {"AttributeName": "signal_key", "AttributeType": "S"},
            {"AttributeName": "severity", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "severity-index",
                "KeySchema": [
                    {"AttributeName": "severity", "KeyType": "HASH"},
                    {"AttributeName": "agent_name", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
        # TTL on 'expires_at' — signals refreshed by sync
    },
    "evaluation-signals": {
        "TableName": "evaluation-signals",
        "KeySchema": [
            {"AttributeName": "agent_name", "KeyType": "HASH"},
            {"AttributeName": "signal_key", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "agent_name", "AttributeType": "S"},
            {"AttributeName": "signal_key", "AttributeType": "S"},
            {"AttributeName": "severity", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "severity-index",
                "KeySchema": [
                    {"AttributeName": "severity", "KeyType": "HASH"},
                    {"AttributeName": "agent_name", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        "BillingMode": "PAY_PER_REQUEST",
        "Tags": [{"Key": "component", "Value": "agent-safety"}],
        # TTL on 'expires_at' — signals refreshed by sync
    },
}


def create_table(dynamodb, table_def: dict) -> None:
    """Create a single DynamoDB table if it doesn't exist."""
    table_name = table_def["TableName"]
    try:
        # Separate GSI from create params (needs special handling)
        create_params = {k: v for k, v in table_def.items()}
        dynamodb.create_table(**create_params)
        print(f"[OK] Created table: {table_name}")

        # Enable TTL for tables that need it
        if table_name in ("session-token-usage", "alert-dedup",
                          "cost-signals", "observability-signals", "evaluation-signals"):
            waiter = dynamodb.get_waiter("table_exists")
            waiter.wait(TableName=table_name)
            dynamodb.update_time_to_live(
                TableName=table_name,
                TimeToLiveSpecification={
                    "Enabled": True,
                    "AttributeName": "expires_at",
                },
            )
            print(f"     TTL enabled on 'expires_at' for {table_name}")

    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceInUseException":
            print(f"[--] Table already exists: {table_name}")
        else:
            raise


def create_tables(region: str, table_filter: str = "all") -> None:
    """Create DynamoDB tables."""
    dynamodb = boto3.client("dynamodb", region_name=region)

    if table_filter == "all":
        tables_to_create = TABLE_DEFINITIONS
    elif table_filter in TABLE_DEFINITIONS:
        tables_to_create = {table_filter: TABLE_DEFINITIONS[table_filter]}
    else:
        print(f"[ERROR] Unknown table: {table_filter}")
        print(f"        Available: {', '.join(TABLE_DEFINITIONS.keys())}")
        return

    for name, definition in tables_to_create.items():
        create_table(dynamodb, definition)

    print(f"\nDone. {len(tables_to_create)} table(s) processed in {region}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create DynamoDB tables for Agent Safety")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--table", default="all", help="Table name or 'all'")
    args = parser.parse_args()
    create_tables(args.region, args.table)
