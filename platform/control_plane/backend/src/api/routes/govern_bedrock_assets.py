"""Govern Bedrock Assets — Flows and Prompts, read-through GET routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Path

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_bedrock_assets import (
    BedrockAssetsOverviewResponse,
    FlowDetailResponse,
    FlowsResponse,
    PromptDetailResponse,
    PromptsResponse,
)
from services.govern_bedrock_assets_service import GovernBedrockAssetsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/bedrock-assets", tags=["govern-bedrock-assets"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_bedrock_assets", region_scope.SINGLE_REGION, prefix="/govern/bedrock-assets")

_svc: Optional[GovernBedrockAssetsService] = None


def get_service() -> GovernBedrockAssetsService:
    global _svc
    if _svc is None:
        _svc = GovernBedrockAssetsService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/overview", response_model=BedrockAssetsOverviewResponse)
async def get_overview(_=Depends(require_role(Role.VIEWER))):
    """Combined overview of all Bedrock Flows and Prompts."""
    return get_service().get_overview()


@router.get("/flows", response_model=FlowsResponse)
async def get_flows(_=Depends(require_role(Role.VIEWER))):
    """List all Bedrock Flows."""
    return get_service().get_flows()


@router.get("/flows/{flow_id}", response_model=FlowDetailResponse)
async def get_flow_detail(
    flow_id: str = Path(..., description="Flow ID or ARN"),
    _=Depends(require_role(Role.VIEWER))
):
    """Get details for a specific Bedrock Flow."""
    return get_service().get_flow_detail(flow_id)


@router.get("/prompts", response_model=PromptsResponse)
async def get_prompts(_=Depends(require_role(Role.VIEWER))):
    """List all Bedrock Prompts."""
    return get_service().get_prompts()


@router.get("/prompts/{prompt_id}", response_model=PromptDetailResponse)
async def get_prompt_detail(
    prompt_id: str = Path(..., description="Prompt ID or ARN"),
    _=Depends(require_role(Role.VIEWER))
):
    """Get details for a specific Bedrock Prompt."""
    return get_service().get_prompt_detail(prompt_id)
