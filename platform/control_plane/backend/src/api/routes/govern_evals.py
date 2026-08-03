"""Govern Evals — real Bedrock evaluation jobs, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_evals import EvalScoresResponse, EvaluationJobsResponse
from services.govern_evals_service import GovernEvalsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/evals", tags=["govern-evals"])

_svc: Optional[GovernEvalsService] = None


def get_service() -> GovernEvalsService:
    global _svc
    if _svc is None:
        _svc = GovernEvalsService(region=settings.AWS_REGION)
    return _svc


@router.get("/jobs", response_model=EvaluationJobsResponse)
async def get_evaluation_jobs(max_jobs: int = Query(default=100, ge=1, le=300), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock model/RAG evaluation jobs (bedrock:ListEvaluationJobs)."""
    return get_service().get_jobs(max_jobs=max_jobs)


@router.get("/scores", response_model=EvalScoresResponse)
async def get_evaluation_scores(
    job_name: str = Query(..., description="Evaluation job name (safer than ARN)"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real per-metric scores parsed from a job's S3 result files (GetEvaluationJob + s3:GetObject).

    Uses job_name to look up the job, avoiding exposure of full ARNs with account IDs.
    """
    return get_service().get_job_scores_by_name(job_name=job_name)
