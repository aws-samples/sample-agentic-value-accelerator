"""Govern CloudTrail Lake — real long-window AI-activity denominators, read-through GET route.

Where govern_trail's cloudtrail:LookupEvents is capped at a couple hundred recent
rows over a short window, this slice queries a CloudTrail Lake event data store
("CTLake") with SQL to return AGGREGATE denominators (by action / principal / day)
over a 30/60/90-day window. Aggregates only — never raw event rows. Single-region:
resolves against the primary governed region (settings.GOVERN_AWS_REGION).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_ctlake_service import CtLakeAiActivityResponse, GovernCtLakeService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/ctlake", tags=["govern-ctlake"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_ctlake", region_scope.SINGLE_REGION, prefix="/govern/ctlake")

_svc: Optional[GovernCtLakeService] = None


def get_service() -> GovernCtLakeService:
    global _svc
    if _svc is None:
        _svc = GovernCtLakeService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/ai-activity", response_model=CtLakeAiActivityResponse)
async def get_ai_activity(
    days: int = Query(default=30, ge=1, le=90, description="Trailing window (days); capped server-side to bound scan cost"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Aggregate Bedrock/SageMaker/AgentCore API-activity denominators from CloudTrail Lake.

    One aggregating GROUPING SETS query over the CTLake event data store; returns
    counts by action, by principal (identity masked), and by day. Results are cached
    at a long TTL because CloudTrail Lake bills per query by bytes scanned (see the
    response `cost_note`). Honest-degrades to live=false when the CTLake store is
    absent, empty for the window, or the query is not permitted.
    """
    return get_service().get_ai_activity(days=days)
