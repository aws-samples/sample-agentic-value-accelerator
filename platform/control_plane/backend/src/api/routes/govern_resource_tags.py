"""Govern Resource Tags — real governed denominator + governance-tag coverage.

One live AWS governance-evidence endpoint, backed by GovernResourceTagsService:
  - GET /govern/governance/resource-tags → of the AI-estate resources actually
    present in the account (resourcegroupstaggingapi:GetResources scoped to
    bedrock / bedrock-agentcore / sagemaker), how many carry a governance
    owner/project/env/scope tag, per-dimension coverage %, and the real governed
    denominator (owner AND/OR project).

This replaces the fabricated `governedPct = guardrailsWithMetrics * 3` heuristic and
the hardcoded scope/env defaults in the Command Center's useLiveKPIs hook with an
auditable, tag-derived number.

Follows the govern slice route pattern (cf. govern_governance / govern_iam): a lazy
service singleton scoped to settings.GOVERN_AWS_REGION, VIEWER role, and an honest
live/source/note response that degrades to live=False (never fabricates) when the
tagging API is unreachable, not permitted, or the AI estate is empty.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_resource_tags_service import (
    GovernanceResourceTagsResponse,
    GovernResourceTagsService,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/governance", tags=["govern-resource-tags"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_resource_tags", region_scope.SINGLE_REGION, prefix="/govern/governance")

# One service instance per GOVERN_AWS_REGION (preserves its internal TTL cache).
_svc: Optional[GovernResourceTagsService] = None


def get_service() -> GovernResourceTagsService:
    global _svc
    if _svc is None:
        _svc = GovernResourceTagsService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/resource-tags", response_model=GovernanceResourceTagsResponse)
async def get_resource_tags(
    max_resources: int = Query(default=1000, ge=1, le=1000),
    max_samples: int = Query(default=25, ge=0, le=100),
    _=Depends(require_role(Role.VIEWER)),
):
    """Governed denominator + governance-tag coverage of the live AI estate.

    Scans the account's AI resources (Bedrock, AgentCore, SageMaker) via Resource
    Groups Tagging and reports, over that real denominator: how many carry an owner
    / project / environment / scope tag (per-dimension coverage %), the overall
    governance-tag coverage, and the governed denominator (resources carrying an
    owner and/or project tag) with its governed_pct. Every ARN, account id, and
    owner identity is masked. Free API call. Degrades to an honest live=False note
    when the tagging API is unreachable, tag:GetResources is not granted, or no AI
    resources exist to form a denominator.
    """
    return get_service().get_resource_tags(max_resources=max_resources, max_samples=max_samples)
