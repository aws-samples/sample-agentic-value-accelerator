"""Govern SageMaker — live SageMaker control evaluation data.

Read-through GET routes (no CRUD). Follows the govern slice route pattern —
lazy service singleton reading settings, honest live/fallback responses.

Endpoints:
  - GET /govern/sagemaker/models        -> SageMaker deployed models
  - GET /govern/sagemaker/endpoints     -> Inference endpoints with status
  - GET /govern/sagemaker/model-registry -> Registered model packages
  - GET /govern/sagemaker/clarify-jobs  -> Clarify bias/explainability jobs
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_sagemaker import (
    ClarifyJobsResponse,
    ModelRegistryResponse,
    SageMakerEndpointsResponse,
    SageMakerModelsResponse,
)
from services.govern_sagemaker_service import GovernSageMakerService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/sagemaker", tags=["govern-sagemaker"])

_svc: Optional[GovernSageMakerService] = None


def get_service() -> GovernSageMakerService:
    global _svc
    if _svc is None:
        _svc = GovernSageMakerService(region=settings.AWS_REGION)
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
