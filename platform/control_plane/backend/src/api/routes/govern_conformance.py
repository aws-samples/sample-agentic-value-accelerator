"""Govern Conformance — ISO/IEC 42001 AIMS conformance record CRUD routes.

The editable "AI management system" artifact regulated buyers / ISO auditors ask
for: clause controls with status, evidence, and owner. CRUD (control statuses get
updated as the AIMS matures). Follows the operating_model route pattern.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.rbac import Role, require_role
from models.govern_conformance import (
    ConformanceRecord,
    ConformanceRecordCreate,
    ConformanceRecordUpdate,
)
from services.govern_conformance_service import GovernConformanceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/conformance", tags=["govern-conformance"])

_svc: Optional[GovernConformanceService] = None


def get_service() -> GovernConformanceService:
    global _svc
    if _svc is None:
        _svc = GovernConformanceService(
            table_name=settings.GOVERN_CONFORMANCE_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


@router.post("/records", response_model=ConformanceRecord, status_code=201)
async def create_record(req: ConformanceRecordCreate, _=Depends(require_role(Role.OPERATOR))):
    return get_service().create(req, created_by="user")


@router.get("/records", response_model=List[ConformanceRecord])
async def list_records(_=Depends(require_role(Role.VIEWER))):
    return get_service().list()


@router.get("/records/{conformance_id}", response_model=ConformanceRecord)
async def get_record(conformance_id: str, _=Depends(require_role(Role.VIEWER))):
    r = get_service().get(conformance_id)
    if not r:
        raise HTTPException(status_code=404, detail="Conformance record not found")
    return r


@router.put("/records/{conformance_id}", response_model=ConformanceRecord)
async def update_record(conformance_id: str, req: ConformanceRecordUpdate, _=Depends(require_role(Role.OPERATOR))):
    r = get_service().update(conformance_id, req)
    if not r:
        raise HTTPException(status_code=404, detail="Conformance record not found")
    return r


@router.delete("/records/{conformance_id}", response_model=ConformanceRecord)
async def delete_record(conformance_id: str, _=Depends(require_role(Role.OPERATOR))):
    r = get_service().delete(conformance_id)
    if not r:
        raise HTTPException(status_code=404, detail="Conformance record not found")
    return r
