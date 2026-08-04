"""
Spend Aggregator service for the Govern FinOps module.

Pulls raw spend data from LiteLLM's /spend/logs API, aggregates it by
multiple dimensions (use_case, team, model, time_period), calculates
precise cost attribution, and prepares aggregated records for the
Govern FinOps data store (DynamoDB).

Key features:
- Pulls spend logs from LiteLLM GET /spend/logs with start_date filtering
- Aggregates by (use_case, team, model, period) with sum of costs/tokens/requests
- Cost calculation: (input_tokens × input_cost_per_token) + (output_tokens × output_cost_per_token)
- Financial-grade precision: 6 decimal places for all cost calculations
- Runs on a 5-minute schedule (triggered by EventBridge)
- Feeds aggregated data into DynamoDB for the FinOps dashboard
- Idempotent writes with deduplication key = use_case + model + date
- Retry with exponential backoff (up to 10 minutes) when data unavailable
- Tracks last_sync_timestamp for incremental pulls
"""

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Supported aggregation time periods
AGGREGATION_PERIODS = ("hourly", "daily", "weekly", "monthly")

# Decimal precision for cost calculations (6 decimal places)
COST_PRECISION = Decimal("0.000001")


@dataclass
class SpendRecord:
    """A single raw spend log record from LiteLLM.

    Attributes:
        request_id: Unique identifier for the request.
        use_case: The use case identifier (from virtual key metadata).
        team: The team identifier (from virtual key metadata).
        model: The model identifier used for the request.
        input_tokens: Number of input/prompt tokens consumed.
        output_tokens: Number of output/completion tokens consumed.
        input_cost_per_token: Cost per input token in USD.
        output_cost_per_token: Cost per output token in USD.
        total_cost: Pre-computed total cost (if available from LiteLLM).
        timestamp: When the request was made (UTC).
        latency_ms: Request latency in milliseconds.
    """

    request_id: str
    use_case: str
    team: str
    model: str
    input_tokens: int
    output_tokens: int
    input_cost_per_token: float
    output_cost_per_token: float
    total_cost: float
    timestamp: datetime
    latency_ms: float = 0.0


@dataclass
class AggregatedSpendRecord:
    """A single aggregated spend record for the FinOps data store.

    Represents the sum of spend for a specific (use_case, team, model, period, date)
    combination.

    Attributes:
        use_case: The use case identifier.
        team: The team identifier.
        model: The model identifier.
        period: The aggregation period (hourly, daily, weekly, monthly).
        date: The date/period key for this aggregation bucket.
        total_cost_usd: Total cost in USD (6 decimal precision).
        input_tokens: Total input tokens consumed.
        output_tokens: Total output tokens consumed.
        request_count: Number of requests in this bucket.
        avg_latency_ms: Average latency in milliseconds.
        last_updated: When this record was last updated (UTC ISO format).
    """

    use_case: str
    team: str
    model: str
    period: str
    date: str
    total_cost_usd: float
    input_tokens: int
    output_tokens: int
    request_count: int
    avg_latency_ms: float
    last_updated: str


@dataclass
class AggregatedSpend:
    """Container for all aggregated spend records.

    Attributes:
        records: List of aggregated spend records.
        source_record_count: Number of raw records that were aggregated.
        aggregation_timestamp: When the aggregation was performed (UTC ISO).
    """

    records: List[AggregatedSpendRecord] = field(default_factory=list)
    source_record_count: int = 0
    aggregation_timestamp: str = ""


class SpendAggregatorError(Exception):
    """Raised when spend aggregation encounters an unrecoverable error."""

    pass


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    input_cost_per_token: float,
    output_cost_per_token: float,
) -> float:
    """Calculate the total cost for a request with 6 decimal precision.

    Uses Python's Decimal type for precise financial calculations, avoiding
    floating-point rounding errors.

    Formula: (input_tokens × input_cost_per_token) + (output_tokens × output_cost_per_token)

    Args:
        input_tokens: Number of input/prompt tokens.
        output_tokens: Number of output/completion tokens.
        input_cost_per_token: Cost per input token in USD.
        output_cost_per_token: Cost per output token in USD.

    Returns:
        Total cost in USD, rounded to 6 decimal places.
    """
    input_cost = Decimal(str(input_tokens)) * Decimal(str(input_cost_per_token))
    output_cost = Decimal(str(output_tokens)) * Decimal(str(output_cost_per_token))
    total = (input_cost + output_cost).quantize(COST_PRECISION, rounding=ROUND_HALF_UP)
    return float(total)


def _get_period_key(timestamp: datetime, period: str) -> str:
    """Derive the period key for a timestamp given an aggregation period.

    Args:
        timestamp: The UTC datetime to derive the period key from.
        period: The aggregation period ("hourly", "daily", "weekly", "monthly").

    Returns:
        A string representing the period bucket (e.g., "2025-06-15" for daily).

    Raises:
        ValueError: If the period is not supported.
    """
    if period == "hourly":
        return timestamp.strftime("%Y-%m-%dT%H:00:00Z")
    elif period == "daily":
        return timestamp.strftime("%Y-%m-%d")
    elif period == "weekly":
        # Use ISO week number: YYYY-Www
        return timestamp.strftime("%G-W%V")
    elif period == "monthly":
        return timestamp.strftime("%Y-%m")
    else:
        raise ValueError(
            f"Unsupported aggregation period '{period}'. "
            f"Supported periods: {AGGREGATION_PERIODS}"
        )


class SpendAggregator:
    """Pulls spend data from LiteLLM and aggregates for the FinOps module.

    This service:
    1. Pulls raw spend logs from LiteLLM GET /spend/logs
    2. Aggregates by (use_case, team, model, time_period)
    3. Calculates costs with 6 decimal precision
    4. Produces AggregatedSpend ready for the FinOps data store writer
    """

    def __init__(
        self,
        gateway_url: str,
        master_key: str,
        http_session: Optional[requests.Session] = None,
        request_timeout: int = 30,
    ):
        """Initialize the Spend Aggregator.

        Args:
            gateway_url: The LiteLLM gateway base URL (e.g., "https://gateway.internal:4000").
            master_key: The LiteLLM master/admin key for authenticating API calls.
            http_session: Optional requests.Session for HTTP calls (created if not provided).
            request_timeout: HTTP request timeout in seconds (default: 30).
        """
        self._gateway_url = gateway_url.rstrip("/")
        self._master_key = master_key
        self._http_session = http_session
        self._request_timeout = request_timeout

    @property
    def http_session(self) -> requests.Session:
        """Lazily create HTTP session if not injected."""
        if self._http_session is None:
            self._http_session = requests.Session()
        return self._http_session

    def pull_spend_data(self, since: datetime) -> List[SpendRecord]:
        """Pull raw spend logs from LiteLLM GET /spend/logs API.

        Calls the LiteLLM /spend/logs endpoint with a start_date parameter
        to fetch all spend records since the given timestamp.

        Args:
            since: The start datetime (UTC) to pull records from.

        Returns:
            List of SpendRecord objects parsed from the API response.

        Raises:
            SpendAggregatorError: If the API call fails.
        """
        url = f"{self._gateway_url}/spend/logs"
        headers = {
            "Authorization": f"Bearer {self._master_key}",
            "Content-Type": "application/json",
        }
        params = {
            "start_date": since.strftime("%Y-%m-%d %H:%M:%S"),
        }

        try:
            response = self.http_session.get(
                url,
                headers=headers,
                params=params,
                timeout=self._request_timeout,
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as e:
            raise SpendAggregatorError(
                f"Failed to pull spend data from LiteLLM API: {e}"
            )
        except ValueError as e:
            raise SpendAggregatorError(
                f"Failed to parse spend data response: {e}"
            )

        # Parse raw API response into SpendRecord objects
        records = self._parse_spend_logs(data)

        logger.info(
            "Pulled %d spend records from LiteLLM since %s",
            len(records),
            since.isoformat(),
        )

        return records

    def aggregate(
        self,
        records: List[SpendRecord],
        periods: Optional[List[str]] = None,
    ) -> AggregatedSpend:
        """Aggregate raw spend records by (use_case, team, model, period).

        Groups records into buckets keyed by (use_case, team, model, period_key)
        and sums costs, tokens, and request counts within each bucket. Cost
        calculations use 6 decimal precision.

        Args:
            records: List of raw SpendRecord objects to aggregate.
            periods: List of aggregation periods to generate. Defaults to all
                     supported periods: ["hourly", "daily", "weekly", "monthly"].

        Returns:
            AggregatedSpend containing all aggregated records.
        """
        if periods is None:
            periods = list(AGGREGATION_PERIODS)

        aggregation_timestamp = datetime.now(timezone.utc).isoformat()
        aggregated_records: List[AggregatedSpendRecord] = []

        for period in periods:
            # Group records by (use_case, team, model, period_key)
            buckets: Dict[tuple, Dict[str, Any]] = defaultdict(
                lambda: {
                    "total_cost": Decimal("0"),
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "request_count": 0,
                    "total_latency_ms": 0.0,
                }
            )

            for record in records:
                period_key = _get_period_key(record.timestamp, period)
                bucket_key = (record.use_case, record.team, record.model, period_key)

                bucket = buckets[bucket_key]

                # Calculate cost with precision
                cost = Decimal(str(calculate_cost(
                    input_tokens=record.input_tokens,
                    output_tokens=record.output_tokens,
                    input_cost_per_token=record.input_cost_per_token,
                    output_cost_per_token=record.output_cost_per_token,
                )))

                bucket["total_cost"] += cost
                bucket["input_tokens"] += record.input_tokens
                bucket["output_tokens"] += record.output_tokens
                bucket["request_count"] += 1
                bucket["total_latency_ms"] += record.latency_ms

            # Convert buckets to AggregatedSpendRecord objects
            for (use_case, team, model, period_key), bucket in buckets.items():
                request_count = bucket["request_count"]
                avg_latency = (
                    bucket["total_latency_ms"] / request_count
                    if request_count > 0
                    else 0.0
                )

                # Round total cost to 6 decimal places
                total_cost = float(
                    bucket["total_cost"].quantize(
                        COST_PRECISION, rounding=ROUND_HALF_UP
                    )
                )

                aggregated_records.append(
                    AggregatedSpendRecord(
                        use_case=use_case,
                        team=team,
                        model=model,
                        period=period,
                        date=period_key,
                        total_cost_usd=total_cost,
                        input_tokens=bucket["input_tokens"],
                        output_tokens=bucket["output_tokens"],
                        request_count=request_count,
                        avg_latency_ms=round(avg_latency, 2),
                        last_updated=aggregation_timestamp,
                    )
                )

        logger.info(
            "Aggregated %d raw records into %d aggregated records across %d period(s)",
            len(records),
            len(aggregated_records),
            len(periods),
        )

        return AggregatedSpend(
            records=aggregated_records,
            source_record_count=len(records),
            aggregation_timestamp=aggregation_timestamp,
        )

    def _parse_spend_logs(self, data: Any) -> List[SpendRecord]:
        """Parse the raw LiteLLM /spend/logs response into SpendRecord objects.

        Handles the LiteLLM API response format where each log entry contains
        token counts, model info, timing, and virtual key metadata.

        Args:
            data: The JSON response from the /spend/logs API (list of dicts).

        Returns:
            List of parsed SpendRecord objects.
        """
        if not isinstance(data, list):
            # Handle case where response might be wrapped in an object
            data = data.get("logs", []) if isinstance(data, dict) else []

        records: List[SpendRecord] = []

        for entry in data:
            try:
                record = self._parse_single_log_entry(entry)
                if record is not None:
                    records.append(record)
            except (KeyError, ValueError, TypeError) as e:
                logger.warning(
                    "Skipping malformed spend log entry: %s (error: %s)",
                    entry.get("request_id", "unknown"),
                    str(e),
                )

        return records

    def _parse_single_log_entry(self, entry: Dict[str, Any]) -> Optional[SpendRecord]:
        """Parse a single spend log entry from the LiteLLM API response.

        Args:
            entry: A single log entry dictionary from the API response.

        Returns:
            A SpendRecord if parsing is successful, None if the entry
            should be skipped (e.g., missing required fields).
        """
        # Extract metadata from the virtual key
        metadata = entry.get("metadata") or {}
        use_case = metadata.get("use_case", "unknown")
        team = metadata.get("team", "unknown")

        # Parse timestamp
        timestamp_str = entry.get("startTime") or entry.get("start_time") or entry.get("timestamp")
        if timestamp_str is None:
            logger.warning(
                "Skipping entry with no timestamp: request_id=%s",
                entry.get("request_id", "unknown"),
            )
            return None

        if isinstance(timestamp_str, str):
            # Handle various timestamp formats from LiteLLM
            try:
                timestamp = datetime.fromisoformat(
                    timestamp_str.replace("Z", "+00:00")
                )
            except ValueError:
                timestamp = datetime.strptime(
                    timestamp_str, "%Y-%m-%d %H:%M:%S"
                ).replace(tzinfo=timezone.utc)
        elif isinstance(timestamp_str, datetime):
            timestamp = timestamp_str
        else:
            return None

        # Ensure timezone-aware
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        # Extract token counts
        input_tokens = int(entry.get("prompt_tokens", 0) or entry.get("input_tokens", 0) or 0)
        output_tokens = int(entry.get("completion_tokens", 0) or entry.get("output_tokens", 0) or 0)

        # Extract model info and pricing
        model = entry.get("model", "unknown")
        model_info = entry.get("model_info") or {}
        input_cost_per_token = float(
            entry.get("input_cost_per_token")
            or model_info.get("input_cost_per_token", 0.0)
            or 0.0
        )
        output_cost_per_token = float(
            entry.get("output_cost_per_token")
            or model_info.get("output_cost_per_token", 0.0)
            or 0.0
        )

        # Total cost: use pre-computed if available, otherwise calculate
        total_cost = entry.get("spend") or entry.get("total_cost")
        if total_cost is not None:
            total_cost = float(total_cost)
        else:
            total_cost = calculate_cost(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                input_cost_per_token=input_cost_per_token,
                output_cost_per_token=output_cost_per_token,
            )

        # Extract latency
        latency_ms = float(entry.get("latency_ms", 0.0) or entry.get("response_time_ms", 0.0) or 0.0)

        return SpendRecord(
            request_id=entry.get("request_id", "unknown"),
            use_case=use_case,
            team=team,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_cost_per_token=input_cost_per_token,
            output_cost_per_token=output_cost_per_token,
            total_cost=total_cost,
            timestamp=timestamp,
            latency_ms=latency_ms,
        )


# =============================================================================
# FinOps Data Store Writer
# =============================================================================

# Retry configuration for spend data unavailability
MAX_RETRY_DURATION_SECONDS = 600  # 10 minutes
INITIAL_BACKOFF_SECONDS = 5
MAX_BACKOFF_SECONDS = 60
BACKOFF_MULTIPLIER = 2

# DynamoDB batch write limits
DYNAMODB_BATCH_SIZE = 25  # DynamoDB BatchWriteItem max per request


class FinOpsWriteError(Exception):
    """Raised when writing to the FinOps data store fails after exhausting retries."""

    pass


class FinOpsDataStoreWriter:
    """Writes aggregated spend records to the Govern FinOps DynamoDB data store.

    Implements:
    - Idempotent writes with deduplication key = use_case + model + date
    - Mapping from LiteLLM cost data to AVA's FinOps schema
    - Retry with exponential backoff (up to 10 minutes) when data unavailable
    - Tracking of last_sync_timestamp for incremental pulls

    The DynamoDB schema uses:
        pk: "SPEND#<use_case>#<date>"
        sk: "MODEL#<model_id>"

    Deduplication is inherent: writing the same (use_case, model, date) combination
    overwrites the previous record with identical data (put_item is idempotent).
    """

    def __init__(
        self,
        table_name: str,
        region: str = "us-east-1",
        dynamodb_resource: Optional[Any] = None,
        cloudwatch_client: Optional[Any] = None,
    ):
        """Initialize the FinOps data store writer.

        Args:
            table_name: The DynamoDB table name for FinOps spend data.
            region: AWS region for DynamoDB.
            dynamodb_resource: Optional boto3 DynamoDB resource (for testing).
            cloudwatch_client: Optional boto3 CloudWatch client (for testing).
        """
        self._table_name = table_name
        self._region = region

        if dynamodb_resource is not None:
            self._dynamodb = dynamodb_resource
        else:
            self._dynamodb = boto3.resource("dynamodb", region_name=region)

        self._table = self._dynamodb.Table(table_name)

        if cloudwatch_client is not None:
            self._cloudwatch = cloudwatch_client
        else:
            self._cloudwatch = boto3.client("cloudwatch", region_name=region)

        # Track last sync timestamp for incremental pulls
        self._last_sync_timestamp: Optional[datetime] = None

    @property
    def last_sync_timestamp(self) -> Optional[datetime]:
        """Return the last successful sync timestamp."""
        return self._last_sync_timestamp

    @last_sync_timestamp.setter
    def last_sync_timestamp(self, value: Optional[datetime]) -> None:
        """Set the last sync timestamp."""
        self._last_sync_timestamp = value

    def write_to_finops(self, aggregated: AggregatedSpend) -> int:
        """Write aggregated spend records to the Govern FinOps DynamoDB data store.

        Writes are idempotent: the deduplication key (use_case + model + date) ensures
        that writing the same batch twice produces the same final state. Uses DynamoDB
        put_item which naturally overwrites existing items with the same key.

        Implements retry with exponential backoff (up to 10 minutes) if the DynamoDB
        write fails due to transient errors (throttling, service unavailable).

        Args:
            aggregated: The AggregatedSpend object containing records to write.

        Returns:
            The number of records successfully written.

        Raises:
            FinOpsWriteError: If all retries are exhausted after 10 minutes.
        """
        if not aggregated.records:
            logger.info("No aggregated spend records to write")
            return 0

        records_written = 0
        failed_records: List[AggregatedSpendRecord] = []

        # Process records in batches
        batches = self._batch_records(aggregated.records)

        for batch in batches:
            written, failures = self._write_batch_with_retry(batch)
            records_written += written
            failed_records.extend(failures)

        # Update last_sync_timestamp on success
        if records_written > 0:
            self._last_sync_timestamp = datetime.now(timezone.utc)

        # Emit metrics
        self._emit_sync_metrics(records_written, len(failed_records))

        if failed_records:
            logger.warning(
                "Failed to write %d records after retries. "
                "Data gap alert logged.",
                len(failed_records),
            )
            self._emit_data_gap_alert(failed_records)

            if records_written == 0:
                raise FinOpsWriteError(
                    f"Failed to write all {len(failed_records)} spend records "
                    f"after retrying for up to {MAX_RETRY_DURATION_SECONDS} seconds."
                )

        logger.info(
            "Wrote %d spend records to FinOps data store (table=%s)",
            records_written,
            self._table_name,
        )

        return records_written

    def _batch_records(
        self, records: List[AggregatedSpendRecord]
    ) -> List[List[AggregatedSpendRecord]]:
        """Split records into batches for DynamoDB batch writes.

        Args:
            records: All records to batch.

        Returns:
            List of batches, each containing up to DYNAMODB_BATCH_SIZE records.
        """
        batches = []
        for i in range(0, len(records), DYNAMODB_BATCH_SIZE):
            batches.append(records[i : i + DYNAMODB_BATCH_SIZE])
        return batches

    def _write_batch_with_retry(
        self, batch: List[AggregatedSpendRecord]
    ) -> tuple:
        """Write a batch of records with retry and exponential backoff.

        Retries on transient DynamoDB errors (throttling, service unavailable)
        for up to MAX_RETRY_DURATION_SECONDS (10 minutes).

        Args:
            batch: A batch of records to write.

        Returns:
            Tuple of (records_written_count, list_of_failed_records).
        """
        start_time = time.monotonic()
        backoff = INITIAL_BACKOFF_SECONDS
        attempt = 0

        remaining_records = list(batch)

        while remaining_records:
            elapsed = time.monotonic() - start_time
            if attempt > 0 and elapsed >= MAX_RETRY_DURATION_SECONDS:
                logger.error(
                    "Exhausted retry budget (%d seconds) for %d records. "
                    "Logging data gap alert.",
                    MAX_RETRY_DURATION_SECONDS,
                    len(remaining_records),
                )
                return (len(batch) - len(remaining_records), remaining_records)

            try:
                failed_in_batch = self._write_batch(remaining_records)
                if not failed_in_batch:
                    # All succeeded
                    return (len(batch), [])
                # Some failed (unprocessed items) — retry those
                remaining_records = failed_in_batch
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code in (
                    "ProvisionedThroughputExceededException",
                    "InternalServerError",
                    "ServiceUnavailable",
                    "ThrottlingException",
                ):
                    logger.warning(
                        "Transient DynamoDB error (attempt %d, code=%s): %s. "
                        "Retrying in %d seconds.",
                        attempt + 1,
                        error_code,
                        str(e),
                        backoff,
                    )
                else:
                    # Non-retryable error
                    logger.error(
                        "Non-retryable DynamoDB error (code=%s): %s",
                        error_code,
                        str(e),
                    )
                    return (len(batch) - len(remaining_records), remaining_records)
            except Exception as e:
                logger.error(
                    "Unexpected error writing to DynamoDB (attempt %d): %s",
                    attempt + 1,
                    str(e),
                )
                # Treat unexpected errors as non-retryable
                return (len(batch) - len(remaining_records), remaining_records)

            # Wait before retrying
            remaining_budget = MAX_RETRY_DURATION_SECONDS - (
                time.monotonic() - start_time
            )
            sleep_time = min(backoff, remaining_budget, MAX_BACKOFF_SECONDS)
            if sleep_time <= 0:
                return (len(batch) - len(remaining_records), remaining_records)

            time.sleep(sleep_time)
            backoff = min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF_SECONDS)
            attempt += 1

        return (len(batch), [])

    def _write_batch(
        self, records: List[AggregatedSpendRecord]
    ) -> List[AggregatedSpendRecord]:
        """Write a batch of records to DynamoDB using batch_write_item.

        Args:
            records: Records to write (max 25).

        Returns:
            List of records that failed to write (unprocessed items).
        """
        request_items = []
        for record in records:
            item = self._to_dynamo_item(record)
            request_items.append({"PutRequest": {"Item": item}})

        response = self._table.meta.client.batch_write_item(
            RequestItems={self._table_name: request_items}
        )

        # Check for unprocessed items
        unprocessed = response.get("UnprocessedItems", {}).get(self._table_name, [])
        if not unprocessed:
            return []

        # Map unprocessed items back to records
        # Build a lookup from (pk, sk) -> record
        key_to_record = {}
        for record in records:
            pk = f"SPEND#{record.use_case}#{record.date}"
            sk = f"MODEL#{record.model}"
            key_to_record[(pk, sk)] = record

        failed_records = []
        for item in unprocessed:
            put_item = item.get("PutRequest", {}).get("Item", {})
            pk = put_item.get("pk", "")
            sk = put_item.get("sk", "")
            record = key_to_record.get((pk, sk))
            if record:
                failed_records.append(record)

        return failed_records

    def _to_dynamo_item(self, record: AggregatedSpendRecord) -> Dict[str, Any]:
        """Map an AggregatedSpendRecord to the AVA FinOps DynamoDB schema.

        Uses the deduplication key pattern:
            pk: "SPEND#<use_case>#<date>"
            sk: "MODEL#<model>"

        Writing the same (use_case, model, date) combination produces an
        identical item — achieving idempotent writes via natural DynamoDB
        put_item behavior.

        Args:
            record: The aggregated spend record to map.

        Returns:
            A DynamoDB item dict conforming to the FinOps schema.
        """
        return {
            "pk": f"SPEND#{record.use_case}#{record.date}",
            "sk": f"MODEL#{record.model}",
            "use_case_id": record.use_case,
            "team_id": record.team,
            "model_id": record.model,
            "period": record.period,
            "date": record.date,
            "total_cost_usd": Decimal(str(record.total_cost_usd)),
            "input_tokens": record.input_tokens,
            "output_tokens": record.output_tokens,
            "request_count": record.request_count,
            "avg_latency_ms": Decimal(str(record.avg_latency_ms)),
            "last_updated": record.last_updated,
        }

    def _emit_sync_metrics(self, records_written: int, records_failed: int) -> None:
        """Emit CloudWatch metrics for the sync cycle.

        Args:
            records_written: Number of records successfully written.
            records_failed: Number of records that failed to write.
        """
        try:
            self._cloudwatch.put_metric_data(
                Namespace="AVA/Gateway",
                MetricData=[
                    {
                        "MetricName": "spend_records_synced",
                        "Value": records_written,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "Service", "Value": "SpendAggregator"},
                        ],
                    },
                    {
                        "MetricName": "spend_records_failed",
                        "Value": records_failed,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "Service", "Value": "SpendAggregator"},
                        ],
                    },
                ],
            )
        except Exception as e:
            logger.warning("Failed to emit CloudWatch metrics: %s", str(e))

    def _emit_data_gap_alert(self, failed_records: List[AggregatedSpendRecord]) -> None:
        """Emit a CloudWatch alarm/metric for a spend data gap.

        Called when records fail to write after exhausting retries, indicating
        a gap in the FinOps data that requires investigation.

        Args:
            failed_records: The records that could not be written.
        """
        try:
            self._cloudwatch.put_metric_data(
                Namespace="AVA/Gateway",
                MetricData=[
                    {
                        "MetricName": "spend_data_gap",
                        "Value": 1,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "Service", "Value": "SpendAggregator"},
                        ],
                    },
                ],
            )
            logger.error(
                "SPEND DATA GAP ALERT: %d records failed to write. "
                "Affected use cases: %s",
                len(failed_records),
                ", ".join(set(r.use_case for r in failed_records)),
            )
        except Exception as e:
            logger.warning(
                "Failed to emit data gap alert metric: %s", str(e)
            )

    def load_last_sync_timestamp(self) -> Optional[datetime]:
        """Load the last_sync_timestamp from DynamoDB for incremental pulls.

        Stored as a metadata item in the same table:
            pk: "META#SPEND_AGGREGATOR"
            sk: "LAST_SYNC"

        Returns:
            The last sync timestamp, or None if never synced.
        """
        try:
            response = self._table.get_item(
                Key={
                    "pk": "META#SPEND_AGGREGATOR",
                    "sk": "LAST_SYNC",
                }
            )
            item = response.get("Item")
            if item and "timestamp" in item:
                ts_str = item["timestamp"]
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                self._last_sync_timestamp = ts
                return ts
        except Exception as e:
            logger.warning("Failed to load last_sync_timestamp: %s", str(e))

        return None

    def save_last_sync_timestamp(self, timestamp: Optional[datetime] = None) -> None:
        """Save the last_sync_timestamp to DynamoDB for incremental pulls.

        Args:
            timestamp: The timestamp to save. Defaults to current last_sync_timestamp.
        """
        ts = timestamp or self._last_sync_timestamp
        if ts is None:
            return

        try:
            self._table.put_item(
                Item={
                    "pk": "META#SPEND_AGGREGATOR",
                    "sk": "LAST_SYNC",
                    "timestamp": ts.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            logger.info(
                "Saved last_sync_timestamp: %s", ts.isoformat()
            )
        except Exception as e:
            logger.warning("Failed to save last_sync_timestamp: %s", str(e))
