"""Govern AgentCore — real deployed agents + AgentCore posture, read-through GET routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.config import settings
from core.rbac import Role, require_role
from models.govern_agentcore import AgentCorePostureResponse, AgentRuntimeMetricsResponse, DiscoveredAgentsResponse
from services.govern_agentcore_service import GovernAgentCoreService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/agentcore", tags=["govern-agentcore"])

_svc: Optional[GovernAgentCoreService] = None


def get_service() -> GovernAgentCoreService:
    global _svc
    if _svc is None:
        _svc = GovernAgentCoreService(region=settings.AWS_REGION)
    return _svc


@router.get("/agents", response_model=DiscoveredAgentsResponse)
async def get_discovered_agents(_=Depends(require_role(Role.VIEWER))):
    """Real deployed agents from Bedrock Agents + AgentCore runtimes."""
    return get_service().get_agents()


@router.get("/posture", response_model=AgentCorePostureResponse)
async def get_agentcore_posture(_=Depends(require_role(Role.VIEWER))):
    """AgentCore control-plane posture — gateways, memories, identities, policy engines, KBs."""
    return get_service().get_posture()


@router.get("/agent-metrics", response_model=AgentRuntimeMetricsResponse)
async def get_agent_metrics(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Real per-agent runtime metrics from CloudWatch AWS/Bedrock-AgentCore (agents with traffic)."""
    return get_service().get_agent_metrics(days=days)
