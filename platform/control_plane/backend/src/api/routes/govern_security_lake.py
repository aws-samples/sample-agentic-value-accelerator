"""Govern Security Lake — AWS Security Lake data lakes, subscribers, and log sources."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_security_lake_service import GovernSecurityLakeService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/security-lake", tags=["govern-security-lake"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_security_lake", region_scope.SINGLE_REGION, prefix="/govern/security-lake")

_svc: Optional[GovernSecurityLakeService] = None


def get_service() -> GovernSecurityLakeService:
    global _svc
    if _svc is None:
        _svc = GovernSecurityLakeService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/summary")
async def get_security_lake_summary(_=Depends(require_role(Role.VIEWER))):
    """Unified Security Lake summary — data lakes, subscribers, and log sources."""
    return get_service().get_summary()


@router.get("/data-lakes")
async def list_data_lakes(_=Depends(require_role(Role.VIEWER))):
    """List Security Lake data lakes in the account."""
    return get_service().list_data_lakes()


@router.get("/subscribers")
async def list_subscribers(_=Depends(require_role(Role.VIEWER))):
    """List Security Lake subscribers."""
    return get_service().list_subscribers()


@router.get("/log-sources")
async def list_log_sources(_=Depends(require_role(Role.VIEWER))):
    """List Security Lake log sources (AWS and custom)."""
    return get_service().list_log_sources()
