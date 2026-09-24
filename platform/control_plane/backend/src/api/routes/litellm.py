"""LiteLLM Gateway API routes for key management, model catalog, spend, health, and config.

Provides REST endpoints for the Control Plane UI to:
- Manage virtual keys (list, create, revoke, update budget)
- List configured gateway models with provider, region, status, and spend
- Query spend summaries by use_case/team/model with CSV export
- Proxy gateway health status from LiteLLM /health
- Trigger config regeneration for the gateway

Tasks: 11.1, 11.2
Requirements: 11.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 9.1
"""

import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, NamedTuple, Optional

import boto3
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core import region_config
from core.config import settings
from core.rbac import Role, require_role
from services.litellm_provisioning import (
    BudgetConfig,
    BudgetCapExceededError,
    DuplicateKeyError,
    KeyRevocationError,
    LiteLLMProvisioningService,
    ProvisioningError,
    VirtualKeyInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gateway", tags=["gateway"])


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------


class ModelInfo(BaseModel):
    """A configured gateway model."""

    model_config = {"protected_namespaces": ()}

    model_id: str
    display_name: str
    provider: str
    region: str
    mode: str
    status: str = "active"
    input_cost_per_token: float = 0.0
    output_cost_per_token: float = 0.0
    max_input_tokens: int = 0
    max_output_tokens: int = 0
    spend_usd: float = 0.0


class ModelsResponse(BaseModel):
    """Response for GET /api/gateway/models.

    Carries two SEPARATE honest-degrade triples because the body is two
    independent measurements that fail independently: the catalog rows
    themselves and the per-model spend enrichment. Collapsing them into one
    live/source/note would force the response to lie about whichever half
    disagreed - a live catalog with dead spend is the common case.
    """

    models: List[ModelInfo]
    total_count: int

    # Whether `models` was really read from the account's DynamoDB catalog, or
    # is AVA's compiled-in _default_model_catalog(). The fallback's prices and
    # token limits are source-code constants, so a caller that renders them as
    # "the models configured in this account" is asserting something unmeasured.
    catalog_live: bool = False
    catalog_source: str = "unknown"
    catalog_note: Optional[str] = None

    # Whether every ModelInfo.spend_usd above is a measured figure. When this is
    # false the spend scan never ran (or never finished) and every spend_usd is a
    # placeholder 0.0 - NOT a measured "this model cost nothing". spend_usd stays
    # a float rather than going null because the UI formatter does
    # `usd.toFixed()` unguarded and null would coerce past its `=== 0` check and
    # throw, so the disclaimer has to ride alongside the number instead of
    # replacing it. Renderers must badge the column when spend_live is false.
    spend_live: bool = False
    spend_source: str = "unknown"
    spend_note: Optional[str] = None


class SpendSummaryRecord(BaseModel):
    """A single spend summary record."""

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


class SpendSummaryResponse(BaseModel):
    """Response for GET /api/gateway/spend."""

    records: List[SpendSummaryRecord]
    total_cost_usd: float
    total_requests: int
    period: str
    filters: Dict[str, Optional[str]] = {}

    # Honest-degrade triple, same shape as the govern_* services. This body is
    # only ever produced by a scan that actually reached the table, so live is
    # true here and the note explains a measured zero or excluded rows; the
    # not-configured and scan-failed paths return 503 rather than this model,
    # because total_cost_usd=0.0 over an empty records list reads exactly like a
    # period with no spend.
    live: bool = False
    source: str = "unknown"
    note: Optional[str] = None


class GatewayHealthResponse(BaseModel):
    """Response for GET /api/gateway/health."""

    status: str
    uptime_seconds: float = 0.0
    db_connectivity: str = "unknown"
    redis_connectivity: str = "unknown"
    gateway_url: str = ""
    response_time_ms: float = 0.0


class ConfigRegenerateResponse(BaseModel):
    """Response for POST /api/gateway/config/regenerate."""

    status: str
    message: str
    config_version: str = ""
    deployment_id: str = ""


# --- Key Management Models (Task 11.1) ---


class VirtualKeyResponse(BaseModel):
    """Response model for a virtual key."""

    key_alias: str
    use_case: str
    team: str
    max_budget: float
    spend: float
    models: List[str]
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    created_at: Optional[str] = None
    token: Optional[str] = None


class CreateKeyRequest(BaseModel):
    """Request model for creating a new virtual key."""

    use_case: str = Field(..., description="Use case identifier (e.g., 'kyc_banking')")
    team: str = Field(..., description="Team identifier (e.g., 'fsi-compliance')")
    models: List[str] = Field(..., description="List of model IDs this key can access")
    max_budget: float = Field(..., gt=0, description="Monthly budget limit in USD")
    budget_duration: str = Field(default="monthly", description="Budget reset period")
    rpm_limit: int = Field(
        default=settings.LITELLM_DEFAULT_RPM_LIMIT,
        ge=1,
        description="Requests per minute limit (default from settings)",
    )
    tpm_limit: int = Field(
        default=settings.LITELLM_DEFAULT_TPM_LIMIT,
        ge=1,
        description="Tokens per minute limit (default from settings)",
    )


class CreateKeyResponse(BaseModel):
    """Response model after creating a virtual key."""

    key: str
    key_name: str
    secret_name: str
    use_case: str
    team: str
    created_at: str


class UpdateBudgetRequest(BaseModel):
    """Request model for updating a key's budget allocation."""

    max_budget: float = Field(..., gt=0, description="New monthly budget limit in USD")
    budget_duration: str = Field(default="monthly", description="Budget reset period")
    rpm_limit: Optional[int] = Field(default=None, ge=1, description="New RPM limit")
    tpm_limit: Optional[int] = Field(default=None, ge=1, description="New TPM limit")


# ---------------------------------------------------------------------------
# Service Singletons (lazy-initialized)
# ---------------------------------------------------------------------------

_config_generator = None
_health_client = None
_spend_aggregator = None
_finops_writer = None
_provisioning_svc: Optional[LiteLLMProvisioningService] = None


def _get_provisioning_service() -> LiteLLMProvisioningService:
    """Lazily initialize and return the LiteLLM provisioning service.

    Raises:
        HTTPException: 503 if gateway URL or master key are not configured.
    """
    global _provisioning_svc
    if _provisioning_svc is None:
        if not settings.LITELLM_GATEWAY_URL or not settings.LITELLM_MASTER_KEY:
            raise HTTPException(
                status_code=503,
                detail="LiteLLM gateway is not configured. Set LITELLM_GATEWAY_URL and LITELLM_MASTER_KEY.",
            )
        _provisioning_svc = LiteLLMProvisioningService(
            gateway_url=settings.LITELLM_GATEWAY_URL,
            master_key=settings.LITELLM_MASTER_KEY,
            region=settings.AWS_REGION,
        )
    return _provisioning_svc


def _get_config_generator():
    """Lazily create the ConfigGenerator service."""
    global _config_generator
    if _config_generator is None:
        from services.config_generator import ConfigGenerator

        _config_generator = ConfigGenerator()
    return _config_generator


def _get_health_client():
    """Lazily create the GatewayHealthClient."""
    global _health_client
    if _health_client is None:
        from services.gateway_health import GatewayHealthClient

        gateway_url = settings.LITELLM_GATEWAY_URL
        if not gateway_url:
            return None
        _health_client = GatewayHealthClient(gateway_url=gateway_url)
    return _health_client


def _get_spend_aggregator():
    """Lazily create the SpendAggregator service."""
    global _spend_aggregator
    if _spend_aggregator is None:
        from services.spend_aggregator import SpendAggregator

        gateway_url = settings.LITELLM_GATEWAY_URL
        master_key = settings.LITELLM_MASTER_KEY
        if not gateway_url or not master_key:
            return None
        _spend_aggregator = SpendAggregator(
            gateway_url=gateway_url,
            master_key=master_key,
        )
    return _spend_aggregator


def _get_finops_writer():
    """Lazily create the FinOpsDataStoreWriter."""
    global _finops_writer
    if _finops_writer is None:
        from services.spend_aggregator import FinOpsDataStoreWriter

        table_name = settings.FINOPS_SPEND_TABLE_NAME
        if not table_name:
            return None
        # table_region(), not AWS_REGION: the writer must follow the same relocation knob as
        # the reader in govern_cost_service. Setting FINOPS_SPEND_TABLE_REGION while this one
        # stayed on AWS_REGION would write to one region and read from another - exactly the
        # split-brain that region_config.table_region() documents.
        _finops_writer = FinOpsDataStoreWriter(
            table_name=table_name,
            region=region_config.table_region("FINOPS_SPEND"),
        )
    return _finops_writer


# ---------------------------------------------------------------------------
# GET /api/gateway/keys — List virtual keys (Requirements 12.3, 12.6)
# ---------------------------------------------------------------------------


@router.get("/keys", response_model=List[VirtualKeyResponse])
async def list_keys(
    team: Optional[str] = Query(default=None, description="Filter keys by team"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List all virtual keys with metadata.

    Optionally filter by team. Requires at minimum the "viewer" role.
    """
    svc = _get_provisioning_service()
    try:
        keys: List[VirtualKeyInfo] = svc.list_keys(team=team)
    except ProvisioningError as e:
        logger.error("Failed to list virtual keys: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    return [
        VirtualKeyResponse(
            key_alias=k.key_alias,
            use_case=k.use_case,
            team=k.team,
            max_budget=k.max_budget,
            spend=k.spend,
            models=k.models,
            rpm_limit=k.rpm_limit,
            tpm_limit=k.tpm_limit,
            created_at=k.created_at,
            token=k.token,
        )
        for k in keys
    ]


# ---------------------------------------------------------------------------
# POST /api/gateway/keys — Create virtual key (Requirements 11.3, 12.4, 12.6)
# ---------------------------------------------------------------------------


@router.post("/keys", response_model=CreateKeyResponse, status_code=201)
async def create_key(
    req: CreateKeyRequest,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create a new virtual key for a use case.

    Calls the LiteLLM Provisioning Service to generate a key with the
    specified budget and model scope. Requires the "operator" role.
    """
    svc = _get_provisioning_service()
    budget = BudgetConfig(
        max_budget=req.max_budget,
        budget_duration=req.budget_duration,
        rpm_limit=req.rpm_limit,
        tpm_limit=req.tpm_limit,
    )

    try:
        # Validate team budget cap before provisioning
        from core.config import settings
        svc.validate_team_budget_cap(
            team=req.team,
            team_budget_cap=settings.LITELLM_TEAM_BUDGET_CAP_USD,
            new_use_case_budget=req.max_budget,
        )

        result = svc.provision_key(
            use_case=req.use_case,
            team=req.team,
            budget=budget,
            models=req.models,
        )
    except DuplicateKeyError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BudgetCapExceededError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ProvisioningError as e:
        logger.error("Failed to provision key for use_case=%s: %s", req.use_case, e)
        raise HTTPException(status_code=502, detail=str(e))

    return CreateKeyResponse(
        key=result.key,
        key_name=result.key_name,
        secret_name=result.secret_name,
        use_case=result.use_case,
        team=result.team,
        created_at=result.created_at,
    )


# ---------------------------------------------------------------------------
# DELETE /api/gateway/keys/{key_id} — Revoke key (Requirements 12.4, 12.6)
# ---------------------------------------------------------------------------


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_key(
    key_id: str,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Revoke a virtual key by use case identifier.

    The key_id parameter is the use case identifier (e.g., 'kyc_banking').
    Revokes the key in LiteLLM and removes it from Secrets Manager.
    Requires the "operator" role.
    """
    svc = _get_provisioning_service()
    try:
        svc.revoke_key(use_case=key_id)
    except KeyRevocationError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        logger.error("Failed to revoke key for use_case=%s: %s", key_id, e)
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# PATCH /api/gateway/keys/{key_id}/budget — Update budget (Req 11.3, 12.4, 12.6)
# ---------------------------------------------------------------------------


@router.patch("/keys/{key_id}/budget", status_code=200)
async def update_key_budget(
    key_id: str,
    req: UpdateBudgetRequest,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Update budget allocation for an existing virtual key.

    The key_id parameter is the use case identifier (e.g., 'kyc_banking').
    Updates the budget, and optionally the rate limits, via the LiteLLM API.
    Requires the "operator" role.
    """
    svc = _get_provisioning_service()
    budget = BudgetConfig(
        max_budget=req.max_budget,
        budget_duration=req.budget_duration,
        rpm_limit=req.rpm_limit if req.rpm_limit is not None else settings.LITELLM_DEFAULT_RPM_LIMIT,
        tpm_limit=req.tpm_limit if req.tpm_limit is not None else settings.LITELLM_DEFAULT_TPM_LIMIT,
    )

    try:
        svc.update_budget(use_case=key_id, budget=budget)
    except ProvisioningError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        logger.error("Failed to update budget for use_case=%s: %s", key_id, e)
        raise HTTPException(status_code=502, detail=str(e))

    return {"message": f"Budget updated for use case '{key_id}'", "max_budget": req.max_budget}


# ---------------------------------------------------------------------------
# GET /api/gateway/models — List configured models (Requirement 12.1)
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsResponse)
async def list_models(_=Depends(require_role(Role.VIEWER))):
    """List all configured gateway models with provider, region, status, and per-model spend.

    Returns models from the Config Generator's model catalog, enriched with
    spend data from the FinOps data store when available.

    The catalog and the spend enrichment fail independently, so the response
    carries a separate live/source/note triple for each. Both are served even
    when one degrades: failing the whole endpoint because spend was unreachable
    would take the model list down with it.
    """
    catalog = _load_model_catalog()
    spend = _get_spend_by_model()

    models = []
    for entry in catalog.entries:
        # When spend.live is false this is always 0.0 and is NOT measured spend;
        # spend_live / spend_note on the response say so. It cannot be null here
        # because the catalog UI calls .toFixed() on it unguarded.
        spend_usd = spend.spend.get(entry.model_id, 0.0)
        models.append(
            ModelInfo(
                model_id=entry.model_id,
                display_name=entry.display_name,
                provider=entry.provider,
                region=entry.region,
                mode=entry.mode,
                status="active" if entry.active else "inactive",
                input_cost_per_token=entry.input_cost_per_token,
                output_cost_per_token=entry.output_cost_per_token,
                max_input_tokens=entry.max_input_tokens,
                max_output_tokens=entry.max_output_tokens,
                spend_usd=spend_usd,
            )
        )

    return ModelsResponse(
        models=models,
        total_count=len(models),
        catalog_live=catalog.live,
        catalog_source=catalog.source,
        catalog_note=catalog.note,
        spend_live=spend.live,
        spend_source=spend.source,
        spend_note=spend.note,
    )


# ---------------------------------------------------------------------------
# GET /api/gateway/spend — Spend summary (Requirement 12.2)
# ---------------------------------------------------------------------------


@router.get("/spend", response_model=SpendSummaryResponse)
async def get_spend_summary(
    _=Depends(require_role(Role.VIEWER)),
    use_case: Optional[str] = Query(None, description="Filter by use case"),
    team: Optional[str] = Query(None, description="Filter by team"),
    model: Optional[str] = Query(None, description="Filter by model"),
    period: str = Query("daily", description="Aggregation period: hourly, daily, weekly, monthly"),
    days: int = Query(30, description="Number of days of history to include", ge=1, le=365),
):
    """Get spend summary grouped by use_case/team/model.

    Reads aggregated spend data from the FinOps DynamoDB table and returns
    filtered, summarized records.

    Raises:
        HTTPException: 503 when the spend store is unconfigured or unreachable,
            so that a query which never ran is never served as a total.
    """
    result = _query_spend_records(
        use_case=use_case,
        team=team,
        model=model,
        period=period,
        days=days,
    )

    if not result.live:
        # 503 rather than a zeroed 200 body. An empty records list sums to
        # total_cost_usd=0.0 / total_requests=0, which is byte-for-byte what a period
        # with genuinely no spend returns - so the dashboard drew a flat $0.00 cost
        # trend over a scan that had errored, with nothing marking it as unmeasured.
        # A non-2xx also reaches the user without any frontend change: the existing
        # axios caller routes it to its error banner instead of the charts.
        raise HTTPException(status_code=503, detail=result.note or "Spend data is unavailable.")

    total_cost = sum(r.total_cost_usd for r in result.records)
    total_requests = sum(r.request_count for r in result.records)

    return SpendSummaryResponse(
        records=result.records,
        total_cost_usd=round(total_cost, 6),
        total_requests=total_requests,
        period=period,
        filters={
            "use_case": use_case,
            "team": team,
            "model": model,
        },
        live=result.live,
        source=result.source,
        note=result.note,
    )


# ---------------------------------------------------------------------------
# GET /api/gateway/spend/export — CSV export (Requirement 12.5)
# ---------------------------------------------------------------------------


@router.get("/spend/export")
async def export_spend_csv(
    _=Depends(require_role(Role.VIEWER)),
    use_case: Optional[str] = Query(None, description="Filter by use case"),
    team: Optional[str] = Query(None, description="Filter by team"),
    model: Optional[str] = Query(None, description="Filter by model"),
    period: str = Query("daily", description="Aggregation period: daily, weekly, monthly"),
    days: int = Query(30, description="Number of days of history to include", ge=1, le=365),
):
    """Export spend data as CSV (daily/weekly/monthly).

    Returns a downloadable CSV file with spend records matching the filters.

    Raises:
        HTTPException: 503 when the spend store is unconfigured or unreachable.
    """
    result = _query_spend_records(
        use_case=use_case,
        team=team,
        model=model,
        period=period,
        days=days,
    )

    if not result.live:
        # The worst place in this file to serve an unmeasured zero. A CSV detaches from
        # the API - it becomes a file on someone's disk and then a row in a spreadsheet
        # reconciled against a ledger - and it has no field to carry live/source/note.
        # A header-only CSV therefore reads as an authoritative "no spend this period"
        # with no way left to discover the scan had failed. Refuse instead: the existing
        # blob-download caller treats a non-2xx as an error and writes no file at all.
        raise HTTPException(
            status_code=503,
            detail=result.note or "Spend data is unavailable, so no export can be produced.",
        )

    records = result.records

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "use_case",
        "team",
        "model",
        "period",
        "date",
        "total_cost_usd",
        "input_tokens",
        "output_tokens",
        "request_count",
        "avg_latency_ms",
    ])

    for record in records:
        writer.writerow([
            record.use_case,
            record.team,
            record.model,
            record.period,
            record.date,
            record.total_cost_usd,
            record.input_tokens,
            record.output_tokens,
            record.request_count,
            record.avg_latency_ms,
        ])

    output.seek(0)
    filename = f"gateway_spend_{period}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# GET /api/gateway/health — Gateway health (Requirement 9.1)
# ---------------------------------------------------------------------------


@router.get("/health", response_model=GatewayHealthResponse)
async def get_gateway_health(_=Depends(require_role(Role.VIEWER))):
    """Get gateway health status proxied from LiteLLM /health endpoint.

    Proxies the health check to the LiteLLM gateway and returns status,
    uptime, and dependency connectivity information.
    """
    health_client = _get_health_client()
    if health_client is None:
        return GatewayHealthResponse(
            status="unconfigured",
            gateway_url="",
            response_time_ms=0.0,
        )

    try:
        result = health_client.check_health()
        return GatewayHealthResponse(
            status=result.status.value,
            uptime_seconds=result.uptime_seconds,
            db_connectivity=result.db_connectivity.value,
            redis_connectivity=result.redis_connectivity.value,
            gateway_url=settings.LITELLM_GATEWAY_URL,
            response_time_ms=result.response_time_ms,
        )
    except Exception as e:
        logger.error("Gateway health check failed: %s", str(e))
        return GatewayHealthResponse(
            status="unreachable",
            gateway_url=settings.LITELLM_GATEWAY_URL,
            response_time_ms=0.0,
        )


# ---------------------------------------------------------------------------
# POST /api/gateway/config/regenerate — Trigger config regeneration (Req 12.6)
# ---------------------------------------------------------------------------


class ConfigRegenerateRequest(BaseModel):
    """Optional request body for config regeneration."""

    force: bool = Field(default=False, description="Force regeneration even if no catalog changes detected")


@router.post("/config/regenerate", response_model=ConfigRegenerateResponse)
async def regenerate_config(
    request: Optional[ConfigRegenerateRequest] = None,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Trigger gateway config regeneration from the model catalog.

    Requires "operator" role. Generates a new config.yaml from the model catalog,
    validates it, publishes to S3, and triggers an ECS rolling update.
    """
    config_gen = _get_config_generator()
    catalog = _load_model_catalog()

    if catalog.source == "unavailable-fallback":
        # Refuse when the catalog READ FAILED. _load_model_catalog() substitutes AVA's
        # eight compiled-in models on failure, and this route publishes whatever it is
        # given to S3 and then triggers an ECS rolling update - so an unreachable table
        # would have silently overwritten the live gateway's real model set with
        # source-code defaults, deleting every model the account had configured.
        # Deliberately keyed on the failed-read source only: "not-configured" and
        # "default-catalog" are measured states (nothing is seeded yet), which is a
        # legitimate bootstrap, so those still publish - loudly, below.
        raise HTTPException(
            status_code=503,
            detail=(
                "Refusing to regenerate gateway config: the model catalog could not be "
                f"read, so publishing would overwrite the live gateway with AVA's "
                f"compiled-in defaults. {catalog.note}"
            ),
        )

    if not catalog.entries:
        raise HTTPException(
            status_code=400,
            detail="Model catalog is empty. Cannot generate config.",
        )

    if not catalog.live:
        # Measured-but-unseeded. Allowed, because it is how a new deployment bootstraps,
        # but an operator must be able to find out afterwards that the gateway is running
        # compiled-in defaults rather than a curated catalog.
        logger.warning(
            "Regenerating gateway config from AVA's compiled-in default catalog "
            "(catalog_source=%s): %s",
            catalog.source,
            catalog.note,
        )

    try:
        # Generate config
        config_yaml = config_gen.generate(catalog.entries)

        # Validate
        validation = config_gen.validate(config_yaml)
        if not validation.is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Generated config failed validation: {'; '.join(validation.errors)}",
            )

        # Publish to S3
        version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        s3_key = config_gen.publish(config_yaml, version=version)

        # Trigger rolling update
        deployment_id = config_gen.trigger_rolling_update(version)

        logger.info(
            "Config regeneration triggered: version=%s, s3_key=%s, deployment_id=%s",
            version,
            s3_key,
            deployment_id,
        )

        return ConfigRegenerateResponse(
            status="success",
            message=f"Config regenerated and deployment triggered (version: {version})",
            config_version=version,
            deployment_id=deployment_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Config regeneration failed: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Config regeneration failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
#
# The three helpers below used to return a bare list / dict and swallow every
# failure into an empty one. An empty container is not a measurement: a caller
# handed `{}` cannot tell "we scanned the table and the account spent nothing"
# from "the scan never ran", and both rendered as $0.00. Each helper now returns
# its rows alongside the repo's live/source/note triple so the route can say
# which of the two happened.


class _CatalogResult(NamedTuple):
    """A model catalog plus whether it was really read from the account.

    `_load_model_catalog()` returned a bare list, so the compiled-in
    `_default_model_catalog()` fallback was indistinguishable from a catalog
    genuinely read out of DynamoDB - /gateway/models presented eight
    source-code constants (prices, token limits, regions) as this deployment's
    configuration, and /gateway/config/regenerate would publish them to the
    live gateway.
    """

    entries: list
    live: bool
    source: str
    note: Optional[str]


class _SpendByModelResult(NamedTuple):
    """Per-model spend totals plus whether the scan actually ran.

    `_get_spend_by_model()` returned `{}` on any failure, so `list_models()`
    resolved every model to spend_usd=0.0 and the model catalog rendered
    "$0.00" per model for a query that never executed - a confidently wrong
    financial number carrying no hint that it was unmeasured.
    """

    spend: Dict[str, float]
    live: bool
    source: str
    note: Optional[str]


class _SpendRecordsResult(NamedTuple):
    """Spend rows plus whether the scan actually ran.

    Same defect as `_SpendByModelResult`, one layer up: `[]` from a failed scan
    summed to total_cost_usd=0.0 / total_requests=0, so the Spend dashboard drew
    a flat zero cost trend and a $0.00 header over a query that had errored.
    """

    records: List[SpendSummaryRecord]
    live: bool
    source: str
    note: Optional[str]


def _default_inference_region() -> str:
    """Region a catalog row with no explicit region routes model INFERENCE to.

    Tier 2 (the governed fleet), NOT tier 1 (AVA's own control plane). See
    core.region_config for the tier definitions. `ModelCatalogEntry.region` is consumed
    by ConfigGenerator._build_model_list() as litellm_params["aws_region_name"] for
    bedrock providers and as the api_base host
    (https://bedrock-mantle.{region}.api.aws/v1) for bedrock-mantle, so this value is
    where customer prompts are actually sent. That is the governed estate by definition.

    Why one function instead of two independent expressions: a row that omits `region`
    must resolve to the SAME region whether it came out of the DynamoDB catalog or out
    of AVA's compiled-in `_default_model_catalog()`. When the two paths derived the
    default separately they disagreed - the table path used GOVERN_AWS_REGION while
    every compiled-in entry carried the literal "us-east-2" - so a catalog-read failure
    silently relocated inference to a different region than the same row would have used
    on the happy path. Nothing in the response changed shape, so the swap was invisible.

    `settings.GOVERN_AWS_REGION` first rather than `get_governed_regions()[0]` outright:
    a catalog row carries exactly one region, and [0] of the persisted governed set
    would make the inference target depend on the order somebody happened to add regions
    to governance. The governed set is consulted only when GOVERN_AWS_REGION is
    explicitly blank, and it is consulted rather than emitting "" because an empty
    aws_region_name is not an error - botocore falls back to the ambient/profile region,
    which is the control-plane region again, i.e. the same tier-1 mistake with no
    literal left to grep for. get_governed_regions() is guaranteed non-empty (its own
    _fallback() always returns a one-element list), so [0] is safe.

    Verified behaviour (GOVERN_REGIONS_CONFIG_PATH pointed at a two-region file):
      GOVERN_AWS_REGION=us-east-1                     -> us-east-1  (explicit wins)
      GOVERN_AWS_REGION unset, governed set present   -> eu-west-1  (first governed)
      GOVERN_AWS_REGION unset, no governed-set file   -> us-east-2  (= AWS_REGION)
    That last row is region_config._fallback()'s documented tier-2 contract, not a
    regression of this fix: with tier 2 entirely unconfigured there is no governed
    region to name, and deferring to the one declared fallback beats re-deciding it
    here.

    The branch is taken on `GOVERN_AWS_REGION_DECLARED`, not on the region string being
    empty, and the difference is the whole point. GOVERN_AWS_REGION's default became ""
    (follow AWS_REGION) and `Settings.__init__` now fills it, so by the time anything reads
    it the string is always non-empty - testing emptiness here would have made the middle
    row unreachable and quietly routed customer prompts to the CONTROL-PLANE region for
    every deployer who governs a region they do not host AVA in. The flag records which of
    the two happened; the string alone can no longer tell you.
    """
    if settings.GOVERN_AWS_REGION_DECLARED:
        return settings.GOVERN_AWS_REGION.strip()
    return region_config.get_governed_regions()[0]


def _load_model_catalog() -> _CatalogResult:
    """Load the model catalog from DynamoDB, or fall back to compiled-in defaults.

    Returns the catalog together with whether it was really read from the
    account, so no caller can present the fallback as this account's config.
    """
    from services.config_generator import ModelCatalogEntry

    table_name = settings.DEPLOYMENTS_TABLE_NAME
    # table_region(), not settings.AWS_REGION directly, so DEPLOYMENTS_TABLE_REGION is
    # honoured here as it is everywhere else this table is read. Reading it raw meant
    # the override silently did nothing on this one path.
    region = region_config.table_region("DEPLOYMENTS")

    # An unconfigured table is a configuration state, not a failure. It needs its own
    # branch because boto3 accepts `Table("")` happily and only raises
    # ParamValidationError ("Invalid length for parameter TableName") once the query
    # runs - so without this guard the misconfiguration arrived from inside the try
    # below and got reported as an AWS outage.
    if not table_name:
        return _CatalogResult(
            _default_model_catalog(),
            live=False,
            source="not-configured",
            note=(
                "DEPLOYMENTS_TABLE_NAME is not configured, so these are AVA's "
                "compiled-in default models, not this account's catalog."
            ),
        )

    try:
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(table_name)

        response = table.query(
            KeyConditionExpression="pk = :pk",
            ExpressionAttributeValues={":pk": "MODEL_CATALOG"},
        )
        items = response.get("Items", [])

        catalog = []
        for item in items:
            catalog.append(
                ModelCatalogEntry(
                    model_id=item.get("model_id", ""),
                    display_name=item.get("display_name", ""),
                    provider=item.get("provider", "bedrock"),
                    litellm_prefix=item.get("litellm_prefix", "bedrock/"),
                    # Tier 2 (governed fleet), not AWS_REGION: this field becomes
                    # litellm_params["aws_region_name"] and the Bedrock api_base, so it
                    # is where model INFERENCE is routed - a governed-fleet region, not
                    # the control plane's. Defaulting it to AWS_REGION sent catalog rows
                    # with no explicit region to us-east-2, which holds no guardrails.
                    #
                    # `or`, not `.get(key, default)`: DynamoDB happily stores this
                    # attribute as NULL or "", and `.get("region", default)` returns the
                    # stored None/"" rather than the default in both cases. None then
                    # formats into the Mantle api_base as the literal string "None"
                    # (https://bedrock-mantle.None.api.aws/v1) and "" leaves
                    # aws_region_name empty so botocore falls back to the ambient region.
                    # Neither raises here; both surface later as a routing failure or a
                    # silently retargeted call.
                    region=item.get("region") or _default_inference_region(),
                    mode=item.get("mode", "chat"),
                    input_cost_per_token=float(item.get("input_cost_per_token", 0)),
                    output_cost_per_token=float(item.get("output_cost_per_token", 0)),
                    max_input_tokens=int(item.get("max_input_tokens", 0)),
                    max_output_tokens=int(item.get("max_output_tokens", 0)),
                    active=item.get("active", True),
                    fallback_models=item.get("fallback_models", []),
                )
            )
        # Deliberately NOT a per-row skip like the spend scans use: this catalog is what
        # /gateway/config/regenerate publishes to the live gateway, so quietly dropping a
        # malformed row would quietly remove that model from the gateway. One bad row
        # therefore fails the whole read and lands in the except below, which reports
        # catalog_live=false instead of serving a silently short catalog.
    except Exception as e:
        # WARNING, not debug. The app logs at INFO, so the old logger.debug meant a
        # ResourceNotFoundException, an AccessDeniedException, a throttle or a wrong-region
        # setting produced no log line at all while the response silently swapped in
        # hardcoded models. Name the exception type, the table and the region: "Could not
        # load model catalog" gave a reader nothing to act on. No exc_info - this fires
        # once per request and a traceback per request buries the signal.
        logger.warning(
            "Model catalog read failed (%s) on DynamoDB table %r in %s: %s. "
            "/gateway/models falls back to AVA's compiled-in default catalog with "
            "catalog_live=false, and /gateway/config/regenerate will refuse to publish.",
            type(e).__name__,
            table_name,
            region,
            e,
        )
        return _CatalogResult(
            _default_model_catalog(),
            live=False,
            source="unavailable-fallback",
            note=(
                f"Model catalog table '{table_name}' in {region} is unreachable "
                f"({type(e).__name__}); showing AVA's compiled-in default models. If the "
                "table exists in another region, set DEPLOYMENTS_TABLE_REGION."
            ),
        )

    if not catalog:
        # A reachable table with no MODEL_CATALOG rows IS a measured answer, but the rows
        # we hand back are still the compiled-in defaults, so this cannot claim live -
        # only that the emptiness was measured rather than guessed. The distinct source
        # value is what lets regenerate_config treat this as a bootstrap state and the
        # unavailable-fallback case above as a refusal.
        return _CatalogResult(
            _default_model_catalog(),
            live=False,
            source="default-catalog",
            note=(
                f"No MODEL_CATALOG rows in '{table_name}' ({region}); showing AVA's "
                "compiled-in default models. Seed the catalog to manage models per account."
            ),
        )

    return _CatalogResult(catalog, live=True, source="deployments-table", note=None)


def _default_model_catalog():
    """Return a default model catalog with standard AVA Bedrock models.

    Every entry below used to hardcode region="us-east-2". That literal is the demo
    account's AWS_REGION - tier 1, the control plane - while the governed fleet lives in
    GOVERN_AWS_REGION=us-east-1. The literal was therefore wrong by exactly one region
    tier, and nothing anywhere raised: Bedrock in us-east-2 serves these model ids, so
    the call returns 200 and the response carries no hint that inference left the
    governed estate.

    Verified read-only against the demo account on 2026-09-14:
      - `bedrock list-guardrails`: us-east-1 -> 7 guardrails (FSI-Best-Practice-Guardrail
        and friends); us-east-2 -> 0. Guardrails are regional and cannot be attached
        across regions, so a model pinned to us-east-2 runs with no guardrail at all.
      - `bedrock get-model-invocation-logging-configuration`: us-east-1 -> CloudWatch
        /aws/bedrock/model-invocations plus an S3 sink; us-east-2 -> empty body, exit 0.
        That empty-body-exit-0 is the whole problem in one API call: invocation logging
        is simply off, and asking about it does not error.
      - `bedrock list-inference-profiles`: 75 profiles in us-east-1 vs 73 in us-east-2.
    Combined blast radius: /gateway/config/regenerate publishes this catalog to the live
    LiteLLM gateway, so on any catalog-read failure the gateway was reconfigured to send
    real prompts to a region with no guardrails and no invocation logging - while the
    Govern dashboards, which read the us-east-1 log group, kept reporting zero
    invocations. Ungoverned traffic that also looks like no traffic.

    The region is resolved once here rather than per entry so a future entry cannot
    reintroduce a literal by copy-paste, and it is resolved at call time (not import
    time) so an env change is picked up on the next request without a restart.
    """
    from services.config_generator import ModelCatalogEntry

    region = _default_inference_region()

    return [
        ModelCatalogEntry(
            model_id="us.anthropic.claude-opus-4-8",
            display_name="Claude Opus 4.8",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.000015,
            output_cost_per_token=0.000075,
            max_input_tokens=200000,
            max_output_tokens=32000,
            active=True,
            fallback_models=["us.anthropic.claude-sonnet-4-6"],
        ),
        ModelCatalogEntry(
            model_id="us.anthropic.claude-sonnet-4-6",
            display_name="Claude Sonnet 4.6",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.000003,
            output_cost_per_token=0.000015,
            max_input_tokens=200000,
            max_output_tokens=16384,
            active=True,
            fallback_models=["us.amazon.nova-pro-v1:0"],
        ),
        ModelCatalogEntry(
            model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            display_name="Claude Haiku 4.5",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.0000008,
            output_cost_per_token=0.000004,
            max_input_tokens=200000,
            max_output_tokens=8192,
            active=True,
        ),
        ModelCatalogEntry(
            model_id="openai.gpt-5.5",
            display_name="GPT-5.5",
            provider="bedrock-mantle",
            litellm_prefix="bedrock_mantle/",
            region=region,
            mode="chat",
            input_cost_per_token=0.0000055,
            output_cost_per_token=0.000033,
            max_input_tokens=272000,
            max_output_tokens=16384,
            active=True,
        ),
        ModelCatalogEntry(
            model_id="us.amazon.nova-pro-v1:0",
            display_name="Amazon Nova Pro",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.0000008,
            output_cost_per_token=0.0000032,
            max_input_tokens=300000,
            max_output_tokens=5120,
            active=True,
        ),
        ModelCatalogEntry(
            model_id="us.amazon.nova-lite-v1:0",
            display_name="Amazon Nova Lite",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.00000006,
            output_cost_per_token=0.00000024,
            max_input_tokens=300000,
            max_output_tokens=5120,
            active=True,
        ),
        ModelCatalogEntry(
            model_id="us.amazon.nova-lite-v2:0",
            display_name="Amazon Nova Lite v2",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region=region,
            mode="chat",
            input_cost_per_token=0.00000004,
            output_cost_per_token=0.00000016,
            max_input_tokens=300000,
            max_output_tokens=5120,
            active=True,
        ),
        ModelCatalogEntry(
            model_id="openai.gpt-5.4",
            display_name="GPT-5.4",
            provider="bedrock-mantle",
            litellm_prefix="bedrock_mantle/",
            region=region,
            mode="chat",
            input_cost_per_token=0.00000275,
            output_cost_per_token=0.0000165,
            max_input_tokens=272000,
            max_output_tokens=16384,
            active=True,
        ),
    ]


def _get_spend_by_model() -> _SpendByModelResult:
    """Get total spend per model from the FinOps data store.

    Scans the daily aggregated spend rows and sums cost per model, paginating
    until LastEvaluatedKey is exhausted. Reports whether the scan actually ran,
    so no caller can render an unmeasured 0.0 as currency.
    """
    table_name = settings.FINOPS_SPEND_TABLE_NAME
    # Reader must resolve the spend table's home the same way the writer does.
    region = region_config.table_region("FINOPS_SPEND")

    # FINOPS_SPEND_TABLE_NAME defaults to "" in core.config, and boto3 accepts
    # `Table("")` without complaint - it only raises ParamValidationError ("Invalid
    # length for parameter TableName") once scan() runs. Without this guard an unset
    # setting therefore arrived as an exception from the AWS call and got reported as
    # an unreachable table, sending the reader to look for an outage or an IAM gap.
    if not table_name:
        return _SpendByModelResult(
            {},
            live=False,
            source="not-configured",
            note=(
                "Per-model spend store not configured - set FINOPS_SPEND_TABLE_NAME and run "
                "the spend aggregator. The spend figures shown are placeholders, not $0.00 of "
                "measured usage."
            ),
        )

    try:
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(table_name)

        spend_by_model: Dict[str, float] = {}
        unattributed_usd = 0.0
        skipped_rows = 0
        scan_kwargs = {
            "FilterExpression": "begins_with(pk, :prefix) AND #p = :period",
            "ExpressionAttributeNames": {"#p": "period"},
            "ExpressionAttributeValues": {
                ":prefix": "SPEND#",
                ":period": "daily",
            },
            "Limit": 500,
        }

        while True:
            response = table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                try:
                    # `or 0` before float(): DynamoDB can hold a NULL or an empty string
                    # here, and float(None) raises TypeError. Previously that TypeError
                    # escaped to the bare except below and returned {}, so ONE malformed
                    # row zeroed the reported spend of EVERY model. Skip and count the
                    # row instead, and disclose the count in the note.
                    cost = float(item.get("total_cost_usd") or 0)
                except (TypeError, ValueError):
                    skipped_rows += 1
                    continue

                raw_model = item.get("model_id")
                if raw_model:
                    model_id = str(raw_model)
                else:
                    # Was `item.get("model_id", "")`, which bucketed unattributed spend
                    # under "" - and since no catalog entry has an empty model_id, the
                    # caller's .get(entry.model_id) never matched it and the money simply
                    # vanished from the response. Bucket it under a name and total it, so
                    # the note can state how much spend the per-model figures exclude.
                    model_id = "unknown"
                    unattributed_usd += cost

                spend_by_model[model_id] = spend_by_model.get(model_id, 0.0) + cost

            # Terminates: ExclusiveStartKey advances to the key DynamoDB just returned,
            # and DynamoDB omits LastEvaluatedKey on the final page. Reading it via .get()
            # rather than `in` also covers a driver returning an explicit null.
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            scan_kwargs["ExclusiveStartKey"] = last_key

        notes = []
        if not spend_by_model:
            # A reachable table with no rows IS live data. Say the zero was measured, so
            # a reader does not have to guess whether the query ran.
            notes.append(
                "No daily spend rows recorded yet - a measured zero, not a failed query."
            )
        if unattributed_usd:
            notes.append(
                f"${unattributed_usd:.6f} of recorded spend carries no model_id; it is "
                "totalled under 'unknown' and no catalog row matches it, so it is NOT "
                "included in the per-model figures."
            )
        if skipped_rows:
            notes.append(
                f"{skipped_rows} spend row(s) had an unreadable total_cost_usd and were "
                "excluded, so the per-model totals are lower than actual spend."
            )
        return _SpendByModelResult(
            spend_by_model,
            live=True,
            source="finops-spend-store",
            note=" ".join(notes) or None,
        )

    except Exception as e:
        # WARNING, not debug. The app logs at INFO, so the old logger.debug meant a
        # ResourceNotFoundException, an AccessDeniedException, a throttle or a wrong-region
        # setting produced NO log line at all - invisible even to log aggregation - while
        # the caller went on to publish $0.00 per model. Name the exception type, the
        # table, the region and the user-visible consequence.
        logger.warning(
            "Per-model spend scan failed (%s) on DynamoDB table %r in %s: %s. "
            "/gateway/models reports spend_usd=0.0 for every model with spend_live=false; "
            "those zeros are NOT measured spend.",
            type(e).__name__,
            table_name,
            region,
            e,
        )
        return _SpendByModelResult(
            {},
            live=False,
            source="unavailable-fallback",
            note=(
                f"FinOps spend store unreachable - table '{table_name}' in {region} "
                f"({type(e).__name__}). Per-model spend could not be measured; the 0.00 "
                "figures shown are placeholders. If the table exists in another region, "
                "set FINOPS_SPEND_TABLE_REGION."
            ),
        )


def _query_spend_records(
    use_case: Optional[str] = None,
    team: Optional[str] = None,
    model: Optional[str] = None,
    period: str = "daily",
    days: int = 30,
) -> _SpendRecordsResult:
    """Query spend records from the FinOps DynamoDB table with filters.

    Paginates until LastEvaluatedKey is exhausted to avoid silently
    dropping records. Reports whether the scan actually ran, so a caller never
    presents a failed query's empty result as a period with no spend.

    Args:
        use_case: Optional use case filter.
        team: Optional team filter.
        model: Optional model filter.
        period: Aggregation period (daily, weekly, monthly).
        days: Number of days of history to include.

    Returns:
        The matching records plus a live/source/note triple describing whether
        the table was actually reached.
    """
    table_name = settings.FINOPS_SPEND_TABLE_NAME
    # Reader must resolve the spend table's home the same way the writer does.
    region = region_config.table_region("FINOPS_SPEND")

    # Same guard and same reason as _get_spend_by_model: FINOPS_SPEND_TABLE_NAME defaults
    # to "", boto3 defers the ParamValidationError to the scan() call, and a config gap
    # dressed up as an AWS failure sends the reader hunting for the wrong cause.
    if not table_name:
        return _SpendRecordsResult(
            [],
            live=False,
            source="not-configured",
            note=(
                "Spend store not configured - set FINOPS_SPEND_TABLE_NAME and run the spend "
                "aggregator. No spend was measured, so no total can be reported."
            ),
        )

    try:
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(table_name)

        # Build filter expression
        filter_parts = []
        expr_values = {":period": period}
        expr_names = {"#p": "period"}

        filter_parts.append("#p = :period")

        if use_case:
            filter_parts.append("use_case_id = :use_case")
            expr_values[":use_case"] = use_case

        if team:
            filter_parts.append("team_id = :team")
            expr_values[":team"] = team

        if model:
            filter_parts.append("model_id = :model")
            expr_values[":model"] = model

        # Date filter based on days parameter
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        if period == "daily":
            date_cutoff = cutoff.strftime("%Y-%m-%d")
        elif period == "weekly":
            date_cutoff = cutoff.strftime("%G-W%V")
        elif period == "monthly":
            date_cutoff = cutoff.strftime("%Y-%m")
        else:
            date_cutoff = cutoff.strftime("%Y-%m-%dT%H:00:00Z")

        filter_parts.append("#d >= :date_cutoff")
        expr_values[":date_cutoff"] = date_cutoff
        expr_names["#d"] = "date"

        filter_expression = " AND ".join(filter_parts)

        scan_kwargs = {
            "FilterExpression": f"begins_with(pk, :prefix) AND {filter_expression}",
            "ExpressionAttributeNames": expr_names,
            "ExpressionAttributeValues": {**expr_values, ":prefix": "SPEND#"},
            "Limit": 1000,
        }

        records = []
        skipped_rows = 0

        while True:
            response = table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                try:
                    records.append(
                        SpendSummaryRecord(
                            use_case=item.get("use_case_id") or "unknown",
                            team=item.get("team_id") or "unknown",
                            model=item.get("model_id") or "unknown",
                            period=item.get("period") or period,
                            date=str(item.get("date") or ""),
                            # `or 0` before the casts: a NULL attribute makes float(None) /
                            # int(None) raise TypeError, and a numeric `date` makes pydantic
                            # raise ValidationError (a ValueError subclass). Either one used
                            # to escape to the bare except below and return [], so a single
                            # malformed row turned the whole period's spend into $0.00.
                            total_cost_usd=float(item.get("total_cost_usd") or 0),
                            input_tokens=int(item.get("input_tokens") or 0),
                            output_tokens=int(item.get("output_tokens") or 0),
                            request_count=int(item.get("request_count") or 0),
                            avg_latency_ms=float(item.get("avg_latency_ms") or 0),
                        )
                    )
                except (TypeError, ValueError):
                    skipped_rows += 1
                    continue

            # Terminates: ExclusiveStartKey advances to the key DynamoDB just returned,
            # and DynamoDB omits LastEvaluatedKey on the final page.
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            scan_kwargs["ExclusiveStartKey"] = last_key

        # Sort by date descending
        records.sort(key=lambda r: r.date, reverse=True)

        notes = []
        if not records:
            # A reachable table with nothing in the window IS live data. Naming it as a
            # measured zero is the whole point: the caller must not have to guess.
            notes.append(
                f"No {period} spend rows in the trailing {days} day(s) - a measured zero, "
                "not a failed query."
            )
        if skipped_rows:
            notes.append(
                f"{skipped_rows} spend row(s) were unreadable and excluded, so the totals "
                "are lower than actual spend."
            )
        return _SpendRecordsResult(
            records,
            live=True,
            source="finops-spend-store",
            note=" ".join(notes) or None,
        )

    except Exception as e:
        # WARNING, not ERROR: an unreachable dependency degrades this view but is not an
        # application fault, and the route turns it into a 503 the caller can see. Name the
        # exception type, the table, the region and the consequence - the old bare "Failed
        # to query spend records: <msg>" told a reader neither which table nor which region
        # was searched, which is the failure that actually happens here.
        logger.warning(
            "Spend record scan failed (%s) on DynamoDB table %r in %s: %s. "
            "/gateway/spend and /gateway/spend/export return 503 rather than a $0.00 total.",
            type(e).__name__,
            table_name,
            region,
            e,
        )
        return _SpendRecordsResult(
            [],
            live=False,
            source="unavailable-fallback",
            note=(
                f"FinOps spend store unreachable - table '{table_name}' in {region} "
                f"({type(e).__name__}). Spend could not be measured, so no total is "
                "reported. If the table exists in another region, set "
                "FINOPS_SPEND_TABLE_REGION."
            ),
        )


# ---------------------------------------------------------------------------
# Guardrail Assignment Models (Task 16.2, Requirements 15.4, 15.6)
# ---------------------------------------------------------------------------


class GuardrailAssignRequest(BaseModel):
    """Request model for assigning a guardrail to a use case."""

    use_case: str = Field(..., min_length=1, description="Use case identifier (e.g., 'kyc_banking')")
    team: str = Field(..., min_length=1, description="Team identifier (e.g., 'fsi-compliance')")
    guardrail_id: str = Field(..., min_length=1, description="Bedrock Guardrail ID to assign")
    guardrail_version: str = Field(default="DRAFT", description="Guardrail version (default: DRAFT)")


class GuardrailAssignResponse(BaseModel):
    """Response model after assigning a guardrail."""

    use_case: str
    team: str
    guardrail_id: str
    guardrail_version: str
    assigned_by: str
    assigned_at: str


class GuardrailAssignmentListResponse(BaseModel):
    """Response model for listing guardrail assignments."""

    assignments: List[GuardrailAssignResponse]
    total_count: int


# ---------------------------------------------------------------------------
# Guardrail Assignment Service Singleton
# ---------------------------------------------------------------------------

_guardrail_service = None


def _get_guardrail_service():
    """Lazily initialize and return the GuardrailService."""
    global _guardrail_service
    if _guardrail_service is None:
        from services.guardrail_service import GuardrailService

        # Regions resolve per tier inside the service (control-plane table vs
        # governed Bedrock/CloudWatch); see core.region_config.
        _guardrail_service = GuardrailService(table_name=settings.GUARDRAILS_TABLE_NAME)
    return _guardrail_service


# ---------------------------------------------------------------------------
# POST /api/gateway/guardrails/assign — Assign guardrail (Req 15.4)
# ---------------------------------------------------------------------------


@router.post("/guardrails/assign", response_model=GuardrailAssignResponse, status_code=201)
async def assign_guardrail(
    req: GuardrailAssignRequest,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Assign a Bedrock Guardrail to a specific use case or team.

    Allows different guardrail identifiers per use case or team via Control Plane
    configuration. When a request arrives at the gateway, the use_case from
    the virtual key metadata is used to look up the assigned guardrail.

    If no specific guardrail is assigned to a use case, the gateway falls back
    to the team-level default, then to the global default guardrail.

    Requires the "operator" role.
    """
    svc = _get_guardrail_service()

    try:
        assignment = svc.assign_guardrail(
            use_case=req.use_case,
            team=req.team,
            guardrail_id=req.guardrail_id,
            guardrail_version=req.guardrail_version,
            # Not the literal "control-plane-operator": that is a worse version of the
            # created_by="user" defect fixed across the route tree - it reads like a
            # real service principal, so a guardrail assignment whose author was never
            # captured looked attributed to something specific. x-user-email is the
            # same header core/rbac.py:88 reads to decide the role.
            assigned_by=x_user_email or "unknown",
        )

        return GuardrailAssignResponse(
            use_case=assignment.use_case,
            team=assignment.team,
            guardrail_id=assignment.guardrail_id,
            guardrail_version=assignment.guardrail_version,
            assigned_by=assignment.assigned_by,
            assigned_at=assignment.assigned_at,
        )
    except Exception as e:
        logger.error("Failed to assign guardrail: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to assign guardrail: {str(e)}")


# ---------------------------------------------------------------------------
# GET /api/gateway/guardrails/assignments — List assignments (Req 15.4)
# ---------------------------------------------------------------------------


@router.get("/guardrails/assignments", response_model=GuardrailAssignmentListResponse)
async def list_guardrail_assignments(
    team: Optional[str] = Query(default=None, description="Filter assignments by team"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List all guardrail-to-use-case assignments.

    Optionally filter by team. Requires at minimum the "viewer" role.
    """
    svc = _get_guardrail_service()

    try:
        assignments = svc.list_guardrail_assignments(team=team)
        response_items = [
            GuardrailAssignResponse(
                use_case=a.use_case,
                team=a.team,
                guardrail_id=a.guardrail_id,
                guardrail_version=a.guardrail_version,
                assigned_by=a.assigned_by,
                assigned_at=a.assigned_at,
            )
            for a in assignments
        ]
        return GuardrailAssignmentListResponse(
            assignments=response_items,
            total_count=len(response_items),
        )
    except Exception as e:
        logger.error("Failed to list guardrail assignments: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to list guardrail assignments: {str(e)}")


# ---------------------------------------------------------------------------
# DELETE /api/gateway/guardrails/assignments/{use_case} — Remove assignment
# ---------------------------------------------------------------------------


@router.delete("/guardrails/assignments/{use_case}", status_code=204)
async def remove_guardrail_assignment(
    use_case: str,
    team: str = Query(..., description="Team identifier for the assignment to remove"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Remove a guardrail assignment for a use case / team pair.

    After removal, the use case will fall back to the team-level default
    or global default guardrail.

    Requires the "operator" role.
    """
    svc = _get_guardrail_service()

    deleted = svc.remove_guardrail_assignment(use_case=use_case, team=team)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"No guardrail assignment found for use_case='{use_case}', team='{team}'",
        )


# ---------------------------------------------------------------------------
# GET /api/gateway/guardrails/resolve/{use_case} — Resolve guardrail for use case
# ---------------------------------------------------------------------------


@router.get("/guardrails/resolve/{use_case}", response_model=GuardrailAssignResponse)
async def resolve_guardrail_for_use_case(
    use_case: str,
    team: Optional[str] = Query(default=None, description="Team for fallback resolution"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Resolve which guardrail applies to a given use case.

    Follows the resolution order:
    1. Use-case-specific assignment
    2. Team-level default (use_case='__default__')
    3. Global default guardrail

    This endpoint is used by the gateway to look up the appropriate guardrail
    for each incoming request. The lookup adds less than 50ms at p95.

    Requires at minimum the "viewer" role.
    """
    svc = _get_guardrail_service()

    assignment = svc.get_guardrail_for_use_case(use_case=use_case, team=team)
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail=f"No guardrail assignment found for use_case='{use_case}' (no default configured)",
        )

    return GuardrailAssignResponse(
        use_case=assignment.use_case,
        team=assignment.team,
        guardrail_id=assignment.guardrail_id,
        guardrail_version=assignment.guardrail_version,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
    )
