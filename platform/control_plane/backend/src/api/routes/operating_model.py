"""AI Operating Model CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role

from core.config import settings
from models.operating_model import (
    OperatingModel,
    OperatingModelCreate,
    OperatingModelStatus,
    OperatingModelUpdate,
    DIMENSION_LABELS,
    DIMENSION_PARAM_COUNTS,
    DIMENSION_WEIGHTS_DEFAULT,
    MATURITY_LEVELS,
    PATTERNS,
    GOVERNANCE_APPROACHES,
)
from services.operating_model_service import OperatingModelService, NameTakenError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/operating-models", tags=["operating-model"])

_svc: Optional[OperatingModelService] = None


def get_service() -> OperatingModelService:
    global _svc
    if _svc is None:
        _svc = OperatingModelService(
            table_name=settings.OPERATING_MODEL_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


# --- Reference / framework metadata ---

@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    return {
        "dimensions": [
            {
                "key": k,
                "label": DIMENSION_LABELS[k],
                "weight": DIMENSION_WEIGHTS_DEFAULT[k],
                "param_count": DIMENSION_PARAM_COUNTS[k],
            }
            for k in DIMENSION_LABELS
        ],
        "maturity_levels": MATURITY_LEVELS,
        "patterns": PATTERNS,
        "governance_approaches": GOVERNANCE_APPROACHES,
    }


# --- CRUD ---

@router.post("", response_model=OperatingModel, status_code=201)
async def create_operating_model(req: OperatingModelCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        return svc.create(req, created_by="user")
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=List[OperatingModel])
async def list_operating_models(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = OperatingModelStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{operating_model_id}", response_model=OperatingModel)
async def get_operating_model(operating_model_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    m = svc.get(operating_model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Operating model not found")
    return m


@router.put("/{operating_model_id}", response_model=OperatingModel)
async def update_operating_model(operating_model_id: str, req: OperatingModelUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        m = svc.update(operating_model_id, req)
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not m:
        raise HTTPException(status_code=404, detail="Operating model not found")
    return m


@router.delete("/{operating_model_id}", response_model=OperatingModel)
async def delete_operating_model(operating_model_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    m = svc.delete(operating_model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Operating model not found")
    return m
