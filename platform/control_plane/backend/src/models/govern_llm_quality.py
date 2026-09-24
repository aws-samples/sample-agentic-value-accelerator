"""Govern LLM Quality — custom CloudWatch metrics for LLM output quality monitoring.

This module defines the data models for publishing and reading LLM quality metrics
to/from CloudWatch. Covers key quality dimensions: groundedness, relevance, coherence,
harmful/refusal rates, latency, token efficiency, and citation accuracy.

Works with a custom CloudWatch namespace (AVA/LLMQuality) rather than AWS-managed
metrics — you publish these from a Lambda post-processor or evaluation harness.
Includes anomaly detection alarms and a pre-built dashboard for governance visibility.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class LlmQualityDimension(str, Enum):
    """Quality dimensions tracked for LLM outputs."""

    GROUNDEDNESS = "groundedness"
    RELEVANCE = "relevance"
    COHERENCE = "coherence"
    HARMFUL_RATE = "harmful_rate"
    REFUSAL_RATE = "refusal_rate"
    LATENCY_P99 = "latency_p99"
    TOKENS_PER_RESPONSE = "tokens_per_response"
    CITATION_ACCURACY = "citation_accuracy"


# Display metadata for each dimension
_DIMENSION_METADATA = {
    LlmQualityDimension.GROUNDEDNESS: (
        "Groundedness",
        "How well responses are grounded in provided context",
        "Percent",
        0.0,
        100.0,
    ),
    LlmQualityDimension.RELEVANCE: (
        "Relevance",
        "How relevant responses are to user queries",
        "Percent",
        0.0,
        100.0,
    ),
    LlmQualityDimension.COHERENCE: (
        "Coherence",
        "Logical consistency and clarity of responses",
        "Percent",
        0.0,
        100.0,
    ),
    LlmQualityDimension.HARMFUL_RATE: (
        "Harmful Rate",
        "Percentage of responses flagged as harmful",
        "Percent",
        0.0,
        100.0,
    ),
    LlmQualityDimension.REFUSAL_RATE: (
        "Refusal Rate",
        "Percentage of requests refused by the model",
        "Percent",
        0.0,
        100.0,
    ),
    LlmQualityDimension.LATENCY_P99: (
        "Latency (P99)",
        "99th percentile response latency",
        "Milliseconds",
        0.0,
        30000.0,
    ),
    LlmQualityDimension.TOKENS_PER_RESPONSE: (
        "Tokens per Response",
        "Average token count in responses",
        "Count",
        0.0,
        8000.0,
    ),
    LlmQualityDimension.CITATION_ACCURACY: (
        "Citation Accuracy",
        "Accuracy of citations/references in responses",
        "Percent",
        0.0,
        100.0,
    ),
}


def get_dimension_metadata(dim: LlmQualityDimension) -> dict:
    """Return display metadata for a dimension."""
    label, description, unit, min_val, max_val = _DIMENSION_METADATA[dim]
    return {
        "label": label,
        "description": description,
        "unit": unit,
        "min_value": min_val,
        "max_value": max_val,
    }


class LlmQualityMetric(BaseModel):
    """A single LLM quality metric data point."""

    # `model_id` is an AI model identifier (a Bedrock modelId) - meaningful domain
    # vocabulary, not a pydantic internal. Pydantic reserves the `model_` prefix, so
    # the namespace guard is disabled deliberately; renaming the field would break
    # the API contract the frontend reads.
    model_config = {"protected_namespaces": ()}

    dimension: LlmQualityDimension
    value: float = Field(..., description="The metric value")
    unit: str = Field(..., description="CloudWatch unit (Percent, Milliseconds, Count)")
    model_id: Optional[str] = Field(None, description="Model ID (e.g., anthropic.claude-3)")
    use_case: Optional[str] = Field(None, description="Use case tag (e.g., customer-support)")
    timestamp: datetime = Field(..., description="When the metric was recorded")


class LlmQualitySnapshot(BaseModel):
    """Current values for all LLM quality dimensions."""

    metrics: List[LlmQualityMetric] = Field(default_factory=list)
    period_minutes: int = Field(5, description="Aggregation period in minutes")
    live: bool = Field(..., description="True if from real CloudWatch data")
    source: str = Field(..., description="Data source identifier")
    note: Optional[str] = Field(None, description="Status message or caveat")


class LlmQualityDatapoint(BaseModel):
    """A single datapoint in a time series."""

    timestamp: str = Field(..., description="ISO8601 timestamp")
    value: float = Field(..., description="Metric value at this point")
    unit: str = Field("", description="CloudWatch unit")


class LlmQualityTrend(BaseModel):
    """Time series for a specific quality dimension."""

    dimension: LlmQualityDimension
    label: str = Field("", description="Human-friendly dimension label")
    datapoints: List[LlmQualityDatapoint] = Field(default_factory=list)
    period_hours: int = Field(24, description="Trend window in hours")
    live: bool = Field(..., description="True if from real CloudWatch data")
    source: str = Field("", description="Data source identifier")
    note: Optional[str] = Field(None, description="Status message or caveat")


class LlmMonitoringStatus(BaseModel):
    """Status of LLM quality monitoring infrastructure."""

    guardrail_monitoring_active: bool = Field(
        False, description="True if guardrails with grounding checks exist"
    )
    custom_metrics_active: bool = Field(
        False, description="True if custom metrics exist in AVA/LLMQuality namespace"
    )
    active_alarms: List[str] = Field(default_factory=list, description="All LLM quality alarms")
    alarms_in_alarm: List[str] = Field(default_factory=list, description="Alarms currently firing")
    dashboard_deployed: bool = Field(False, description="True if AVA-LLM-Quality dashboard exists")
    namespace: str = Field("AVA/LLMQuality", description="CloudWatch namespace for metrics")
    live: bool = Field(..., description="True if status was fetched from AWS")
    source: str = Field(..., description="Data source identifier")
    note: Optional[str] = Field(None, description="Status message or caveat")


class PublishMetricsResponse(BaseModel):
    """Response from publishing metrics."""

    published: int = Field(..., description="Number of metrics successfully published")
    failed: int = Field(0, description="Number of metrics that failed to publish")
    live: bool = Field(True, description="Always true for write operations")
    note: Optional[str] = Field(None, description="Status message")


class CreateDashboardResponse(BaseModel):
    """Response from creating/updating the CloudWatch dashboard."""

    dashboard_name: str = Field(..., description="Name of the created dashboard")
    created: bool = Field(..., description="True if newly created, False if updated")
    live: bool = Field(True, description="Always true for write operations")
    note: Optional[str] = Field(None, description="Status message")


class CreateAlarmsResponse(BaseModel):
    """Response from creating anomaly detection alarms."""

    alarm_names: List[str] = Field(default_factory=list, description="Names of created alarms")
    created: int = Field(0, description="Number of alarms created")
    skipped: int = Field(0, description="Number of alarms skipped (already exist)")
    live: bool = Field(True, description="Always true for write operations")
    note: Optional[str] = Field(None, description="Status message")
