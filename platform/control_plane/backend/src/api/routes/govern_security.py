"""Govern Security — unified AWS security posture, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from core.config import settings
from core.rbac import Role, require_role
from models.govern_security import SecurityPostureResponse
from services.govern_security_service import GovernSecurityService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/security", tags=["govern-security"])

_svc: Optional[GovernSecurityService] = None


def get_service() -> GovernSecurityService:
    global _svc
    if _svc is None:
        _svc = GovernSecurityService(region=settings.AWS_REGION)
    return _svc


@router.get("/posture", response_model=SecurityPostureResponse)
async def get_security_posture(_=Depends(require_role(Role.VIEWER))):
    """Unified security posture from GuardDuty, Macie, Inspector & Access Analyzer."""
    return get_service().get_posture()
