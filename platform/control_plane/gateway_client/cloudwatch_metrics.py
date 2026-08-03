"""CloudWatch metrics emission module for the AVA Gateway.

Provides a clean interface for emitting custom CloudWatch metrics to the
AVA/Gateway namespace. Supports both gateway-level metrics (requests, latency,
errors, cache) and circuit breaker metrics (state transitions, fallbacks,
recovery events).

Requirements: 9.4, 5.6
"""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import boto3

logger = logging.getLogger(__name__)

# CloudWatch namespace for all AVA Gateway metrics
METRICS_NAMESPACE = "AVA/Gateway"

# Default dimensions applied to all metrics
DEFAULT_REGION = "us-east-2"


class MetricUnit(str, Enum):
    """CloudWatch metric units."""

    COUNT = "Count"
    SECONDS = "Seconds"
    MILLISECONDS = "Milliseconds"
    PERCENT = "Percent"
    COUNT_PER_SECOND = "Count/Second"
    NONE = "None"


@dataclass
class MetricDimension:
    """A CloudWatch metric dimension (name/value pair).

    Attributes:
        name: The dimension name (e.g., "ErrorType").
        value: The dimension value (e.g., "timeout").
    """

    name: str
    value: str


@dataclass
class MetricData:
    """A single CloudWatch metric data point.

    Attributes:
        metric_name: The name of the metric.
        value: The numeric value for the metric.
        unit: The CloudWatch unit type.
        dimensions: Optional list of dimensions for the metric.
        timestamp: Optional timestamp (defaults to current time).
    """

    metric_name: str
    value: float
    unit: MetricUnit = MetricUnit.COUNT
    dimensions: List[MetricDimension] = field(default_factory=list)
    timestamp: Optional[float] = None


class GatewayMetricsEmitter:
    """Emits custom CloudWatch metrics for the AVA Gateway.

    Provides methods for emitting gateway operational metrics and circuit
    breaker metrics to the AVA/Gateway namespace.

    Args:
        cloudwatch_client: An optional boto3 CloudWatch client.
            Created lazily if not provided.
        namespace: The CloudWatch namespace. Defaults to "AVA/Gateway".
        gateway_id: An identifier for this gateway instance (used as dimension).
        aws_region: AWS region for the CloudWatch client.
    """

    def __init__(
        self,
        cloudwatch_client: Optional[Any] = None,
        namespace: str = METRICS_NAMESPACE,
        gateway_id: str = "ava-litellm",
        aws_region: str = DEFAULT_REGION,
    ):
        self._cloudwatch_client = cloudwatch_client
        self._namespace = namespace
        self._gateway_id = gateway_id
        self._aws_region = aws_region

    @property
    def namespace(self) -> str:
        """The CloudWatch namespace for metrics."""
        return self._namespace

    @property
    def gateway_id(self) -> str:
        """The gateway instance identifier."""
        return self._gateway_id

    def _get_client(self):
        """Get or lazily create the boto3 CloudWatch client."""
        if self._cloudwatch_client is None:
            self._cloudwatch_client = boto3.client(
                "cloudwatch", region_name=self._aws_region
            )
        return self._cloudwatch_client

    def emit(self, metrics: List[MetricData]) -> bool:
        """Emit one or more metric data points to CloudWatch.

        Args:
            metrics: List of MetricData objects to emit.

        Returns:
            True if the metrics were emitted successfully, False otherwise.
        """
        if not metrics:
            return True

        try:
            client = self._get_client()
            metric_data = []

            for m in metrics:
                datum: Dict[str, Any] = {
                    "MetricName": m.metric_name,
                    "Value": m.value,
                    "Unit": m.unit.value,
                }

                # Add dimensions (always include GatewayId)
                dims = [{"Name": "GatewayId", "Value": self._gateway_id}]
                for d in m.dimensions:
                    dims.append({"Name": d.name, "Value": d.value})
                datum["Dimensions"] = dims

                metric_data.append(datum)

            client.put_metric_data(
                Namespace=self._namespace,
                MetricData=metric_data,
            )
            return True

        except Exception as e:
            logger.warning("Failed to emit CloudWatch metrics: %s", e)
            return False

    # --- Gateway Operational Metrics ---

    def emit_request_metric(
        self,
        latency_ms: float,
        model: str,
        status_code: int,
        cache_hit: bool = False,
    ) -> bool:
        """Emit metrics for a single gateway request.

        Emits: requests_per_second (count), latency, error_rate_by_type,
        and cache_hit_ratio metrics.

        Args:
            latency_ms: Request latency in milliseconds.
            model: The model identifier used for the request.
            status_code: The HTTP status code of the response.
            cache_hit: Whether the response was served from cache.

        Returns:
            True if metrics were emitted successfully.
        """
        metrics: List[MetricData] = []

        # Request count (used to derive requests_per_second in CloudWatch)
        metrics.append(
            MetricData(
                metric_name="requests_per_second",
                value=1.0,
                unit=MetricUnit.COUNT,
                dimensions=[MetricDimension("Model", model)],
            )
        )

        # Latency metric
        metrics.append(
            MetricData(
                metric_name="latency_p50",
                value=latency_ms,
                unit=MetricUnit.MILLISECONDS,
                dimensions=[MetricDimension("Model", model)],
            )
        )
        metrics.append(
            MetricData(
                metric_name="latency_p95",
                value=latency_ms,
                unit=MetricUnit.MILLISECONDS,
                dimensions=[MetricDimension("Model", model)],
            )
        )
        metrics.append(
            MetricData(
                metric_name="latency_p99",
                value=latency_ms,
                unit=MetricUnit.MILLISECONDS,
                dimensions=[MetricDimension("Model", model)],
            )
        )

        # Error rate by type (only emitted when error occurs)
        if status_code >= 400:
            error_type = self._classify_error(status_code)
            metrics.append(
                MetricData(
                    metric_name="error_rate_by_type",
                    value=1.0,
                    unit=MetricUnit.COUNT,
                    dimensions=[
                        MetricDimension("ErrorType", error_type),
                        MetricDimension("Model", model),
                    ],
                )
            )

        # Cache hit/miss
        metrics.append(
            MetricData(
                metric_name="cache_hit_ratio",
                value=1.0 if cache_hit else 0.0,
                unit=MetricUnit.COUNT,
                dimensions=[MetricDimension("CacheResult", "hit" if cache_hit else "miss")],
            )
        )

        return self.emit(metrics)

    def emit_active_virtual_keys(self, count: int) -> bool:
        """Emit the number of active virtual keys.

        Args:
            count: The number of currently active virtual keys.

        Returns:
            True if the metric was emitted successfully.
        """
        return self.emit([
            MetricData(
                metric_name="active_virtual_keys",
                value=float(count),
                unit=MetricUnit.COUNT,
            )
        ])

    # --- Circuit Breaker Metrics ---

    def emit_circuit_breaker_state_transition(
        self,
        from_state: str,
        to_state: str,
    ) -> bool:
        """Emit a metric for a circuit breaker state transition.

        Args:
            from_state: The previous state (e.g., "closed", "open").
            to_state: The new state.

        Returns:
            True if the metric was emitted successfully.
        """
        return self.emit([
            MetricData(
                metric_name="circuit_breaker_state_transitions",
                value=1.0,
                unit=MetricUnit.COUNT,
                dimensions=[
                    MetricDimension("FromState", from_state),
                    MetricDimension("ToState", to_state),
                ],
            )
        ])

    def emit_fallback_activation(self, reason: str = "circuit_open") -> bool:
        """Emit a metric for a fallback activation.

        Args:
            reason: The reason for the fallback (e.g., "circuit_open", "timeout").

        Returns:
            True if the metric was emitted successfully.
        """
        return self.emit([
            MetricData(
                metric_name="fallback_activations",
                value=1.0,
                unit=MetricUnit.COUNT,
                dimensions=[MetricDimension("Reason", reason)],
            )
        ])

    def emit_gateway_recovery_event(self) -> bool:
        """Emit a metric for a gateway recovery event.

        Emitted when the circuit breaker transitions from OPEN back to CLOSED,
        indicating the gateway has recovered.

        Returns:
            True if the metric was emitted successfully.
        """
        return self.emit([
            MetricData(
                metric_name="gateway_recovery_events",
                value=1.0,
                unit=MetricUnit.COUNT,
            )
        ])

    # --- Helpers ---

    @staticmethod
    def _classify_error(status_code: int) -> str:
        """Classify an HTTP error status code into a type string.

        Args:
            status_code: The HTTP status code.

        Returns:
            A string classification of the error type.
        """
        if status_code == 429:
            return "rate_limited"
        elif status_code == 400:
            return "bad_request"
        elif status_code == 401 or status_code == 403:
            return "auth_error"
        elif status_code == 404:
            return "not_found"
        elif status_code == 503:
            return "service_unavailable"
        elif 500 <= status_code < 600:
            return "server_error"
        elif 400 <= status_code < 500:
            return "client_error"
        return "unknown"
