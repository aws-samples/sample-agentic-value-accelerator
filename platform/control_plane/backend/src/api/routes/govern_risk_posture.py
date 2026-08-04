"""Govern Risk Posture — real Security Hub findings, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_risk_posture import RiskPostureResponse
from services.govern_risk_posture_service import GovernRiskPostureService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/risk-posture", tags=["govern-risk-posture"])

_svc: Optional[GovernRiskPostureService] = None


def get_service() -> GovernRiskPostureService:
    global _svc
    if _svc is None:
        _svc = GovernRiskPostureService(region=settings.AWS_REGION)
    return _svc


@router.get("/security-hub", response_model=RiskPostureResponse)
async def get_security_hub_posture(scan: int = Query(default=200, ge=10, le=500), _=Depends(require_role(Role.VIEWER))):
    """Security Hub risk posture — severity roll-up + top open findings (securityhub:GetFindings)."""
    return get_service().get_posture(scan=scan)
