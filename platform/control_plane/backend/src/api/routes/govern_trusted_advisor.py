"""Govern Trusted Advisor — AWS Trusted Advisor checks, read-through GET route.

Feeds the Govern Risk / FinOps / Operations posture views with live Trusted
Advisor results: category rollups (cost_optimizing, security, fault_tolerance,
performance, service_limits, operational_excellence), status rollups
(ok / warning / error / not_available), and the top flagged checks by name.

The AWS Support API is global but only reachable via the us-east-1 endpoint, so
the service always uses region_name='us-east-1' regardless of GOVERN_AWS_REGION.
Honest-degrades to live=false with setup guidance when the account is on Basic
Support (SubscriptionRequiredException) or the caller lacks permissions.
"""

import logging

from fastapi import APIRouter, Depends

from core import region_scope
from core.rbac import Role, require_role
from services.govern_trusted_advisor_service import (
    GovernTrustedAdvisorService,
    TrustedAdvisorSummaryResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/trusted-advisor", tags=["govern-trusted-advisor"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_trusted_advisor", region_scope.ACCOUNT_PINNED, prefix="/govern/trusted-advisor")

# Single cached service instance (Support API is always us-east-1), which
# preserves the service's internal TTL cache across requests.
_svc_singleton: GovernTrustedAdvisorService | None = None


def _svc() -> GovernTrustedAdvisorService:
    global _svc_singleton
    if _svc_singleton is None:
        _svc_singleton = GovernTrustedAdvisorService()
    return _svc_singleton


@router.get("/summary", response_model=TrustedAdvisorSummaryResponse)
async def get_summary(_=Depends(require_role(Role.VIEWER))):
    """Live AWS Trusted Advisor summary: check counts rolled up by category and by
    status, total flagged resources, cost-optimization savings estimate, and the
    top flagged checks (names only). Honest-degrades when the account lacks a
    Business/Enterprise Support plan or the caller lacks Support API permissions."""
    return _svc().get_summary()
