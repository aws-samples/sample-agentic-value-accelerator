"""Govern AgentCore — real deployed agents + AgentCore posture, read-through GET routes.

Inventory (list) endpoints aggregate across the governed-region set (core.region_config)
via core.multiregion.run_over_regions; metrics/telemetry endpoints stay single-region and
resolve against the primary governed region so they continue to work unchanged.
"""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from core.region_config import get_governed_regions
from models.govern_agentcore import (
    AgentCorePostureResponse,
    AgentRuntimeMetricsResponse,
    AgentTracesResponse,
    DiscoveredAgentsResponse,
    GatewayMetricsResponse,
    GatewaysListResponse,
    GatewayTargetsListResponse,
    MemoryMetricsResponse,
    PolicyEnginesListResponse,
    ResourceUsageResponse,
    WorkloadIdentitiesListResponse,
)
from services.govern_agentcore_service import GovernAgentCoreService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/agentcore", tags=["govern-agentcore"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_agentcore", region_scope.MULTI_REGION, prefix="/govern/agentcore")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernAgentCoreService] = {}


def _svc_for(region: str) -> GovernAgentCoreService:
    if region not in _svcs:
        _svcs[region] = GovernAgentCoreService(region=region)
    return _svcs[region]


def _primary_region() -> str:
    """Primary governed region for single-region (metrics/telemetry) endpoints."""
    regions = get_governed_regions()
    return regions[0] if regions else settings.GOVERN_AWS_REGION


# ─────────────────── Multi-region mergers (inventory endpoints) ───────────────────


def _merge_agents(results: List[Tuple[str, object]]) -> DiscoveredAgentsResponse:
    agents: list = []
    total = bedrock = agentcore = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        agents.extend(d.get("agents", []))
        total += d.get("total", 0)
        bedrock += d.get("bedrock_agents", 0)
        agentcore += d.get("agentcore_runtimes", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return DiscoveredAgentsResponse(
        agents=agents,
        total=total,
        bedrock_agents=bedrock,
        agentcore_runtimes=agentcore,
        live=live,
        source=f"bedrock+agentcore ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_gateways(results: List[Tuple[str, object]]) -> GatewaysListResponse:
    gateways: list = []
    total = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        gateways.extend(d.get("gateways", []))
        total += d.get("total", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return GatewaysListResponse(
        gateways=gateways,
        total=total,
        live=live,
        source=f"bedrock-agentcore-control ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_gateway_targets(results: List[Tuple[str, object]]) -> GatewayTargetsListResponse:
    targets: list = []
    total = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        targets.extend(d.get("targets", []))
        total += d.get("total", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return GatewayTargetsListResponse(
        targets=targets,
        total=total,
        live=live,
        source=f"bedrock-agentcore-control ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_policy_engines(results: List[Tuple[str, object]]) -> PolicyEnginesListResponse:
    engines: list = []
    total = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        engines.extend(d.get("policy_engines", []))
        total += d.get("total", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return PolicyEnginesListResponse(
        policy_engines=engines,
        total=total,
        live=live,
        source=f"bedrock-agentcore-control ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_workload_identities(results: List[Tuple[str, object]]) -> WorkloadIdentitiesListResponse:
    identities: list = []
    total = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        identities.extend(d.get("workload_identities", []))
        total += d.get("total", 0)
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return WorkloadIdentitiesListResponse(
        workload_identities=identities,
        total=total,
        live=live,
        source=f"bedrock-agentcore-control ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


# ─────────────────── Inventory endpoints (multi-region) ───────────────────


@router.get("/agents", response_model=DiscoveredAgentsResponse)
async def get_discovered_agents(_=Depends(require_role(Role.VIEWER))):
    """Real deployed agents from Bedrock Agents + AgentCore runtimes, across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_agents())
    return _merge_agents(results)


# ─────────────────── Metrics / telemetry endpoints (single-region) ───────────────────


@router.get("/posture", response_model=AgentCorePostureResponse)
async def get_agentcore_posture(_=Depends(require_role(Role.VIEWER))):
    """AgentCore control-plane posture — gateways, memories, identities, policy engines, KBs."""
    return _svc_for(_primary_region()).get_posture()


@router.get("/agent-metrics", response_model=AgentRuntimeMetricsResponse)
async def get_agent_metrics(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Real per-agent runtime metrics from CloudWatch AWS/Bedrock-AgentCore (agents with traffic)."""
    return _svc_for(_primary_region()).get_agent_metrics(days=days)


@router.get("/resource-usage", response_model=ResourceUsageResponse)
async def get_resource_usage(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """CPU/Memory usage metrics for AgentCore resources."""
    return _svc_for(_primary_region()).get_resource_usage(days=days)


@router.get("/gateway-metrics", response_model=GatewayMetricsResponse)
async def get_gateway_metrics(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Gateway invocation metrics from CloudWatch."""
    return _svc_for(_primary_region()).get_gateway_metrics(days=days)


@router.get("/memory-metrics", response_model=MemoryMetricsResponse)
async def get_memory_metrics(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Memory store metrics from CloudWatch."""
    return _svc_for(_primary_region()).get_memory_metrics(days=days)


@router.get("/traces", response_model=AgentTracesResponse)
async def get_traces(
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=100, ge=1, le=1000),
    _=Depends(require_role(Role.VIEWER))
):
    """Agent runtime traces/spans from X-Ray or CloudWatch Logs Insights."""
    return _svc_for(_primary_region()).get_traces(days=days, limit=limit)


@router.get("/model-invocations")
async def get_model_invocations(
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=50, ge=1, le=200),
    _=Depends(require_role(Role.VIEWER))
):
    """Bedrock model invocation logs with prompts, responses, tokens, and latency."""
    return _svc_for(_primary_region()).get_model_invocations(hours=hours, limit=limit)


@router.post("/enable-tracing/{agent_id}")
async def enable_agent_tracing(agent_id: str, _=Depends(require_role(Role.ADMIN))):
    """Enable observability tracing for an AgentCore agent runtime.

    This creates the necessary CloudWatch delivery sources and destinations
    for logs and traces on the specified agent.
    """
    return _svc_for(_primary_region()).enable_tracing(agent_id)


@router.post("/enable-transaction-search")
async def enable_transaction_search(_=Depends(require_role(Role.ADMIN))):
    """Enable CloudWatch Transaction Search (one-time account setup).

    This configures X-Ray to send trace segments to CloudWatch Logs,
    which is required for viewing AgentCore traces.
    """
    return _svc_for(_primary_region()).enable_transaction_search()


# ─────────────────── Detailed AgentCore Resource Lists ───────────────────


@router.get("/gateways", response_model=GatewaysListResponse)
async def list_gateways(_=Depends(require_role(Role.VIEWER))):
    """List all AgentCore gateways with full details, across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).list_gateways())
    return _merge_gateways(results)


@router.get("/gateway-targets", response_model=GatewayTargetsListResponse)
async def list_gateway_targets(
    gateway_id: str | None = Query(default=None, description="Filter to targets for a specific gateway"),
    _=Depends(require_role(Role.VIEWER))
):
    """List gateway targets across all gateways, or for a specific gateway, across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).list_gateway_targets(gateway_id=gateway_id))
    return _merge_gateway_targets(results)


@router.get("/policy-engines", response_model=PolicyEnginesListResponse)
async def list_policy_engines(_=Depends(require_role(Role.VIEWER))):
    """List all AgentCore policy engines with full details, across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).list_policy_engines())
    return _merge_policy_engines(results)


@router.get("/workload-identities", response_model=WorkloadIdentitiesListResponse)
async def list_workload_identities(_=Depends(require_role(Role.VIEWER))):
    """List all AgentCore workload identities with full details, across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).list_workload_identities())
    return _merge_workload_identities(results)
