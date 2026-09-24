"""Govern Capacity — AWS Service Quotas for capacity management.

Read-through GET routes plus one write (POST /request-increase): Service Quotas is the
source of truth. Follows the govern slice route pattern — lazy service singleton — except
that the region is NOT passed in from settings here; see get_service().
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Body

from core import region_scope
from core.rbac import Role, require_role
from models.govern_capacity import (
    AlertsResponse,
    QuotaIncreaseRequest,
    QuotaIncreaseResponse,
    QuotasResponse,
    UsageHistoryResponse,
)
from services.govern_capacity_service import GovernCapacityService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/capacity", tags=["govern-capacity"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_capacity", region_scope.SINGLE_REGION, prefix="/govern/capacity")

_svc: Optional[GovernCapacityService] = None


def get_service() -> GovernCapacityService:
    global _svc
    if _svc is None:
        # No region argument, unlike the sibling govern routes: every quota read here is a
        # tier-2 governed-fleet read, so the service resolves GOVERN_AWS_REGION itself
        # (see its __init__ for the evidence). This used to pass settings.AWS_REGION - the
        # tier-1 CONTROL-PLANE region - which is the one mistake Service Quotas cannot
        # surface, because it does not error on the wrong region: it answers with that
        # region's own inventory, so /quotas returned 57 real-looking quotas measured
        # against us-east-2 while the governed fleet runs in us-east-1.
        _svc = GovernCapacityService()
    return _svc


def _increase_note(resp: QuotaIncreaseResponse) -> Optional[str]:
    """The degrade explanation for a quota-increase result, or None if there is none.

    Derived from the structured triple, never by splitting `message` apart: the service
    composes `message` around this quota, this region and AWS's own wording, and the note
    says what the result does NOT establish. The two never carry the same sentence.

    None whenever AWS actually produced the status - a submission, a real AWS denial or an
    already-open request are outcomes, not degrades, and their `message` is complete.
    """
    if resp.status == "invalid":
        # Pre-flight rejection. live=true and the numbers in `message` are measured, so
        # this is not a degrade in the data - it is a degrade in whose judgement it is.
        # These used to come back as 'denied', indistinguishable here from a real AWS
        # verdict: both carry live=true with case_id and request_id of None.
        return (
            "This control plane rejected the request before submitting it, so AWS never "
            "saw it and did not judge it. status='invalid' is neither an AWS denial nor a "
            "failed call - correct the request and retry. No increase request was created."
        )
    if resp.status != "error":
        return None
    if resp.live:
        # ClientError: AWS answered, then refused or failed the write itself. `message`
        # carries the actionable detail (which IAM action is missing, that it throttled);
        # what it cannot say is that this is not a verdict.
        return (
            "AWS did not judge this request. status='error' is a failed call - "
            "permissions, throttling, a malformed target or an AWS-side fault - which is "
            "why it is never reported as 'denied'. No increase request exists as a result."
        )
    # BotoCoreError: no response at all, so nothing on this path was measured.
    return (
        "live=false, source='unavailable-fallback': nothing in this response was measured. "
        "It records an attempt, not an AWS decision - do not badge it as either a "
        "submission or a denial."
    )


@router.get("/quotas", response_model=QuotasResponse)
async def get_quotas(
    _=Depends(require_role(Role.VIEWER)),
):
    """List AI-relevant service quotas with current usage.

    Returns quotas for: Bedrock, SageMaker, Lambda, CloudWatch, IAM.
    Each quota includes current usage percentage and status (ok/warning/critical).

    Returns a `live=False` fallback (never 500s) when Service Quotas is
    unreachable, so the FinOps capacity surface can badge the source honestly.
    """
    return get_service().get_quotas()


@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts(
    _=Depends(require_role(Role.VIEWER)),
):
    """Get quotas approaching their limits (>70% used).

    Returns alerts with severity (warning for >70%, critical for >90%) and
    recommendations for each at-risk quota.
    """
    return get_service().get_alerts()


@router.get("/history/{service}", response_model=UsageHistoryResponse)
async def get_history(
    service: str,
    days: int = Query(default=7, ge=1, le=30, description="Number of days of history"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get usage trend for a service from CloudWatch.

    Provides historical usage data to visualize capacity trends and
    predict when limits might be reached.

    Args:
        service: AWS service code (bedrock, sagemaker, lambda, cloudwatch, iam)
        days: Number of days of history (1-30)
    """
    return get_service().get_history(service, days)


@router.post("/request-increase", response_model=QuotaIncreaseResponse)
async def request_increase(
    request: QuotaIncreaseRequest = Body(...),
    _=Depends(require_role(Role.ADMIN)),
):
    """Submit a quota increase request.

    Creates a service quota increase request through the AWS Service Quotas API against
    the GOVERNED region. Only adjustable quotas can be increased this way.

    Requires ADMIN role to prevent accidental capacity changes.

    Four things this does not do, all reflected in the response:

      - `request.reason` is NOT sent to AWS. RequestServiceQuotaIncrease accepts only
        ServiceCode, QuotaCode and DesiredValue; the justification is recorded in the
        control-plane log only.
      - `status="submitted"` means AWS accepted a request. The limit does not change
        until AWS approves it.
      - `status="error"` means the call failed (permissions, throttling, an AWS-side
        fault, or no response). It is deliberately never reported as `"denied"`, which
        would imply AWS judged something.
      - `status="invalid"` means this control plane rejected the request before
        submitting it: the quota is not adjustable through Service Quotas, or the
        requested value is not above the current limit. AWS never saw it, so this is
        not a `"denied"` either - but unlike `"error"` the quota WAS read successfully,
        so the values in `message` are measured and there is nothing to repair or retry.

    Only `status="denied"` ever means AWS judged the request.
    """
    result = get_service().request_increase(request)
    # Until QuotaIncreaseResponse had a `note`, every one of those caveats had to ride
    # inside `message`, so a failed CALL and a real AWS DENIAL reached the UI as two prose
    # strings with nothing structured to tell them apart. `or` rather than an overwrite so
    # a note set upstream wins.
    return result.model_copy(update={"note": result.note or _increase_note(result)})
