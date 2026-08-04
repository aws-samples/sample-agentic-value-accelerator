"""Business Case CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role

from core.config import settings
from models.business_case import (
    BusinessCase,
    BusinessCaseCreate,
    BusinessCaseStatus,
    BusinessCaseUpdate,
    RISK_LABELS,
    RISK_WEIGHTS_DEFAULT,
)
from services.business_case_service import BusinessCaseService, NameTakenError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/business-cases", tags=["business-cases"])

_svc: Optional[BusinessCaseService] = None


def get_service() -> BusinessCaseService:
    global _svc
    if _svc is None:
        _svc = BusinessCaseService(
            table_name=settings.BUSINESS_CASES_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    return {
        "risk_categories": [
            {"key": k, "label": RISK_LABELS[k], "weight": RISK_WEIGHTS_DEFAULT[k]}
            for k in RISK_WEIGHTS_DEFAULT
        ],
        "industry_wacc": {
            "Retail Banking": 0.0498,
            "Insurance": 0.0634,
            "Capital Markets": 0.0608,
        },
        "hurdle_ranges": {
            "Retail Banking": "10-15%",
            "Insurance": "12-15%",
            "Capital Markets": "15-20%",
        },
    }


@router.post("", response_model=BusinessCase, status_code=201)
async def create_business_case(req: BusinessCaseCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        return svc.create(req, created_by="user")
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=List[BusinessCase])
async def list_business_cases(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = BusinessCaseStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{business_case_id}", response_model=BusinessCase)
async def get_business_case(business_case_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    bc = svc.get(business_case_id)
    if not bc:
        raise HTTPException(status_code=404, detail="Business case not found")
    return bc


@router.put("/{business_case_id}", response_model=BusinessCase)
async def update_business_case(business_case_id: str, req: BusinessCaseUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        bc = svc.update(business_case_id, req)
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not bc:
        raise HTTPException(status_code=404, detail="Business case not found")
    return bc


@router.delete("/{business_case_id}", response_model=BusinessCase)
async def delete_business_case(business_case_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    bc = svc.delete(business_case_id)
    if not bc:
        raise HTTPException(status_code=404, detail="Business case not found")
    return bc
