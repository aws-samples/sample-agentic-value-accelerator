"""Govern Models — real Bedrock model catalog + CloudWatch runtime metrics.

Read-through (no DynamoDB): the source of truth is AWS itself —
`bedrock:ListFoundationModels` for the catalog and CloudWatch `AWS/Bedrock`
metrics for runtime health. Mirrors the govern_cost slice convention: honest
live/source/note flags, graceful live=False fallback that never raises.

Every source here is a tier-2 governed read (per-region Bedrock / CloudWatch),
so all four responses fan out over the governed-region set and carry a
`RegionProvenance` block. Model *availability* is genuinely per-region — the same
model id is on-demand in one region and absent in the next — so records carry the
regions they were observed in rather than being flattened into a single list that
implies account-wide availability.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from models.govern_region_provenance import RegionProvenance

_REGIONS_FIELD_DESC = (
    "Which governed regions this aggregate covers. When `unreachable` is "
    "non-empty every total here is a floor, not a count."
)


class FoundationModel(BaseModel):
    """One Bedrock foundation model, from ListFoundationModels."""

    # `model_id` / `model_count` here and on the sibling models in this file name AI
    # models straight out of the Bedrock API - meaningful domain vocabulary, not
    # pydantic internals. Pydantic reserves the `model_` prefix, so the namespace
    # guard is disabled deliberately; renaming these fields would break the API
    # contract the frontend reads.
    model_config = {"protected_namespaces": ()}

    model_id: str = Field(..., description="Bedrock modelId, e.g. 'anthropic.claude-haiku-4-5-20251001-v1:0'")
    name: str = Field(..., description="Human model name, e.g. 'Claude Haiku 4.5'")
    provider: str = Field(..., description="providerName, e.g. 'Anthropic'")
    input_modalities: List[str] = Field(default_factory=list)
    output_modalities: List[str] = Field(default_factory=list)
    streaming: bool = False
    inference_types: List[str] = Field(default_factory=list, description="e.g. ['ON_DEMAND'] or ['INFERENCE_PROFILE']")
    lifecycle: str = Field("ACTIVE", description="modelLifecycle.status: ACTIVE | LEGACY")
    available_regions: List[str] = Field(
        default_factory=list,
        description=(
            "Governed regions whose Bedrock catalog lists this model. A model is not "
            "callable in a region absent from this list, so a single-element list is a "
            "real constraint and not a rendering artifact."
        ),
    )


class FoundationModelCatalog(BaseModel):
    """The account's real Bedrock model catalog (bedrock:ListFoundationModels).

    Aggregated over the governed regions: one row per model id, not one row per
    (model, region). `total` is therefore a count of distinct models reachable from
    somewhere in the governed set — see each model's `available_regions` for where.
    """

    models: List[FoundationModel] = Field(default_factory=list)
    total: int = 0
    providers: List[str] = Field(default_factory=list, description="Distinct provider names present")
    active: int = Field(
        0,
        description=(
            "Count with lifecycle == ACTIVE. A model reported LEGACY in any governed "
            "region is counted as LEGACY here, so this is the count that is safe "
            "everywhere rather than the count that is ACTIVE somewhere."
        ),
    )
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(default=None, description=_REGIONS_FIELD_DESC)


class ModelRuntimeMetrics(BaseModel):
    """Trailing-window runtime metrics for one model, from CloudWatch AWS/Bedrock.

    Aggregates across both bare (`anthropic.…`) and cross-region (`us.anthropic.…`)
    ModelId dimensions for the same logical model.
    """

    model_config = {"protected_namespaces": ()}

    model_id: str = Field(..., description="Canonical model id (prefix-normalized)")
    invocations: int = 0
    avg_latency_ms: float = 0.0
    client_errors: int = 0
    server_errors: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    # None = CloudWatch published no datapoint for the metric in this window, i.e.
    # prompt caching was never exercised on this model. NOT the same as 0, which would
    # assert that a 0% cache hit rate was measured. Render as "not measured", never as 0.
    cache_read_tokens: Optional[int] = Field(
        None, description="CacheReadInputTokenCount — prompt-cache hits. None = not measured."
    )
    cache_write_tokens: Optional[int] = Field(
        None,
        description=(
            "CacheWriteInputTokenCount — prompt-cache writes, billed ABOVE the standard "
            "input rate. None = not measured."
        ),
    )
    error_rate_pct: float = Field(0.0, description="(client+server errors) / invocations * 100")
    active_regions: List[str] = Field(
        default_factory=list,
        description=(
            "Governed regions where this model recorded invocations in the window. "
            "Distinct from FoundationModel.available_regions: a model can be available "
            "in a region and never called there."
        ),
    )


class ModelMetricsResponse(BaseModel):
    """Per-model runtime metrics over the window + a fleet roll-up.

    Counters (invocations, tokens, errors) sum across governed regions; each region's
    CloudWatch holds only the invocations made through that region's endpoint, so no
    invocation is counted twice. Latencies are invocation-weighted, never averaged —
    a region serving 10 calls must not pull the mean as hard as one serving 10,000.
    """

    by_model: List[ModelRuntimeMetrics] = Field(default_factory=list)
    total_invocations: int = 0
    avg_latency_ms: float = 0.0
    fleet_error_rate_pct: float = 0.0
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(default=None, description=_REGIONS_FIELD_DESC)


class InferenceProfile(BaseModel):
    """One Bedrock inference profile, from bedrock:ListInferenceProfiles.

    Covers both cross-region system-defined profiles (e.g. `us.anthropic.…`)
    and customer application-defined profiles.
    """

    model_config = {"protected_namespaces": ()}

    id: str = Field(..., description="inferenceProfileId, e.g. 'us.anthropic.claude-3-sonnet-20240229-v1:0'")
    name: str = Field(..., description="inferenceProfileName")
    arn: Optional[str] = Field(None, description="inferenceProfileArn (may carry the account id)")
    description: Optional[str] = None
    type: str = Field("", description="SYSTEM_DEFINED | APPLICATION_DEFINED")
    status: str = Field("", description="e.g. ACTIVE")
    model_count: int = Field(0, description="Number of routed model targets")
    regions: List[str] = Field(
        default_factory=list,
        description=(
            "Regions the profile routes traffic TO, parsed from its routed model ARNs. "
            "This is the profile's routing fan-out, not where the profile itself is "
            "callable - see available_regions for that."
        ),
    )
    available_regions: List[str] = Field(
        default_factory=list,
        description="Governed regions whose ListInferenceProfiles returned this profile",
    )


class InferenceProfilesResponse(BaseModel):
    """The account's real Bedrock inference profiles + a type roll-up.

    Deduped by profile id across governed regions: a system-defined cross-region
    profile is listed by every region in its geo, so a union would report the same
    profile several times and inflate `total`.
    """

    profiles: List[InferenceProfile] = Field(default_factory=list)
    total: int = 0
    system_defined: int = Field(0, description="Count with type == SYSTEM_DEFINED")
    application_defined: int = Field(0, description="Count with type == APPLICATION_DEFINED")
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(default=None, description=_REGIONS_FIELD_DESC)


class PromptRouter(BaseModel):
    """One Bedrock intelligent prompt router, from bedrock:ListPromptRouters."""

    model_config = {"protected_namespaces": ()}

    name: str = Field(..., description="promptRouterName")
    arn: Optional[str] = Field(None, description="promptRouterArn (may carry the account id)")
    description: Optional[str] = None
    status: str = Field("", description="e.g. AVAILABLE")
    type: str = Field("", description="e.g. default | custom")
    model_count: int = Field(0, description="Number of candidate models the router routes among")
    fallback_model: Optional[str] = Field(None, description="Fallback model id (account-bearing ARN shortened away)")
    available_regions: List[str] = Field(
        default_factory=list,
        description="Governed regions whose ListPromptRouters returned this router",
    )


class PromptRoutersResponse(BaseModel):
    """The account's real Bedrock prompt routers.

    Deduped by router name across governed regions — AWS default routers carry the
    same name in every region that offers them.
    """

    routers: List[PromptRouter] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(default=None, description=_REGIONS_FIELD_DESC)
