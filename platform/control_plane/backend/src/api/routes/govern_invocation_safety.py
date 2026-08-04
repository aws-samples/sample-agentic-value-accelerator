"""Govern Invocation Safety — live runtime safety telemetry, read-through GET route.

Aggregates the account's Bedrock model-invocation logs (via CloudWatch Logs
Insights) into safety signals: guardrail-intervention rate, stop-reason mix,
token throughput, per-model breakdown, daily trend. Aggregates only — no raw
prompt/response content or caller identities.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_invocation_safety import InvocationSafetyResponse
from services.govern_invocation_safety_service import GovernInvocationSafetyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/invocation-safety", tags=["govern-invocation-safety"])

_svc: Optional[GovernInvocationSafetyService] = None


def get_service() -> GovernInvocationSafetyService:
    global _svc
    if _svc is None:
        _svc = GovernInvocationSafetyService(region=settings.AWS_REGION)
    return _svc


@router.get("/telemetry", response_model=InvocationSafetyResponse)
async def get_invocation_safety(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Live runtime safety telemetry from Bedrock invocation logs (aggregates only)."""
    return get_service().get_telemetry(days=days)
