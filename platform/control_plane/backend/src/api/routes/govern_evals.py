"""Govern Evals — real Bedrock evaluation jobs, aggregated across governed regions."""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from core.region_config import get_governed_regions
from models.govern_evals import EvalScoresResponse, EvaluationJobsResponse
from services.govern_evals_service import GovernEvalsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/evals", tags=["govern-evals"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_evals", region_scope.MULTI_REGION, prefix="/govern/evals")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernEvalsService] = {}


def _svc_for(region: str) -> GovernEvalsService:
    if region not in _svcs:
        _svcs[region] = GovernEvalsService(region=region)
    return _svcs[region]


def _lookup_regions() -> List[str]:
    """Governed regions to search for a single job, primary first."""
    return get_governed_regions() or [settings.GOVERN_AWS_REGION]


def _merge_jobs(results: List[Tuple[str, object]]) -> EvaluationJobsResponse:
    jobs: list = []
    total = completed = in_progress = failed = model_evals = rag_evals = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        jobs.extend(d.get("jobs", []))
        total += d.get("total", 0)
        completed += d.get("completed", 0)
        in_progress += d.get("in_progress", 0)
        failed += d.get("failed", 0)
        model_evals += d.get("model_evals", 0)
        rag_evals += d.get("rag_evals", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return EvaluationJobsResponse(
        jobs=jobs,
        total=total,
        completed=completed,
        in_progress=in_progress,
        failed=failed,
        model_evals=model_evals,
        rag_evals=rag_evals,
        live=live,
        source=f"bedrock-list-evaluation-jobs ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


@router.get("/jobs", response_model=EvaluationJobsResponse)
async def get_evaluation_jobs(max_jobs: int = Query(default=100, ge=1, le=300), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock model/RAG evaluation jobs (bedrock:ListEvaluationJobs), aggregated across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_jobs(max_jobs=max_jobs))
    return _merge_jobs(results)


@router.get("/scores", response_model=EvalScoresResponse)
async def get_evaluation_scores(
    job_name: str = Query(..., description="Evaluation job name (safer than ARN)"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real per-metric scores parsed from a job's S3 result files (GetEvaluationJob + s3:GetObject).

    Takes a name, not an ARN, so account IDs never round-trip through the browser. The
    name is resolved to the job's real ARN off ListEvaluationJobs, because
    GetEvaluationJob rejects a name (see GovernEvalsService.resolve_job_arn).

    Resolution walks the governed regions, primary first, and stops at the region that
    owns the job. It cannot pin to the primary region: /jobs aggregates the whole
    governed set and EvaluationJob carries no region field, so the UI can legitimately
    ask for a job that lives in a secondary region, and a primary-only lookup would
    answer "no scores" for a job whose scores exist. Only the owning region does the S3
    parse; the others cost one cached list call each.
    """
    searched: List[str] = []
    for region in _lookup_regions():
        svc = _svc_for(region)
        searched.append(region)
        job_arn = svc.resolve_job_arn(job_name)
        if job_arn:
            return svc.get_job_scores(job_arn=job_arn)

    return EvalScoresResponse(
        job_arn=job_name, job_name=job_name, live=False, source="job-not-found",
        note=(
            f"No evaluation job named '{job_name}' found in the governed region(s) "
            f"searched ({', '.join(searched)}). Scores are UNKNOWN for this job, not clean."
        ),
    )
