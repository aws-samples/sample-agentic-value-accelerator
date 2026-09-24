"""Govern model invocations — real Bedrock invocation aggregates (correct log group).

Read-through GET route (no CRUD). Follows the govern slice route pattern — lazy
service singleton reading settings.GOVERN_AWS_REGION, RBAC viewer gate, honest
live/source/note responses that degrade to live=False (never fabricate) when the
CloudWatch Logs group /aws/bedrock/model-invocations is absent, empty, or not
permitted.

Distinct from /govern/agentcore/model-invocations (which queries the wrong group
name and returns raw per-invocation rows): this endpoint returns masked aggregates
only — real token totals, per-model breakdown, guardrail + grounding signal counts,
and per-caller counts — so no prompt/response text or raw ARN/account id leaves the
backend.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_invocations_service import (
    GovernInvocationsService,
    InvocationAggregatesResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/models", tags=["govern-invocations"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_invocations", region_scope.SINGLE_REGION, prefix="/govern/models")

_svc: Optional[GovernInvocationsService] = None


def get_service() -> GovernInvocationsService:
    global _svc
    if _svc is None:
        _svc = GovernInvocationsService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/invocations", response_model=InvocationAggregatesResponse)
async def get_model_invocation_aggregates(
    hours: int = Query(default=24, ge=1, le=168, description="Trailing window in hours (max 7 days)"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Real Bedrock model-invocation aggregates from CloudWatch Logs Insights.

    Source: /aws/bedrock/model-invocations. Returns total invocations, per-model
    input/output token sums (Bedrock-normalized top-level token counts), guardrail
    stop-reason counts, grounding/hallucination signal counts, and per-caller counts
    — all masked. Honest-degrades to live=False when the log group is absent, empty,
    or the query is not permitted.
    """
    return get_service().get_invocation_aggregates(hours=hours)
