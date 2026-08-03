"""Govern Models — real Bedrock catalog + CloudWatch runtime metrics.

Read-through GET routes (no CRUD). Follows the govern slice route pattern —
lazy service singleton reading settings, honest live/fallback responses.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_models import FoundationModelCatalog, ModelMetricsResponse
from services.govern_models_service import GovernModelsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/models", tags=["govern-models"])

_svc: Optional[GovernModelsService] = None


def get_service() -> GovernModelsService:
    global _svc
    if _svc is None:
        _svc = GovernModelsService(region=settings.AWS_REGION)
    return _svc


@router.get("/catalog", response_model=FoundationModelCatalog)
async def get_catalog(provider: Optional[str] = Query(default=None, description="Filter by provider name, e.g. 'Anthropic'"), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock foundation-model catalog (bedrock:ListFoundationModels)."""
    return get_service().get_catalog(provider=provider)


@router.get("/runtime-metrics", response_model=ModelMetricsResponse)
async def get_runtime_metrics(days: int = Query(default=7, ge=1, le=30, description="Trailing window in days"), _=Depends(require_role(Role.VIEWER))):
    """Per-model runtime health from CloudWatch AWS/Bedrock (invocations, latency, errors, tokens)."""
    return get_service().get_runtime_metrics(days=days)
