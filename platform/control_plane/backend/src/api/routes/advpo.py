"""Advanced Prompt Optimization (AdvPO) API routes.

Thin pass-through to Bedrock's create/get advanced prompt optimization job APIs.
Datasets and results are stored in the platform-managed S3 bucket.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role
import logging

from models.advpo import (
    AdvPODatasetList,
    AdvPODatasetUpload,
    AdvPODatasetUploadResult,
    AdvPOJob,
    AdvPOJobCreate,
    AdvPOJobList,
    AdvPOJobSummary,
    AdvPOModelList,
    AdvPOResults,
)
from services.advpo_service import AdvPOService
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/advpo", tags=["advpo"])

_svc = None


def get_service() -> AdvPOService:
    global _svc
    if _svc is None:
        _svc = AdvPOService(
            region=settings.AWS_REGION,
            results_bucket=settings.ADVPO_BUCKET,
        )
    return _svc


@router.get("/models", response_model=AdvPOModelList)
async def list_models(_=Depends(require_role(Role.OPERATOR))):
    """List target models available in the backend's AWS region.

    Returns global.* inference profiles, the region's own CRIS profiles
    (us.* / eu.* / apac.*), and in-region on-demand foundation models.
    """
    svc = get_service()
    try:
        return svc.list_models()
    except Exception as e:
        logger.error(f"Failed to list AdvPO models: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")


@router.get("/datasets", response_model=AdvPODatasetList)
async def list_datasets(_=Depends(require_role(Role.OPERATOR))):
    """List existing datasets under the datasets/ prefix in the bucket"""
    svc = get_service()
    try:
        return svc.list_datasets()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list AdvPO datasets: {e}")
        raise HTTPException(status_code=502, detail=f"S3 error: {str(e)[:200]}")


@router.post("/datasets", response_model=AdvPODatasetUploadResult, status_code=201)
async def upload_dataset(req: AdvPODatasetUpload, _=Depends(require_role(Role.OPERATOR))):
    """Upload an evaluation dataset (JSONL) into the dedicated datasets/ prefix.
    A 6-character uuid suffix is appended to the file name to keep it unique."""
    svc = get_service()
    try:
        return svc.upload_dataset(req.name, req.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to upload AdvPO dataset: {e}")
        raise HTTPException(status_code=502, detail=f"S3 error: {str(e)[:200]}")


@router.delete("/datasets", status_code=202)
async def delete_dataset(key: str = Query(..., description="Dataset object key under datasets/"), _=Depends(require_role(Role.OPERATOR))):
    """Delete an existing dataset from the bucket's datasets/ prefix"""
    svc = get_service()
    try:
        svc.delete_dataset(key)
        return {"status": "deleted", "key": key}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete AdvPO dataset {key}: {e}")
        raise HTTPException(status_code=502, detail=f"S3 error: {str(e)[:200]}")


@router.get("/jobs", response_model=AdvPOJobList)
async def list_jobs(
    max_results: int = Query(default=50, ge=1, le=1000),
    next_token: str | None = Query(default=None),
    _=Depends(require_role(Role.OPERATOR)),
):
    """List advanced prompt optimization jobs (most recent first)"""
    svc = get_service()
    try:
        return svc.list_jobs(max_results=max_results, next_token=next_token)
    except Exception as e:
        logger.error(f"Failed to list AdvPO jobs: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")


@router.post("/jobs", response_model=AdvPOJobSummary, status_code=201)
async def create_job(req: AdvPOJobCreate, _=Depends(require_role(Role.OPERATOR))):
    """Create a new advanced prompt optimization job in Bedrock"""
    svc = get_service()
    try:
        return svc.create_job(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create AdvPO job: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")


@router.get("/jobs/{job_identifier}", response_model=AdvPOJob)
async def get_job(job_identifier: str, _=Depends(require_role(Role.OPERATOR))):
    """Get the status and details of an advanced prompt optimization job"""
    svc = get_service()
    try:
        return svc.get_job(job_identifier)
    except svc.bedrock_client.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="Optimization job not found")
    except Exception as e:
        logger.error(f"Failed to get AdvPO job {job_identifier}: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")


@router.get("/jobs/{job_identifier}/results", response_model=AdvPOResults)
async def get_job_results(job_identifier: str, _=Depends(require_role(Role.OPERATOR))):
    """Read the results JSONL for a completed job back from S3"""
    svc = get_service()
    try:
        return svc.read_results(job_identifier)
    except svc.bedrock_client.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="Optimization job not found")
    except svc.s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Results not available yet for this job")
    except Exception as e:
        logger.error(f"Failed to read AdvPO results for {job_identifier}: {e}")
        raise HTTPException(status_code=502, detail=f"S3 error: {str(e)[:200]}")


@router.post("/jobs/{job_identifier}/stop", status_code=202)
async def stop_job(job_identifier: str, _=Depends(require_role(Role.OPERATOR))):
    """Stop a running advanced prompt optimization job"""
    svc = get_service()
    try:
        svc.stop_job(job_identifier)
        return {"status": "stopping", "job_identifier": job_identifier}
    except svc.bedrock_client.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="Optimization job not found")
    except Exception as e:
        logger.error(f"Failed to stop AdvPO job {job_identifier}: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")


@router.delete("/jobs/{job_identifier}", status_code=202)
async def delete_job(job_identifier: str, _=Depends(require_role(Role.OPERATOR))):
    """Delete an advanced prompt optimization job"""
    svc = get_service()
    try:
        svc.delete_job(job_identifier)
        return {"status": "deleting", "job_identifier": job_identifier}
    except svc.bedrock_client.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="Optimization job not found")
    except Exception as e:
        logger.error(f"Failed to delete AdvPO job {job_identifier}: {e}")
        raise HTTPException(status_code=502, detail=f"Bedrock API error: {str(e)[:200]}")
