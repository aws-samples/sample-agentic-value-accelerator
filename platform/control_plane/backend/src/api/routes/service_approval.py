"""Service Approval (Service Onboarding) API routes."""

import json
from functools import lru_cache
from pathlib import Path
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from core.rbac import require_role, Role
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import settings
from models.service_approval import (
    FileContent,
    FileTree,
    ServiceApprovalRun,
    ServiceApprovalRunCreate,
)
from services.service_approval_service import ServiceApprovalService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/service-approval", tags=["service-approval"])

_svc: Optional[ServiceApprovalService] = None
_SAR_SLUGS_PATH = Path(__file__).resolve().parents[2] / "data" / "sar-slugs.json"


class AwsService(BaseModel):
    label: str
    slug: str


@lru_cache(maxsize=1)
def _load_aws_services() -> List[AwsService]:
    try:
        raw = json.loads(_SAR_SLUGS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("sar-slugs.json not found at %s", _SAR_SLUGS_PATH)
        return []
    items = [AwsService(label=label, slug=slug) for label, slug in raw.items()]
    items.sort(key=lambda i: i.label.lower())
    return items


def get_service() -> ServiceApprovalService:
    global _svc
    if _svc is None:
        _svc = ServiceApprovalService(
            table_name=getattr(settings, "SERVICE_APPROVAL_TABLE_NAME", ""),
            bucket_name=getattr(settings, "SERVICE_APPROVAL_BUCKET", ""),
            region=settings.AWS_REGION,
            agent_runtime_arn=getattr(settings, "SERVICE_APPROVAL_AGENT_RUNTIME_ARN", ""),
            local_artifacts_root=getattr(settings, "SERVICE_APPROVAL_LOCAL_ROOT", None),
        )
    return _svc


def _user_email(request: Request) -> Optional[str]:
    return request.headers.get("x-user-email")


@router.get("/aws-services", response_model=List[AwsService])
async def list_aws_services(_=Depends(require_role(Role.VIEWER))):
    """Canonical AWS service catalog from the plugin's sar-slugs.json."""
    return _load_aws_services()


# -- runs --------------------------------------------------------------------

@router.post("/runs", response_model=ServiceApprovalRun, status_code=201)
async def create_run(req: ServiceApprovalRunCreate, request: Request, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    return svc.create_run(req, created_by=_user_email(request))


@router.get("/runs", response_model=List[ServiceApprovalRun])
async def list_runs(_=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    return svc.list_runs()


@router.get("/runs/{slug}", response_model=ServiceApprovalRun)
async def get_run(slug: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    run = svc.get_run(slug)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/runs/{slug}/cancel", response_model=ServiceApprovalRun)
async def cancel_run(slug: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    run = svc.cancel_run(slug)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/runs/{slug}", status_code=204)
async def delete_run(slug: str, _=Depends(require_role(Role.OPERATOR))):
    """Permanently delete a run — stops any in-flight execution, removes S3
    artifacts, and drops the DynamoDB record."""
    svc = get_service()
    if not svc.delete_run(slug):
        raise HTTPException(status_code=404, detail="Run not found")
    return Response(status_code=204)


# -- files -------------------------------------------------------------------

@router.get("/runs/{slug}/files", response_model=FileTree)
async def list_files(slug: str, phase: str = Query(..., description="Phase directory, e.g. 05-generate"), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    if not svc.get_run(slug):
        raise HTTPException(status_code=404, detail="Run not found")
    return svc.list_files(slug, phase)


@router.get("/runs/{slug}/file")
async def get_file(slug: str, path: str = Query(...), download: int = Query(default=0), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    if download:
        result = svc.get_file_bytes(slug, path)
        if not result:
            raise HTTPException(status_code=404, detail="File not found")
        body, ctype = result
        filename = path.split("/")[-1]
        return Response(
            content=body,
            media_type=ctype,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    fc = svc.get_file(slug, path)
    if not fc:
        raise HTTPException(status_code=404, detail="File not found")
    return fc


@router.get("/runs/{slug}/download")
async def download_zip(slug: str, phase: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    if not svc.get_run(slug):
        raise HTTPException(status_code=404, detail="Run not found")
    payload = svc.build_zip(slug, phase_dir=phase)
    if not payload:
        raise HTTPException(status_code=404, detail="No artifacts to download")
    name = f"{slug}-{phase}.zip" if phase else f"{slug}.zip"
    return Response(
        content=payload,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
