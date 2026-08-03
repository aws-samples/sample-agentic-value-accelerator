"""
Lambda handler for the Spend Aggregator scheduled task.

Triggered by an EventBridge rule every 5 minutes. Runs the full aggregation
cycle: pulls spend data from LiteLLM for the current UTC day, aggregates it,
writes full-day totals to the FinOps DynamoDB table using idempotent PutItem
operations, and emits a CloudWatch metric for records synced.

By aggregating the full day on each invocation, writes are naturally
idempotent — retries produce the same result without double-counting.

Environment variables:
- LITELLM_GATEWAY_URL: LiteLLM gateway base URL (e.g., "http://gateway.internal:4000")
- LITELLM_MASTER_KEY: LiteLLM admin/primary key for API authentication
- FINOPS_TABLE_NAME: DynamoDB table name for the Govern FinOps data store
- AWS_REGION: AWS region for CloudWatch and DynamoDB calls

Task: 10.3
Requirements: 10.1, 10.5
"""

import json
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

import boto3

from services.spend_aggregator import (
    AggregatedSpend,
    SpendAggregator,
    SpendAggregatorError,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Environment variable keys
ENV_GATEWAY_URL = "LITELLM_GATEWAY_URL"
ENV_MASTER_KEY = "LITELLM_MASTER_KEY"
ENV_FINOPS_TABLE = "FINOPS_TABLE_NAME"
ENV_AWS_REGION = "AWS_REGION"

# CloudWatch metric configuration
METRIC_NAMESPACE = "AVA/Gateway"
METRIC_NAME_RECORDS_SYNCED = "spend_records_synced"

# DynamoDB key for storing the last sync timestamp
SYNC_STATE_PK = "SYNC_STATE#spend_aggregator"
SYNC_STATE_SK = "LAST_RUN"

# Default lookback window for spend data pull (6 minutes as safety buffer)
DEFAULT_LOOKBACK_MINUTES = 6


def _get_required_env(name: str) -> str:
    """Get a required environment variable or raise."""
    value = os.environ.get(name)
    if not value:
        raise EnvironmentError(f"Required environment variable '{name}' is not set")
    return value


def _emit_metric(cloudwatch_client: Any, records_synced: int) -> None:
    """Emit the spend_records_synced CloudWatch metric.

    Args:
        cloudwatch_client: boto3 CloudWatch client.
        records_synced: Number of aggregated records written this cycle.
    """
    cloudwatch_client.put_metric_data(
        Namespace=METRIC_NAMESPACE,
        MetricData=[
            {
                "MetricName": METRIC_NAME_RECORDS_SYNCED,
                "Value": records_synced,
                "Unit": "Count",
                "Timestamp": datetime.now(timezone.utc),
                "Dimensions": [
                    {
                        "Name": "Service",
                        "Value": "SpendAggregator",
                    },
                ],
            }
        ],
    )
    logger.info(
        "Emitted CloudWatch metric %s=%d", METRIC_NAME_RECORDS_SYNCED, records_synced
    )


def _get_last_sync_timestamp(table: Any) -> Optional[datetime]:
    """Load last_sync_timestamp from DynamoDB.

    Args:
        table: boto3 DynamoDB Table resource.

    Returns:
        The last sync datetime, or None if not previously stored.
    """
    try:
        response = table.get_item(
            Key={"pk": SYNC_STATE_PK, "sk": SYNC_STATE_SK}
        )
        item = response.get("Item")
        if item and "last_sync_timestamp" in item:
            return datetime.fromisoformat(item["last_sync_timestamp"])
    except Exception as e:
        logger.warning("Could not load last_sync_timestamp: %s", str(e))
    return None


def _save_last_sync_timestamp(table: Any, timestamp: datetime) -> None:
    """Save last_sync_timestamp to DynamoDB.

    Args:
        table: boto3 DynamoDB Table resource.
        timestamp: The timestamp to save.
    """
    try:
        table.put_item(
            Item={
                "pk": SYNC_STATE_PK,
                "sk": SYNC_STATE_SK,
                "last_sync_timestamp": timestamp.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        logger.warning("Could not save last_sync_timestamp: %s", str(e))


def _write_to_dynamodb_idempotent(
    table: Any,
    aggregated: AggregatedSpend,
) -> int:
    """Write aggregated spend records to DynamoDB using idempotent PutItem.

    Since we aggregate the full current day on each invocation, writing the
    daily total via PutItem is naturally idempotent — the same day always
    produces the same result regardless of how many times the Lambda runs.

    Args:
        table: boto3 DynamoDB Table resource.
        aggregated: The aggregated spend records to write.

    Returns:
        Number of records written.
    """
    records_written = 0

    for record in aggregated.records:
        pk = f"SPEND#{record.use_case}#{record.date}"
        sk = f"MODEL#{record.model}"

        try:
            table.put_item(
                Item={
                    "pk": pk,
                    "sk": sk,
                    "use_case_id": record.use_case,
                    "team_id": record.team,
                    "model_id": record.model,
                    "period": record.period,
                    "date": record.date,
                    "input_tokens": record.input_tokens,
                    "output_tokens": record.output_tokens,
                    "request_count": record.request_count,
                    "total_cost_usd": Decimal(str(record.total_cost_usd)),
                    "last_updated": record.last_updated,
                },
            )
            records_written += 1
        except Exception as e:
            logger.error(
                "Failed to write DynamoDB item pk=%s sk=%s: %s", pk, sk, str(e)
            )

    logger.info("Wrote %d aggregated records to DynamoDB (idempotent PutItem)", records_written)
    return records_written


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for EventBridge-triggered Spend Aggregation.

    Performs the full aggregation cycle:
    1. Load last_sync_timestamp from DynamoDB (or fall back to 6-min lookback)
    2. Pull spend data from LiteLLM /spend/logs since last sync
    3. Aggregate by (use_case, team, model, period)
    4. Write aggregated records to DynamoDB using additive updates
    5. Save current timestamp as last_sync_timestamp
    6. Emit CloudWatch metric: spend_records_synced

    Args:
        event: EventBridge scheduled event payload.
        context: Lambda context object.

    Returns:
        Dict with statusCode and summary body.
    """
    start_time = time.time()
    logger.info("Spend Aggregator Lambda triggered. Event: %s", json.dumps(event))

    # Load configuration from environment
    try:
        gateway_url = _get_required_env(ENV_GATEWAY_URL)
        master_key = _get_required_env(ENV_MASTER_KEY)
        finops_table = _get_required_env(ENV_FINOPS_TABLE)
    except EnvironmentError as e:
        logger.error("Configuration error: %s", str(e))
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "message": "Configuration error",
                    "error": str(e),
                }
            ),
        }
    region = os.environ.get(ENV_AWS_REGION, os.environ.get("AVA_AWS_REGION", "us-east-2"))

    # Initialize AWS clients
    cloudwatch_client = boto3.client("cloudwatch", region_name=region)
    dynamodb_resource = boto3.resource("dynamodb", region_name=region)
    table = dynamodb_resource.Table(finops_table)

    # Initialize Spend Aggregator
    aggregator = SpendAggregator(
        gateway_url=gateway_url,
        master_key=master_key,
    )

    # Determine lookback: use start of current UTC day for idempotent full-day aggregation.
    # By always aggregating the full day, writes are idempotent (PutItem with same
    # day total regardless of retry). This eliminates double-counting from additive updates.
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    logger.info("Using start-of-day aggregation for idempotent writes: %s", since.isoformat())

    current_time = datetime.now(timezone.utc)

    try:
        # Step 1: Pull spend data since last sync
        logger.info("Pulling spend data since %s", since.isoformat())
        raw_records = aggregator.pull_spend_data(since=since)
        logger.info("Pulled %d raw spend records", len(raw_records))

        # Step 2: Aggregate
        if raw_records:
            aggregated = aggregator.aggregate(records=raw_records, periods=["daily"])
            logger.info(
                "Aggregated into %d records", len(aggregated.records)
            )

            # Step 3: Write to DynamoDB with idempotent PutItem (full-day aggregate)
            records_synced = _write_to_dynamodb_idempotent(
                table=table,
                aggregated=aggregated,
            )
        else:
            records_synced = 0
            logger.info("No new spend records to aggregate")

        # Step 4: Save last_sync_timestamp only after successful writes
        if records_synced == len(aggregated.records) if raw_records else True:
            _save_last_sync_timestamp(table, current_time)
        else:
            logger.warning(
                "Not all records written successfully (%d/%d), skipping timestamp update",
                records_synced,
                len(aggregated.records) if raw_records else 0,
            )

        # Step 5: Emit CloudWatch metric
        _emit_metric(cloudwatch_client, records_synced)

        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "Spend aggregation cycle completed: %d records synced in %dms",
            records_synced,
            elapsed_ms,
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Spend aggregation cycle completed",
                    "records_synced": records_synced,
                    "raw_records_pulled": len(raw_records),
                    "elapsed_ms": elapsed_ms,
                }
            ),
        }

    except SpendAggregatorError as e:
        logger.error("Spend aggregation failed: %s", str(e))
        # Emit zero metric on failure so monitoring tracks gaps
        _emit_metric(cloudwatch_client, 0)
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "message": "Spend aggregation failed",
                    "error": str(e),
                }
            ),
        }
    except Exception as e:
        logger.error("Unexpected error in spend aggregation: %s", str(e), exc_info=True)
        # Emit zero metric on failure
        try:
            _emit_metric(cloudwatch_client, 0)
        except Exception:
            pass  # Don't fail on metric emission failure
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "message": "Unexpected error in spend aggregation",
                    "error": str(e),
                }
            ),
        }
