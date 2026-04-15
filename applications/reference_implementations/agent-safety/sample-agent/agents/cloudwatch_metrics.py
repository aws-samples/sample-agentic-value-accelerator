"""CloudWatch Metrics — Token usage observability for AgentCore agents.

AgentCore natively provides metrics for:
  - Session count, invocation count, latency
  - Error rates (user/system/throttle)
  - CPU and memory resource usage

This module fills the gap by emitting TOKEN USAGE metrics, which
AgentCore does not track. Metrics are published under the
"AgentCore/Agents" namespace with an AgentName dimension.

Usage:
    from cloudwatch_metrics import MetricsPublisher

    metrics = MetricsPublisher(agent_name="my_agent")
    metrics.record_token_usage(input_tokens=100, output_tokens=50)
    metrics.flush()
"""

import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

NAMESPACE = "AgentCore/Agents"
REGION = os.environ.get("AWS_REGION", "us-east-1")
_MAX_BATCH_SIZE = 20


class MetricsPublisher:
    """Publishes token usage metrics to CloudWatch."""

    def __init__(self, agent_name: str | None = None, region: str | None = None):
        self.agent_name = agent_name or os.environ.get("AGENT_NAME", "unknown")
        self._region = region or REGION
        self._client = None
        self._buffer: list[dict] = []
        self._dimensions = [{"Name": "AgentName", "Value": self.agent_name}]

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client("cloudwatch", region_name=self._region)
        return self._client

    def _put(self, metric_name: str, value: float, unit: str):
        self._buffer.append({
            "MetricName": metric_name,
            "Dimensions": self._dimensions,
            "Timestamp": datetime.now(timezone.utc),
            "Value": value,
            "Unit": unit,
        })
        if len(self._buffer) >= _MAX_BATCH_SIZE:
            self.flush()

    def flush(self):
        """Send buffered metrics to CloudWatch."""
        if not self._buffer:
            return
        batch = self._buffer[:1000]
        self._buffer = self._buffer[1000:]
        try:
            self.client.put_metric_data(Namespace=NAMESPACE, MetricData=batch)
        except ClientError as e:
            logger.warning(f"Failed to publish CloudWatch metrics: {e}")

    def record_token_usage(self, input_tokens: int = 0, output_tokens: int = 0):
        """Record token consumption for a single invocation."""
        if input_tokens:
            self._put("InputTokens", input_tokens, "Count")
        if output_tokens:
            self._put("OutputTokens", output_tokens, "Count")
        total = input_tokens + output_tokens
        if total:
            self._put("TotalTokens", total, "Count")
