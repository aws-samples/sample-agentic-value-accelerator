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
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

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
    """Response for GET /api/gateway/models."""

    models: List[ModelInfo]
    total_count: int


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
        _finops_writer = FinOpsDataStoreWriter(
            table_name=table_name,
            region=settings.AWS_REGION,
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
    """
    from services.config_generator import ConfigGenerator, ModelCatalogEntry

    config_gen = _get_config_generator()

    # Load model catalog from DynamoDB or fallback to a static catalog
    model_catalog = _load_model_catalog()

    # Optionally enrich with per-model spend data
    spend_by_model = _get_spend_by_model()

    models = []
    for entry in model_catalog:
        spend = spend_by_model.get(entry.model_id, 0.0)
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
                spend_usd=spend,
            )
        )

    return ModelsResponse(models=models, total_count=len(models))


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
    """
    records = _query_spend_records(
        use_case=use_case,
        team=team,
        model=model,
        period=period,
        days=days,
    )

    total_cost = sum(r.total_cost_usd for r in records)
    total_requests = sum(r.request_count for r in records)

    return SpendSummaryResponse(
        records=records,
        total_cost_usd=round(total_cost, 6),
        total_requests=total_requests,
        period=period,
        filters={
            "use_case": use_case,
            "team": team,
            "model": model,
        },
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
    """
    records = _query_spend_records(
        use_case=use_case,
        team=team,
        model=model,
        period=period,
        days=days,
    )

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
    model_catalog = _load_model_catalog()

    if not model_catalog:
        raise HTTPException(
            status_code=400,
            detail="Model catalog is empty. Cannot generate config.",
        )

    try:
        # Generate config
        config_yaml = config_gen.generate(model_catalog)

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


def _load_model_catalog():
    """Load the model catalog from DynamoDB or provide defaults.

    Attempts to load from the deployments table. Falls back to a default
    catalog based on AVA's standard Bedrock models if unavailable.
    """
    from services.config_generator import ModelCatalogEntry

    # Try loading from DynamoDB model catalog table
    try:
        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        table = dynamodb.Table(settings.DEPLOYMENTS_TABLE_NAME)

        response = table.query(
            KeyConditionExpression="pk = :pk",
            ExpressionAttributeValues={":pk": "MODEL_CATALOG"},
        )

        items = response.get("Items", [])
        if items:
            catalog = []
            for item in items:
                catalog.append(
                    ModelCatalogEntry(
                        model_id=item.get("model_id", ""),
                        display_name=item.get("display_name", ""),
                        provider=item.get("provider", "bedrock"),
                        litellm_prefix=item.get("litellm_prefix", "bedrock/"),
                        region=item.get("region", settings.AWS_REGION),
                        mode=item.get("mode", "chat"),
                        input_cost_per_token=float(item.get("input_cost_per_token", 0)),
                        output_cost_per_token=float(item.get("output_cost_per_token", 0)),
                        max_input_tokens=int(item.get("max_input_tokens", 0)),
                        max_output_tokens=int(item.get("max_output_tokens", 0)),
                        active=item.get("active", True),
                        fallback_models=item.get("fallback_models", []),
                    )
                )
            return catalog
    except Exception as e:
        logger.debug("Could not load model catalog from DynamoDB: %s", str(e))

    # Return default catalog with standard Bedrock models
    return _default_model_catalog()


def _default_model_catalog():
    """Return a default model catalog with standard AVA Bedrock models."""
    from services.config_generator import ModelCatalogEntry

    return [
        ModelCatalogEntry(
            model_id="us.anthropic.claude-opus-4-8",
            display_name="Claude Opus 4.8",
            provider="bedrock",
            litellm_prefix="bedrock/",
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
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
            region="us-east-2",
            mode="chat",
            input_cost_per_token=0.00000275,
            output_cost_per_token=0.0000165,
            max_input_tokens=272000,
            max_output_tokens=16384,
            active=True,
        ),
    ]


def _get_spend_by_model() -> Dict[str, float]:
    """Get total spend per model from the FinOps data store.

    Queries DynamoDB for the most recent daily aggregated spend records
    and sums them per model. Paginates until LastEvaluatedKey is exhausted.
    """
    try:
        import boto3
        from boto3.dynamodb.conditions import Key

        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        table = dynamodb.Table(settings.FINOPS_SPEND_TABLE_NAME)

        spend_by_model: Dict[str, float] = {}
        scan_kwargs = {
            "FilterExpression": "begins_with(pk, :prefix) AND #p = :period",
            "ExpressionAttributeNames": {"#p": "period"},
            "ExpressionAttributeValues": {
                ":prefix": "SPEND#",
                ":period": "daily",
            },
            "Limit": 500,
        }

        # Paginate until all items are retrieved
        while True:
            response = table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                model_id = item.get("model_id", "")
                cost = float(item.get("total_cost_usd", 0))
                spend_by_model[model_id] = spend_by_model.get(model_id, 0.0) + cost

            # Check for more pages
            if "LastEvaluatedKey" in response:
                scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
            else:
                break

        return spend_by_model

    except Exception as e:
        logger.debug("Could not load per-model spend data: %s", str(e))
        return {}


def _query_spend_records(
    use_case: Optional[str] = None,
    team: Optional[str] = None,
    model: Optional[str] = None,
    period: str = "daily",
    days: int = 30,
) -> List[SpendSummaryRecord]:
    """Query spend records from the FinOps DynamoDB table with filters.

    Paginates until LastEvaluatedKey is exhausted to avoid silently
    dropping records.

    Args:
        use_case: Optional use case filter.
        team: Optional team filter.
        model: Optional model filter.
        period: Aggregation period (daily, weekly, monthly).
        days: Number of days of history to include.

    Returns:
        List of SpendSummaryRecord objects matching the filters.
    """
    try:
        import boto3
        from boto3.dynamodb.conditions import Key, Attr

        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        table = dynamodb.Table(settings.FINOPS_SPEND_TABLE_NAME)

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

        # Paginate until all items are retrieved
        while True:
            response = table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                records.append(
                    SpendSummaryRecord(
                        use_case=item.get("use_case_id", "unknown"),
                        team=item.get("team_id", "unknown"),
                        model=item.get("model_id", "unknown"),
                        period=item.get("period", period),
                        date=item.get("date", ""),
                        total_cost_usd=float(item.get("total_cost_usd", 0)),
                        input_tokens=int(item.get("input_tokens", 0)),
                        output_tokens=int(item.get("output_tokens", 0)),
                        request_count=int(item.get("request_count", 0)),
                        avg_latency_ms=float(item.get("avg_latency_ms", 0)),
                    )
                )

            # Check for more pages
            if "LastEvaluatedKey" in response:
                scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
            else:
                break

        # Sort by date descending
        records.sort(key=lambda r: r.date, reverse=True)
        return records

    except Exception as e:
        logger.error("Failed to query spend records: %s", str(e))
        return []


# Required for the boto3 import used in helper functions
import boto3


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

        _guardrail_service = GuardrailService(
            table_name=settings.GUARDRAILS_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _guardrail_service


# ---------------------------------------------------------------------------
# POST /api/gateway/guardrails/assign — Assign guardrail (Req 15.4)
# ---------------------------------------------------------------------------


@router.post("/guardrails/assign", response_model=GuardrailAssignResponse, status_code=201)
async def assign_guardrail(
    req: GuardrailAssignRequest,
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
            assigned_by="control-plane-operator",
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
