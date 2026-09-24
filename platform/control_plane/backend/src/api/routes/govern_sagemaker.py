"""Govern SageMaker — live SageMaker control evaluation data.

Read-through GET routes (no CRUD). Follows the govern slice route pattern —
lazy service singleton reading settings, honest live/fallback responses.

Endpoints:
  - GET /govern/sagemaker/models        -> SageMaker deployed models
  - GET /govern/sagemaker/endpoints     -> Inference endpoints with status
  - GET /govern/sagemaker/model-registry -> Registered model packages
  - GET /govern/sagemaker/clarify-jobs  -> Clarify bias/explainability jobs
  - GET /govern/sagemaker/model-cards   -> Model Cards for governance/documentation
  - GET /govern/sagemaker/lineage       -> ML Lineage graph (artifacts/contexts/associations)
  - GET /govern/sagemaker/model-monitor -> Model Monitor data-quality drift (baseline vs capture)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_sagemaker import (
    ClarifyJobsResponse,
    ModelCardsResponse,
    ModelLineageResponse,
    ModelMonitorResponse,
    ModelRegistryResponse,
    SageMakerEndpointsResponse,
    SageMakerModelsResponse,
)
from services.govern_sagemaker_service import GovernSageMakerService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/sagemaker", tags=["govern-sagemaker"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_sagemaker", region_scope.SINGLE_REGION, prefix="/govern/sagemaker")

_svc: Optional[GovernSageMakerService] = None


def get_service() -> GovernSageMakerService:
    global _svc
    if _svc is None:
        _svc = GovernSageMakerService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/models", response_model=SageMakerModelsResponse)
async def get_models(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of models to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker deployed models (sagemaker:ListModels)."""
    return get_service().get_models(max_results=max_results)


@router.get("/endpoints", response_model=SageMakerEndpointsResponse)
async def get_endpoints(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of endpoints to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker inference endpoints with status (sagemaker:ListEndpoints)."""
    return get_service().get_endpoints(max_results=max_results)


@router.get("/model-registry", response_model=ModelRegistryResponse)
async def get_model_registry(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of model packages to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker Model Registry packages (sagemaker:ListModelPackages)."""
    return get_service().get_model_registry(max_results=max_results)


@router.get("/clarify-jobs", response_model=ClarifyJobsResponse)
async def get_clarify_jobs(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of Clarify jobs to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker Clarify bias/explainability processing jobs (sagemaker:ListProcessingJobs filtered)."""
    return get_service().get_clarify_jobs(max_results=max_results)


@router.get("/model-cards", response_model=ModelCardsResponse)
async def get_model_cards(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of model cards to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker Model Cards for model governance and documentation (sagemaker:ListModelCards)."""
    return get_service().get_model_cards(max_results=max_results)


@router.get("/lineage", response_model=ModelLineageResponse)
async def get_lineage(
    max_results: int = Query(default=100, ge=1, le=500, description="Maximum number of lineage entities per type to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker ML Lineage graph.

    Composed from sagemaker:ListArtifacts, sagemaker:ListContexts, and
    sagemaker:ListAssociations. Returns an empty (but live=True) graph when the
    account has no lineage entities — the honest outcome, not a fabricated graph.
    """
    return get_service().get_lineage(max_results=max_results)


@router.get("/model-monitor", response_model=ModelMonitorResponse)
async def get_model_monitor(
    _=Depends(require_role(Role.VIEWER)),
):
    """Real SageMaker Model Monitor data-quality drift.

    Reads the seeded analyzer run's baseline constraints/statistics and the
    monitor-results constraint_violations.json + statistics.json from S3, plus
    DescribeProcessingJob for run status. Model Monitor scheduling is in AWS
    maintenance mode for this account, so drift comes from an on-demand analyzer
    processing job. live=True only when real drift data is present; otherwise an
    honest 'pending' or 'unavailable' fallback — violations are never fabricated.
    """
    return get_service().get_model_monitor()
