"""Govern GuardDuty AI — AI-related threat detection findings.

Read-through GET route: GuardDuty is the source of truth for AI threat
detection findings. Follows the govern slice route pattern.

Endpoints:
- GET /govern/guardduty-ai/findings - AI-related findings from GuardDuty
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_guardduty_ai import GuardDutyAIFindingsResponse
from services.govern_guardduty_ai_service import GovernGuardDutyAIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/guardduty-ai", tags=["govern-guardduty-ai"])

_svc: Optional[GovernGuardDutyAIService] = None


def get_service() -> GovernGuardDutyAIService:
    """Lazy-init the service singleton with config from settings."""
    global _svc
    if _svc is None:
        _svc = GovernGuardDutyAIService(region=settings.AWS_REGION)
    return _svc


@router.get("/findings", response_model=GuardDutyAIFindingsResponse)
async def get_guardduty_ai_findings(
    limit: int = Query(default=50, ge=1, le=200, description="Max findings to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """AI-related threat detection findings from GuardDuty.

    Filters GuardDuty findings for AI/ML services (Bedrock, SageMaker, etc.)
    and maps finding types to AI-specific categories:
    - prompt_injection: Detected prompt manipulation attempts
    - data_exfiltration: Data leakage via AI services
    - model_abuse: Unauthorized model usage or misuse
    - credential_access: Credential theft targeting AI resources
    - unauthorized_access: Unauthorized access to AI services
    - anomalous_behavior: Unusual AI usage patterns

    Returns `live=False` fallback (never 500s) when GuardDuty is unreachable
    or not enabled, so the Govern surface can badge the source honestly.
    """
    return get_service().get_findings(limit=limit)
