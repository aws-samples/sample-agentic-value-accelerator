"""Govern Guardrails — real Bedrock Guardrails telemetry, read-through GET route."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_guardrails import GuardrailTelemetryResponse
from services.govern_guardrails_service import GovernGuardrailsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/guardrails", tags=["govern-guardrails"])

_svc: Optional[GovernGuardrailsService] = None


def get_service() -> GovernGuardrailsService:
    global _svc
    if _svc is None:
        _svc = GovernGuardrailsService(region=settings.AWS_REGION)
    return _svc


@router.get("/telemetry", response_model=GuardrailTelemetryResponse)
async def get_guardrail_telemetry(days: int = Query(default=30, ge=1, le=90), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock guardrail fleet + intervention telemetry.

    bedrock:ListGuardrails for the configured guardrails, plus CloudWatch
    AWS/Bedrock/Guardrails (Invocations / InvocationsIntervened) per-guardrail and
    per-policy-type (content, topics, words, PII, contextual grounding).
    """
    return get_service().get_telemetry(days=days)
