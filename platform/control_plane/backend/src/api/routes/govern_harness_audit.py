"""Govern Harness Audit — API routes for harness audit artifacts.

Read-only API for examining harness audit artifacts and run manifests.
Audit data is append-only; there are no write endpoints exposed.
RBAC: VIEWER role required for all endpoints.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_harness_audit import (
    HarnessAuditArtifact,
    HarnessRunManifest,
    HarnessRunManifestWithArtifacts,
)
from services.govern_harness_audit_service import GovernHarnessAuditService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/harness-audit", tags=["govern-harness-audit"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_harness_audit", region_scope.SINGLE_REGION, prefix="/govern/harness-audit")

_svc: Optional[GovernHarnessAuditService] = None


def get_service() -> GovernHarnessAuditService:
    """Lazy singleton for the harness audit service."""
    global _svc
    if _svc is None:
        _svc = GovernHarnessAuditService(
            bucket_name=getattr(settings, "HARNESS_AUDIT_BUCKET", ""),
            region=settings.AWS_REGION,
            prefix="harness-audit",
        )
    return _svc


@router.get("/runs", response_model=List[HarnessRunManifest])
async def list_runs(
    limit: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
):
    """List recent harness runs.

    Returns run manifests sorted by start time, newest first.
    """
    svc = get_service()
    return svc.list_runs(limit=limit)


@router.get("/runs/{run_id}", response_model=HarnessRunManifestWithArtifacts)
async def get_run(
    run_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get a harness run manifest with all its artifacts.

    Returns the full manifest including artifact details.
    """
    svc = get_service()
    manifest = svc.get_run_manifest_with_artifacts(run_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Harness run not found")
    return manifest


@router.get("/artifacts/{artifact_id}", response_model=HarnessAuditArtifact)
async def get_artifact(
    artifact_id: str,
    run_id: Optional[str] = Query(default=None, description="Run ID for faster lookup"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get a single harness audit artifact.

    If run_id is provided, lookup is faster. Otherwise searches all runs.
    """
    svc = get_service()
    artifact = svc.get_artifact(artifact_id, run_id=run_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


@router.get("/runs/{run_id}/artifacts", response_model=List[HarnessAuditArtifact])
async def list_run_artifacts(
    run_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """List all artifacts for a harness run.

    Returns artifacts in creation order.
    """
    svc = get_service()
    manifest = svc.get_run_manifest(run_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Harness run not found")
    return svc.get_artifacts(run_id)
