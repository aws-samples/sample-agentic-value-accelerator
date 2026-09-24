"""Govern Service Quotas (AI capacity/throttle) — read-through GET route.

Surfaces AWS Service Quotas throttle limits (TPM/RPM/RPS/concurrency/throughput)
for the AI service codes that gate agent capacity — Bedrock, SageMaker, and
Bedrock AgentCore — for operations / capacity planning. Single-region: resolves
against settings.GOVERN_AWS_REGION (the governed-resource region).
"""

import logging

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_service_quotas_service import (
    AiCapacityQuotasResponse,
    GovernServiceQuotasService,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/service-quotas", tags=["govern-service-quotas"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_service_quotas", region_scope.SINGLE_REGION, prefix="/govern/service-quotas")

# One cached service instance per region (preserves the internal TTL cache).
_svcs: dict[str, GovernServiceQuotasService] = {}


def _svc() -> GovernServiceQuotasService:
    region = settings.GOVERN_AWS_REGION
    if region not in _svcs:
        _svcs[region] = GovernServiceQuotasService(region=region)
    return _svcs[region]


@router.get("/ai", response_model=AiCapacityQuotasResponse)
async def get_ai_service_quotas(_=Depends(require_role(Role.VIEWER))):
    """AI throttle/capacity quotas (TPM, RPM, RPS, concurrency, provisioned throughput)
    from AWS Service Quotas for Bedrock, SageMaker, and Bedrock AgentCore."""
    return _svc().get_ai_quotas()
