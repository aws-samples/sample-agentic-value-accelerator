"""Govern AWS Health — real service/account health events, read-through GET route.

Surfaces the account's AWS Health feed (open operational issues, account
notifications, upcoming scheduled changes) for the Operations availability /
incident-correlation view. Counts by category come from DescribeEventAggregates;
a handful of recent events come from DescribeEvents.

Region note: the AWS Health API is a GLOBAL service reachable only via the
us-east-1 endpoint, so — like AWS Support — this route ALWAYS builds the client in
us-east-1, independent of settings.GOVERN_AWS_REGION. Honest-degrades to live=false
(with a clear note) when the account lacks a Business/Enterprise Support plan.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.rbac import Role, require_role
from services.govern_health_service import GovernHealthService, HealthEventsResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/health", tags=["govern-health"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_health", region_scope.ACCOUNT_PINNED, prefix="/govern/health")

# The AWS Health API is global (us-east-1 endpoint) ALWAYS — not the governed region.
_svc: Optional[GovernHealthService] = None


def get_service() -> GovernHealthService:
    global _svc
    if _svc is None:
        _svc = GovernHealthService(region="us-east-1")
    return _svc


@router.get("/events", response_model=HealthEventsResponse)
async def get_health_events(
    days: int = Query(default=30, ge=1, le=90, description="Trailing window (days); clamped server-side"),
    _=Depends(require_role(Role.VIEWER)),
):
    """AWS Health service/account events for Operations availability + incident correlation.

    Returns authoritative counts by event-type category (issue / accountNotification /
    scheduledChange) plus a few recent events (service, region, statusCode, startTime) —
    no PII, no ARNs, account ids masked. Cached at a short TTL. Honest-degrades to
    live=false when the account has no Business/Enterprise Support plan
    (SubscriptionRequiredException) or the Health API is otherwise unavailable.
    """
    return get_service().get_events(days=days)
