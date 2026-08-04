"""AI Maturity Assessment CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role

from core.config import settings
from models.maturity import (
    Assessment,
    AssessmentCreate,
    AssessmentStatus,
    AssessmentUpdate,
    DIMENSION_LABELS,
    DIMENSION_PARAM_COUNTS,
    DIMENSION_WEIGHTS_DEFAULT,
    MATURITY_LEVELS,
)
from services.maturity_service import MaturityService, NameTakenError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/maturity", tags=["maturity"])

_svc: Optional[MaturityService] = None


def get_service() -> MaturityService:
    global _svc
    if _svc is None:
        _svc = MaturityService(
            table_name=settings.MATURITY_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


# --- Reference / framework metadata ---

@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    return {
        "dimensions": [
            {"key": k, "label": DIMENSION_LABELS[k], "weight": DIMENSION_WEIGHTS_DEFAULT[k], "param_count": DIMENSION_PARAM_COUNTS[k]}
            for k in DIMENSION_LABELS
        ],
        "maturity_levels": MATURITY_LEVELS,
    }


# --- CRUD ---

@router.post("", response_model=Assessment, status_code=201)
async def create_assessment(req: AssessmentCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        return svc.create(req, created_by="user")
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=List[Assessment])
async def list_assessments(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = AssessmentStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{assessment_id}", response_model=Assessment)
async def get_assessment(assessment_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    a = svc.get(assessment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return a


@router.put("/{assessment_id}", response_model=Assessment)
async def update_assessment(assessment_id: str, req: AssessmentUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        a = svc.update(assessment_id, req)
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return a


@router.delete("/{assessment_id}", response_model=Assessment)
async def delete_assessment(assessment_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    a = svc.delete(assessment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return a
