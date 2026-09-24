"""Govern Invocation Safety — live runtime safety telemetry from Bedrock invocation logs.

Source of truth: the account's Bedrock model-invocation log group (CloudWatch Logs),
queried via Logs Insights. Surfaces AGGREGATES ONLY — call volume, guardrail-
intervention rate, stop-reason distribution, token throughput, per-model breakdown,
and a daily trend.

PRIVACY: the underlying log records contain raw prompts/responses and caller
identities. This slice NEVER surfaces raw content or identities — only counts,
rates, and sums. That is a load-bearing constraint, mirroring the trail slice's
identity masking.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from models.govern_region_provenance import RegionProvenance


class StopReasonCount(BaseModel):
    """How often a model stopped for a given reason (e.g. guardrail_intervened)."""

    reason: str
    count: int


class ModelInvocationRollup(BaseModel):
    """Per-model invocation counts over the window."""

    # `model_id` here and on InvocationRecord below is an AI model identifier (a
    # Bedrock modelId) - meaningful domain vocabulary, not a pydantic internal.
    # Pydantic reserves the `model_` prefix, so the namespace guard is disabled
    # deliberately; renaming the field would break the API contract the frontend reads.
    model_config = {"protected_namespaces": ()}

    model_id: str = Field(..., description="Short model id (region + provider prefixes stripped)")
    calls: int = 0
    guardrail_intervened: int = 0


class DailyPoint(BaseModel):
    """One day in the trend: total calls and guardrail interventions."""

    date: str = Field(..., description="YYYY-MM-DD (UTC)")
    calls: int = 0
    guardrail_intervened: int = 0


class InvocationRecord(BaseModel):
    """One logged model invocation — METADATA ONLY.

    NEVER carries the prompt or the response/completion text. Only scalar metadata
    read from the log record's non-content fields (timestamp, model, operation,
    stop reason, token counts, guardrail signal). The content bodies
    (input.inputBodyJson / output.outputBodyJson) are never selected or read.
    """

    model_config = {"protected_namespaces": ()}

    timestamp: str = Field(..., description="Invocation time (UTC, from @timestamp)")
    model_id: str = Field(..., description="Short model id (region + provider prefixes stripped)")
    region: Optional[str] = None
    operation: Optional[str] = Field(default=None, description="e.g. Converse / InvokeModel / InvokeModelWithResponseStream")
    stop_reason: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    guardrail_intervened: bool = Field(False, description="True when stopReason == guardrail_intervened")
    guardrail_action: Optional[str] = Field(default=None, description="Guardrail signal derived from stopReason metadata")


class InvocationRecordsResponse(BaseModel):
    """Per-invocation metadata rows from Bedrock invocation logs — never content."""

    window_days: int = 7
    records: List[InvocationRecord] = Field(default_factory=list)
    count: int = 0
    truncated: bool = Field(False, description="True when the result hit the requested limit")
    log_group: Optional[str] = Field(default=None, description="Redacted in responses")
    logging_enabled: bool = Field(False, description="True when Bedrock model-invocation logging is configured")
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class InvocationSafetyResponse(BaseModel):
    """Live runtime safety telemetry aggregated from Bedrock invocation logs."""

    window_days: int = 7
    total_calls: int = Field(0, description="All logged invocations (incl. embeddings / non-generation calls)")
    completion_calls: int = Field(0, description="Generation calls that produced a stopReason (the intervention denominator)")
    guardrail_intervened: int = Field(0, description="Completions whose stopReason was guardrail_intervened")
    intervention_rate_pct: float = Field(0.0, description="guardrail_intervened / completion_calls * 100")
    stop_reasons: List[StopReasonCount] = Field(default_factory=list)
    by_model: List[ModelInvocationRollup] = Field(default_factory=list)
    trend: List[DailyPoint] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    log_group: Optional[str] = Field(default=None, description="The invocation log group queried")
    logging_enabled: bool = Field(False, description="True when Bedrock model-invocation logging is configured")
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )
