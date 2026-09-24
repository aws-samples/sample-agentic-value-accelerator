"""Govern Trail — real CloudTrail AI-service activity, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_trail import AiCallersResponse, TrailResponse
from services.govern_trail_service import GovernTrailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/trail", tags=["govern-trail"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_trail", region_scope.SINGLE_REGION, prefix="/govern/trail")

_svc: Optional[GovernTrailService] = None


def get_service() -> GovernTrailService:
    global _svc
    if _svc is None:
        _svc = GovernTrailService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/ai-activity", response_model=TrailResponse)
def get_ai_activity(hours: int = Query(default=24, ge=1, le=168), _=Depends(require_role(Role.VIEWER))):
    """Recent Bedrock/SageMaker API activity from CloudTrail (cloudtrail:LookupEvents)."""
    return get_service().get_ai_activity(hours=hours)


@router.get("/ai-callers", response_model=AiCallersResponse)
def get_ai_callers(hours: int = Query(default=168, ge=1, le=168), _=Depends(require_role(Role.VIEWER))):
    """Distinct identities invoking AI services (shadow-AI signal, from CloudTrail)."""
    return get_service().get_ai_callers(hours=hours)
