"""Govern SR 26-2 — agent-aware model-risk control mapping routes.

CRUD over SR 26-2 mappings (agent-reframed MRM controls) + the differentiator
POST /evaluate, which resolves each control against real audit-log signals and
returns conformance % + evidence_backed_pct.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.config import settings
from core.rbac import Role, require_role
from models.govern_sr26 import SR26Mapping, SR26MappingCreate, SR26MappingUpdate
from services.govern_audit_service import GovernAuditService
from services.govern_sr26_service import GovernSr26Service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/sr26", tags=["govern-sr26"])

_svc: Optional[GovernSr26Service] = None


def get_service() -> GovernSr26Service:
    global _svc
    if _svc is None:
        audit = GovernAuditService(table_name=settings.GOVERN_AUDIT_TABLE_NAME, region=settings.AWS_REGION)
        _svc = GovernSr26Service(
            table_name=settings.GOVERN_SR26_TABLE_NAME, audit_service=audit, region=settings.AWS_REGION,
        )
    return _svc


@router.post("/mappings", response_model=SR26Mapping, status_code=201)
async def create_mapping(req: SR26MappingCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().create(req, created_by="user")


@router.get("/mappings", response_model=List[SR26Mapping])
async def list_mappings(_=Depends(require_role(Role.VIEWER))):
    return get_service().list()


@router.get("/mappings/{sr26_id}", response_model=SR26Mapping)
async def get_mapping(sr26_id: str, _=Depends(require_role(Role.VIEWER))):
    m = get_service().get(sr26_id)
    if not m:
        raise HTTPException(status_code=404, detail="SR 26-2 mapping not found")
    return m


@router.put("/mappings/{sr26_id}", response_model=SR26Mapping)
async def update_mapping(sr26_id: str, req: SR26MappingUpdate, _=Depends(require_role(Role.OPERATOR))):
    m = get_service().update(sr26_id, req)
    if not m:
        raise HTTPException(status_code=404, detail="SR 26-2 mapping not found")
    return m


@router.delete("/mappings/{sr26_id}", response_model=SR26Mapping)
async def delete_mapping(sr26_id: str, _=Depends(require_role(Role.OPERATOR))):
    m = get_service().delete(sr26_id)
    if not m:
        raise HTTPException(status_code=404, detail="SR 26-2 mapping not found")
    return m


@router.post("/mappings/{sr26_id}/build-default-catalog", response_model=SR26Mapping)
async def build_default_catalog(sr26_id: str, _=Depends(require_role(Role.OPERATOR))):
    m = get_service().build_default_catalog(sr26_id)
    if not m:
        raise HTTPException(status_code=404, detail="SR 26-2 mapping not found")
    return m


class EvaluateRequest(BaseModel):
    autonomy_level: Optional[int] = None
    graduation_ready: Optional[bool] = None


@router.post("/mappings/{sr26_id}/evaluate", response_model=SR26Mapping)
async def evaluate_mapping(sr26_id: str, req: EvaluateRequest = EvaluateRequest(), _=Depends(require_role(Role.OPERATOR))):
    m = get_service().evaluate(sr26_id, autonomy_level=req.autonomy_level, graduation_ready=req.graduation_ready)
    if not m:
        raise HTTPException(status_code=404, detail="SR 26-2 mapping not found")
    return m
