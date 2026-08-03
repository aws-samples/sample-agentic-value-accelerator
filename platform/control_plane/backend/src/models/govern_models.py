"""Govern Models — real Bedrock model catalog + CloudWatch runtime metrics.

Read-through (no DynamoDB): the source of truth is AWS itself —
`bedrock:ListFoundationModels` for the catalog and CloudWatch `AWS/Bedrock`
metrics for runtime health. Mirrors the govern_cost slice convention: honest
live/source/note flags, graceful live=False fallback that never raises.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class FoundationModel(BaseModel):
    """One Bedrock foundation model, from ListFoundationModels."""

    model_id: str = Field(..., description="Bedrock modelId, e.g. 'anthropic.claude-haiku-4-5-20251001-v1:0'")
    name: str = Field(..., description="Human model name, e.g. 'Claude Haiku 4.5'")
    provider: str = Field(..., description="providerName, e.g. 'Anthropic'")
    input_modalities: List[str] = Field(default_factory=list)
    output_modalities: List[str] = Field(default_factory=list)
    streaming: bool = False
    inference_types: List[str] = Field(default_factory=list, description="e.g. ['ON_DEMAND'] or ['INFERENCE_PROFILE']")
    lifecycle: str = Field("ACTIVE", description="modelLifecycle.status: ACTIVE | LEGACY")


class FoundationModelCatalog(BaseModel):
    """The account's real Bedrock model catalog (ce:ListFoundationModels)."""

    models: List[FoundationModel] = Field(default_factory=list)
    total: int = 0
    providers: List[str] = Field(default_factory=list, description="Distinct provider names present")
    active: int = Field(0, description="Count with lifecycle == ACTIVE")
    live: bool
    source: str
    note: Optional[str] = None


class ModelRuntimeMetrics(BaseModel):
    """Trailing-window runtime metrics for one model, from CloudWatch AWS/Bedrock.

    Aggregates across both bare (`anthropic.…`) and cross-region (`us.anthropic.…`)
    ModelId dimensions for the same logical model.
    """

    model_id: str = Field(..., description="Canonical model id (prefix-normalized)")
    invocations: int = 0
    avg_latency_ms: float = 0.0
    client_errors: int = 0
    server_errors: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = Field(0, description="CacheReadInputTokenCount — prompt-cache hits")
    cache_write_tokens: int = Field(0, description="CacheWriteInputTokenCount — prompt-cache writes")
    error_rate_pct: float = Field(0.0, description="(client+server errors) / invocations * 100")


class ModelMetricsResponse(BaseModel):
    """Per-model runtime metrics over the window + a fleet roll-up."""

    by_model: List[ModelRuntimeMetrics] = Field(default_factory=list)
    total_invocations: int = 0
    avg_latency_ms: float = 0.0
    fleet_error_rate_pct: float = 0.0
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None
