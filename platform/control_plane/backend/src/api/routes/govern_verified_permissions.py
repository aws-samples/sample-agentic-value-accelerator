"""Govern Verified Permissions — real Cedar authZ policy stores, read-only GET route.

Surfaces Amazon Verified Permissions policy stores with per-store policy counts
(permit / forbid), schema presence, and identity-source counts. This is the
policy-as-code substrate behind AgentCore / A2A governance — every store is a
real Cedar authorization engine. Single-region (settings.GOVERN_AWS_REGION);
Verified Permissions is a regional control-plane service, not Support/Health.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_verified_permissions_service import (
    GovernVerifiedPermissionsService,
    VerifiedPermissionsStoresResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/verified-permissions", tags=["govern-verified-permissions"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_verified_permissions", region_scope.SINGLE_REGION, prefix="/govern/verified-permissions")

_svc: Optional[GovernVerifiedPermissionsService] = None


def get_service() -> GovernVerifiedPermissionsService:
    global _svc
    if _svc is None:
        _svc = GovernVerifiedPermissionsService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/stores", response_model=VerifiedPermissionsStoresResponse)
async def list_policy_stores(_=Depends(require_role(Role.VIEWER))):
    """Cedar authZ policy stores with per-store permit/forbid counts, schema, and identity sources."""
    return get_service().get_stores()
