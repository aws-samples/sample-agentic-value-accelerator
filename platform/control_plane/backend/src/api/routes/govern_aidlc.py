"""Govern AI-DLC — AI-Driven Development Life Cycle observability routes.

Provides visibility into AI-DLC pipeline state, runs, and metrics.
All endpoints require authentication via RBAC.

Reference: https://github.com/awslabs/aidlc-workflows
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core import region_scope
from core.config import settings
from core.harness_killswitch import (
    get_killswitch_status,
    is_harness_disabled,
    require_harness_enabled,
    set_killswitch_dynamodb,
    KillswitchSource,
)
from core.rbac import Role, require_role
from models.govern_aidlc import (
    AidlcAuditResponse,
    AidlcExtensionsResponse,
    AidlcFindingsResponse,
    AidlcHarnessResponse,
    AidlcMetricsResponse,
    AidlcProjectsResponse,
    AidlcRulesResponse,
    AidlcStagesResponse,
)
from models.govern_harness_backend import (
    BackendCapabilitiesResponse,
    BackendComparisonResponse,
    BackendToolsResponse,
    BackendToolValidation,
    HarnessBackend,
)
from services.govern_aidlc_service import GovernAidlcService
from services.govern_harness_backend_service import GovernHarnessBackendService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/aidlc", tags=["govern-aidlc"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_aidlc", region_scope.SINGLE_REGION, prefix="/govern/aidlc")

_svc: Optional[GovernAidlcService] = None
_backend_svc: Optional[GovernHarnessBackendService] = None


# ---------------------------------------------------------------------------
# Kill-switch models
# ---------------------------------------------------------------------------

class KillswitchStatusResponse(BaseModel):
    """Kill-switch status response."""
    disabled: bool
    source: str
    reason: Optional[str] = None
    disabled_at: Optional[str] = None
    disabled_by: Optional[str] = None
    # Include whether higher-priority sources are active (can't be toggled via API)
    env_var_active: bool = False
    sentinel_file_active: bool = False


class KillswitchUpdateRequest(BaseModel):
    """Request to update kill-switch state."""
    disabled: bool
    reason: Optional[str] = None


class KillswitchUpdateResponse(BaseModel):
    """Response after updating kill-switch."""
    success: bool
    status: KillswitchStatusResponse
    message: str


def get_service() -> GovernAidlcService:
    """Lazy-init the service singleton."""
    global _svc
    if _svc is None:
        _svc = GovernAidlcService(region=settings.AWS_REGION)
    return _svc


def get_backend_service() -> GovernHarnessBackendService:
    """Lazy-init the backend service singleton."""
    global _backend_svc
    if _backend_svc is None:
        _backend_svc = GovernHarnessBackendService()
    return _backend_svc


@router.get("/stages", response_model=AidlcStagesResponse)
async def get_stages(_=Depends(require_role(Role.VIEWER))):
    """Get the standard AI-DLC workflow stages.

    Returns the Inception -> Construction -> Operations stage definitions.
    """
    return get_service().get_stages()


@router.get("/extensions", response_model=AidlcExtensionsResponse)
async def get_extensions(_=Depends(require_role(Role.VIEWER))):
    """Get available AI-DLC extensions (rule sets).

    Extensions include security-baseline, property-based-testing, resiliency-baseline.
    """
    return get_service().get_extensions()


@router.get("/extensions/{extension_id}/rules", response_model=AidlcRulesResponse)
async def get_extension_rules(extension_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get rules for a specific extension.

    Returns the individual rule definitions with statements and verification criteria.
    """
    return get_service().get_rules(extension_id)


@router.get("/projects", response_model=AidlcProjectsResponse)
async def discover_projects(
    limit: int = Query(default=50, ge=1, le=200, description="Max projects to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Discover AI-DLC projects by scanning CodeCommit for aidlc-docs/ directories.

    Returns projects with their current phase, stage, progress, and violation counts.
    Live data from CodeCommit when available, mock fallback otherwise.
    """
    return get_service().discover_projects(limit=limit)


@router.get("/findings", response_model=AidlcFindingsResponse)
async def get_findings(
    project_id: Optional[str] = Query(default=None, description="Filter by project ID"),
    limit: int = Query(default=100, ge=1, le=500, description="Max findings to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get findings/violations from AI-DLC rule evaluation.

    Returns findings with severity, status, and file locations.
    Optionally filter by project ID.
    """
    return get_service().get_findings(project_id=project_id, limit=limit)


@router.get("/metrics", response_model=AidlcMetricsResponse)
async def get_metrics(
    project_id: Optional[str] = Query(default=None, description="Filter by project ID"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get evaluator metrics for AI-DLC runs.

    Returns code quality scores, test results, NFR compliance, and overall scores.
    Optionally filter by project ID.
    """
    return get_service().get_metrics(project_id=project_id)


@router.get("/audit", response_model=AidlcAuditResponse)
async def get_audit_log(
    project_id: Optional[str] = Query(default=None, description="Filter by project ID"),
    limit: int = Query(default=100, ge=1, le=500, description="Max entries to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get AI-DLC audit log entries.

    Returns stage starts/completions, approvals, and finding detections.
    Optionally filter by project ID.
    """
    return get_service().get_audit_log(project_id=project_id, limit=limit)


@router.get("/harnesses", response_model=AidlcHarnessResponse)
async def discover_harnesses(
    days: int = Query(default=7, ge=1, le=30, description="Days of history to scan"),
    source: Optional[str] = Query(
        default=None,
        description="Comma-separated list of detection sources: cloudtrail,config_file,git_commit. If omitted, uses all sources.",
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Discover AI-DLC harnesses deployed across the organization.

    Uses multiple detection sources:

    **CloudTrail** - Scans Bedrock API calls and identifies harnesses from userAgent:
    - Claude Code (claude-cli/*, claude-code/*)
    - Kiro IDE (kiro-ide/*, kiro/*)
    - Kiro CLI (kiro-cli/*)
    - Codex CLI (codex-cli/*)
    - opencode (opencode/*)
    - Q Desktop (amazonq/*, amazon-q/*)
    - Cursor (cursor/*)
    - GitHub Copilot (copilot/*)

    **Config Files** - Scans CodeCommit repos for harness config files:
    - .claude/settings.json, CLAUDE.md -> Claude Code
    - .kiro/config.json, .kiro/steering/ -> Kiro
    - .cursor/rules/ -> Cursor
    - .aws/amazonq/ -> Q Desktop
    - .github/copilot-instructions.md -> Copilot

    **Git Commits** - Scans commit messages for harness patterns:
    - "Co-Authored-By: Claude" -> Claude Code
    - "Generated by Kiro" -> Kiro
    - Other tool-specific patterns

    Returns:
    - Aggregate stats per harness type (users, requests, versions, detection_sources)
    - Individual instances with detection_confidence (0-1, higher if multiple sources agree)
    - sources_used list indicating which detection methods returned results
    - If kill-switch is active, returns empty response with source="killswitch:*"

    Use this to understand harness adoption and version distribution.
    Filter by source to focus on specific detection methods.
    """
    sources = source.split(",") if source else None
    response, killswitch_active = get_service().discover_harnesses(days=days, sources=sources)
    return response


# ---------------------------------------------------------------------------
# Kill-switch endpoints
# ---------------------------------------------------------------------------

@router.get("/killswitch-status", response_model=KillswitchStatusResponse)
async def get_killswitch_status_endpoint(
    _=Depends(require_role(Role.VIEWER)),
):
    """Get the current kill-switch status.

    Returns the kill-switch state from all sources:
    - env_var: AVA_HARNESS_DISABLED environment variable
    - sentinel_file: .ava-harness-disabled file in working directory
    - dynamodb: Runtime toggle via admin API

    Sources are checked in order of precedence. If env_var or sentinel_file
    is active, the DynamoDB toggle has no effect.
    """
    status = get_killswitch_status()

    # Check individual sources for UI display
    from core.harness_killswitch import _check_env_var, _check_sentinel_file

    env_status = _check_env_var()
    sentinel_status = _check_sentinel_file()

    return KillswitchStatusResponse(
        disabled=status.disabled,
        source=status.source.value,
        reason=status.reason,
        disabled_at=status.disabled_at.isoformat() if status.disabled_at else None,
        disabled_by=status.disabled_by,
        env_var_active=env_status is not None,
        sentinel_file_active=sentinel_status is not None,
    )


@router.post("/killswitch", response_model=KillswitchUpdateResponse)
async def update_killswitch(
    req: KillswitchUpdateRequest,
    request: Request,
    _=Depends(require_role(Role.ADMIN)),
):
    """Toggle the harness kill-switch (ADMIN only).

    This endpoint controls the DynamoDB-based kill-switch. Note that env_var
    and sentinel_file sources take precedence - if either is active, the
    DynamoDB toggle has no effect until those are cleared.

    When disabled=True:
    - All harness operations return 503 Service Unavailable
    - Harness discovery returns empty results
    - This is an emergency control for governance incidents

    When disabled=False:
    - Normal harness operations resume
    - Note: If env_var or sentinel_file is active, harness ops remain disabled
    """
    # Extract user info from request if available
    user_email = request.headers.get("x-user-email", "unknown")

    try:
        new_status = set_killswitch_dynamodb(
            disabled=req.disabled,
            reason=req.reason,
            disabled_by=user_email,
        )

        # Check if higher-priority sources are blocking
        from core.harness_killswitch import _check_env_var, _check_sentinel_file

        env_status = _check_env_var()
        sentinel_status = _check_sentinel_file()

        message = "Kill-switch updated successfully"
        if req.disabled is False and new_status.disabled:
            # User tried to disable but it's still active due to higher priority source
            if env_status:
                message = "DynamoDB toggle disabled, but env_var is still active. Clear AVA_HARNESS_DISABLED to fully re-enable."
            elif sentinel_status:
                message = "DynamoDB toggle disabled, but sentinel file is still present. Remove .ava-harness-disabled to fully re-enable."

        return KillswitchUpdateResponse(
            success=True,
            status=KillswitchStatusResponse(
                disabled=new_status.disabled,
                source=new_status.source.value,
                reason=new_status.reason,
                disabled_at=new_status.disabled_at.isoformat() if new_status.disabled_at else None,
                disabled_by=new_status.disabled_by,
                env_var_active=env_status is not None,
                sentinel_file_active=sentinel_status is not None,
            ),
            message=message,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ---------------------------------------------------------------------------
# Backend sandboxing endpoints
# ---------------------------------------------------------------------------

@router.get("/backends", response_model=BackendCapabilitiesResponse)
async def list_backend_capabilities(
    _=Depends(require_role(Role.VIEWER)),
):
    """List capabilities for all harness backends.

    Returns tool permissions, execution capabilities, and feature support for:
    - CLI: Full tools including Bash (Claude Code CLI)
    - SDK: Anthropic SDK - no Bash/shell execution
    - Bedrock: AWS Bedrock - managed sandbox with guardrails
    - OpenAI: OpenAI-compatible - read-only operations only
    - Azure: Azure OpenAI - enterprise managed
    - Vertex: Google Vertex AI

    Use this to understand what each backend can do and enforce sandboxing.
    """
    return get_backend_service().get_all_backends()


@router.get("/backends/comparison", response_model=BackendComparisonResponse)
async def get_backend_comparison(
    _=Depends(require_role(Role.VIEWER)),
):
    """Get a comparison matrix of all backend capabilities.

    Returns:
    - Full capabilities for each backend
    - Tool matrix showing allowed/blocked/approval status per backend

    Use this for the backend comparison table in the UI.
    """
    return get_backend_service().get_backend_comparison()


@router.get("/backends/{backend}/tools", response_model=BackendToolsResponse)
async def get_backend_tools(
    backend: HarnessBackend,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get allowed tools for a specific backend.

    Returns the list of tools that are:
    - Allowed for this backend
    - Blocked for this backend
    - Require human approval before execution
    """
    return get_backend_service().get_backend_tools(backend)


@router.get("/backends/{backend}/validate")
async def validate_backend_operation(
    backend: HarnessBackend,
    tool_name: str = Query(..., description="The tool to validate"),
    is_write: bool = Query(default=False, description="Whether this is a write operation"),
    _=Depends(require_role(Role.VIEWER)),
) -> BackendToolValidation:
    """Validate whether a tool operation is allowed for a backend.

    Returns whether the operation is:
    - Allowed or blocked
    - Reason if blocked
    - Whether human approval is required
    """
    return get_backend_service().validate_operation(backend, tool_name, is_write)


@router.get("/backends/detect")
async def detect_backend_from_user_agent(
    user_agent: str = Query(..., description="The userAgent string to analyze"),
    _=Depends(require_role(Role.VIEWER)),
) -> dict:
    """Detect backend type from a userAgent string.

    Analyzes the userAgent to identify which backend is being used.
    Returns the detected backend and confidence score (0-100).
    """
    backend, confidence = get_backend_service().detect_backend_from_user_agent(user_agent)
    return {
        "backend": backend.value,
        "confidence": confidence,
        "user_agent": user_agent,
    }
