"""Use Case Prioritization CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role

from core.config import settings
from models.prioritization import (
    DIMENSION_WEIGHTS_DEFAULT,
    SUB_WEIGHTS,
    UseCase,
    UseCaseCreate,
    UseCaseStatus,
    UseCaseUpdate,
)
from services.prioritization_service import PrioritizationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/prioritization", tags=["prioritization"])

_svc: Optional[PrioritizationService] = None


def get_service() -> PrioritizationService:
    global _svc
    if _svc is None:
        _svc = PrioritizationService(
            table_name=settings.PRIORITIZATION_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


# --- Reference / framework metadata ---

@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    """Return dimension weights, sub-criteria weights, and Go/No-Go thresholds.

    Used by the frontend to render scoring forms without hard-coding the schema.
    """
    return {
        "dimension_weights": DIMENSION_WEIGHTS_DEFAULT,
        "sub_weights": SUB_WEIGHTS,
        "thresholds": {
            "GO": {"composite": ">=3.5", "risk": "<=15", "readiness": ">=3.0"},
            "CONDITIONAL_GO": {"composite": "2.5-3.49", "risk": "16-20", "readiness": "2.0-2.99"},
            "NO_GO": {"composite": "<2.5", "risk": ">20", "readiness": "<2.0"},
        },
    }


# --- CRUD ---

@router.post("", response_model=UseCase, status_code=201)
async def create_use_case(req: UseCaseCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    return svc.create(req, created_by="user")


@router.get("", response_model=List[UseCase])
async def list_use_cases(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = UseCaseStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{use_case_id}", response_model=UseCase)
async def get_use_case(use_case_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    uc = svc.get(use_case_id)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc


@router.put("/{use_case_id}", response_model=UseCase)
async def update_use_case(use_case_id: str, req: UseCaseUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    uc = svc.update(use_case_id, req)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc


@router.delete("/{use_case_id}", response_model=UseCase)
async def delete_use_case(use_case_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    uc = svc.delete(use_case_id)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc
