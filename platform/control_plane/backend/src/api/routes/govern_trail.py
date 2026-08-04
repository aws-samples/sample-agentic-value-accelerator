"""Govern Trail — real CloudTrail AI-service activity, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_trail import AiCallersResponse, TrailResponse
from services.govern_trail_service import GovernTrailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/trail", tags=["govern-trail"])

_svc: Optional[GovernTrailService] = None


def get_service() -> GovernTrailService:
    global _svc
    if _svc is None:
        _svc = GovernTrailService(region=settings.AWS_REGION)
    return _svc


@router.get("/ai-activity", response_model=TrailResponse)
async def get_ai_activity(hours: int = Query(default=24, ge=1, le=168), _=Depends(require_role(Role.VIEWER))):
    """Recent Bedrock/SageMaker API activity from CloudTrail (cloudtrail:LookupEvents)."""
    return get_service().get_ai_activity(hours=hours)


@router.get("/ai-callers", response_model=AiCallersResponse)
async def get_ai_callers(hours: int = Query(default=168, ge=1, le=168), _=Depends(require_role(Role.VIEWER))):
    """Distinct identities invoking AI services (shadow-AI signal, from CloudTrail)."""
    return get_service().get_ai_callers(hours=hours)
