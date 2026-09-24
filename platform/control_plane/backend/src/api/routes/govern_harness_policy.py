"""Govern Harness Policy — tiered tool access control API routes.

Provides endpoints to manage AI harness governance policies:
- List all policies
- Get policy for a harness type
- Update policy (admin only)
- Evaluate tool access
- Get allowed tools for a harness
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_harness_policy import (
    HarnessPhase,
    HarnessPolicy,
    HarnessPolicyCreate,
    HarnessPolicyListResponse,
    HarnessPolicyUpdate,
    TierBreakdownResponse,
    ToolAccessEvaluation,
)
from services.govern_harness_policy_service import GovernHarnessPolicyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/harness-policy", tags=["govern-harness-policy"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_harness_policy", region_scope.CONTROL_PLANE, prefix="/govern/harness-policy")

_svc: Optional[GovernHarnessPolicyService] = None


def get_service() -> GovernHarnessPolicyService:
    global _svc
    if _svc is None:
        _svc = GovernHarnessPolicyService()
    return _svc


@router.get("/policies", response_model=HarnessPolicyListResponse)
async def list_policies(_=Depends(require_role(Role.VIEWER))):
    """List all harness policies (default + custom).

    Returns policies for all harness types including claude_code, kiro, codex_cli,
    github_copilot, cursor, cody, tabnine, and phase-based policies.
    """
    return get_service().list_policies()


@router.get("/tiers", response_model=TierBreakdownResponse)
async def get_tier_breakdown(_=Depends(require_role(Role.VIEWER))):
    """Get breakdown of tools available at each tier.

    Returns the tool lists for READ_ONLY, READ_WRITE, and FULL tiers,
    plus the default blocked paths for security.
    """
    return get_service().get_tier_breakdown()


@router.get("/{harness_type}", response_model=HarnessPolicy)
async def get_policy(
    harness_type: str,
    phase: Optional[HarnessPhase] = Query(None, description="Phase override (discovery/validation)"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get policy for a specific harness type.

    Args:
        harness_type: Harness type (e.g., claude_code, kiro, codex_cli)
        phase: Optional phase override - if provided, returns phase-specific policy
               (discovery = read-only, validation = adversarial read-only)

    Returns:
        HarnessPolicy for the harness type
    """
    policy = get_service().get_policy(harness_type, phase)
    if not policy:
        raise HTTPException(status_code=404, detail=f"No policy found for harness type: {harness_type}")
    return policy


@router.post("/policies", response_model=HarnessPolicy)
async def create_policy(
    request: HarnessPolicyCreate,
    _=Depends(require_role(Role.ADMIN)),
):
    """Create a new custom harness policy (admin only).

    Creates a custom policy that overrides the default for the specified harness type.
    """
    return get_service().create_policy(request)


@router.put("/{harness_type}", response_model=HarnessPolicy)
async def update_policy(
    harness_type: str,
    update: HarnessPolicyUpdate,
    _=Depends(require_role(Role.ADMIN)),
):
    """Update policy for a harness type (admin only).

    Updates the policy, creating a custom override if modifying a default policy.
    """
    policy = get_service().update_policy(harness_type, update)
    if not policy:
        raise HTTPException(status_code=404, detail=f"No policy found for harness type: {harness_type}")
    return policy


@router.delete("/{harness_type}")
async def delete_custom_policy(
    harness_type: str,
    _=Depends(require_role(Role.ADMIN)),
):
    """Delete a custom policy (admin only).

    Removes custom policy override, reverting to the default policy for this harness type.
    """
    deleted = get_service().delete_custom_policy(harness_type)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No custom policy found for harness type: {harness_type}")
    return {"status": "deleted", "harness_type": harness_type, "message": "Custom policy deleted, reverted to default"}


@router.post("/{harness_type}/evaluate", response_model=ToolAccessEvaluation)
async def evaluate_tool_access(
    harness_type: str,
    tool_name: str = Query(..., description="Tool to evaluate (e.g., Bash, Edit, Read)"),
    target_path: Optional[str] = Query(None, description="Target path being accessed"),
    phase: Optional[HarnessPhase] = Query(None, description="Phase override"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Evaluate whether a tool access is allowed for a harness.

    Checks the policy for the harness type and evaluates whether the specified
    tool and optional target path are permitted.

    Args:
        harness_type: Harness type (e.g., claude_code, kiro)
        tool_name: Tool being accessed (e.g., Bash, Edit, Read)
        target_path: Optional path being accessed (for path-based restrictions)
        phase: Optional phase override (discovery = read-only, validation = adversarial)

    Returns:
        ToolAccessEvaluation with allowed status, reason, and requirements
    """
    return get_service().evaluate_tool_access(harness_type, tool_name, target_path, phase)


@router.get("/{harness_type}/allowed-tools", response_model=List[str])
async def get_allowed_tools(
    harness_type: str,
    phase: Optional[HarnessPhase] = Query(None, description="Phase override"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get list of allowed tools for a harness type.

    Returns the effective list of tools allowed by the policy, taking into
    account the tier, explicit allowed tools, and blocked tools.

    Args:
        harness_type: Harness type (e.g., claude_code, kiro)
        phase: Optional phase override

    Returns:
        List of allowed tool names
    """
    return get_service().get_allowed_tools(harness_type, phase)
