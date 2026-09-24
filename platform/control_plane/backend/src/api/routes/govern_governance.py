"""Govern Governance Posture — live KMS encryption evidence + preventive SCPs.

Two live AWS governance-evidence endpoints, backed by GovernGovernanceService:
  - GET /govern/governance/kms → KMS key + alias inventory (encryption at rest)
  - GET /govern/governance/scp → Service Control Policies (preventive controls)

Follows the govern slice route pattern (cf. govern_iam): a lazy service singleton
scoped to settings.GOVERN_AWS_REGION, VIEWER role, honest live/fallback responses.
Organizations SCP enumeration degrades to an honest live=False note when the
backend account is not the Organizations management / delegated-admin account.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_governance import (
    AwsKmsInventoryResponse,
    AwsResourceInventoryResponse,
    AwsScpResponse,
)
from services.govern_governance_service import GovernGovernanceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/governance", tags=["govern-governance"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_governance", region_scope.SINGLE_REGION, prefix="/govern/governance")

# One service instance per GOVERN_AWS_REGION (preserves its internal TTL cache).
_svc: Optional[GovernGovernanceService] = None


def get_service() -> GovernGovernanceService:
    global _svc
    if _svc is None:
        _svc = GovernGovernanceService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/kms", response_model=AwsKmsInventoryResponse)
async def get_kms_inventory(
    max_keys: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
):
    """KMS key + alias inventory as encryption-at-rest evidence.

    Reports customer- vs AWS-managed key counts, how many customer-managed keys
    have automatic rotation enabled, and the total alias count. Live on success
    (an empty inventory is a valid live result); graceful live=False fallback if
    KMS is unreachable or kms:ListKeys is not granted.
    """
    return get_service().get_kms_inventory(max_keys=max_keys)


@router.get("/scp", response_model=AwsScpResponse)
async def get_scp_policies(
    max_policies: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
):
    """Service Control Policies (preventive controls) for the AWS Organization.

    Live when the backend account can enumerate org policies; an org whose only
    SCP is the AWS-managed default FullAWSAccess is a valid live result (no custom
    restrictive SCPs). Returns an honest live=False note when Organizations access
    is denied (backend is not the management / delegated-admin account).
    """
    return get_service().get_scp_policies(max_policies=max_policies)


@router.get("/inventory", response_model=AwsResourceInventoryResponse)
async def get_resource_inventory(
    max_resources: int = Query(default=500, ge=1, le=1000),
    _=Depends(require_role(Role.VIEWER)),
):
    """AI-estate resource inventory via Resource Groups Tagging.

    Enumerates tagged AWS resources (resourcegroupstaggingapi:GetResources),
    grouping by service, counting AI-related resources (by service namespace or
    AI tag tokens), and listing the distinct tag keys observed. Account ids are
    masked in every ARN and tag value. An empty inventory in a reachable region
    is a valid live result; degrades to an honest live=False fallback when the
    API is unreachable or tag:GetResources is not granted.
    """
    return get_service().get_resource_inventory(max_resources=max_resources)
