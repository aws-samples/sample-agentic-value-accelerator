"""Govern AgentCore — real deployed agents + AgentCore posture, read-through.

Discovers agents the account has ACTUALLY deployed — Bedrock Agents (classic,
`bedrock-agent:ListAgents`) and Bedrock AgentCore runtimes
(`bedrock-agentcore-control:ListAgentRuntimes`) — plus the AgentCore control-plane
posture (gateways, memories, workload identities, policy engines). This is agent
inventory discovered straight from AWS, independent of the AVA deployment pipeline.

Honest live/source/note flags; graceful per-call fallback that never raises.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from models.govern_region_provenance import RegionProvenance


class DiscoveredAgent(BaseModel):
    """One agent discovered from AWS (Bedrock Agent or AgentCore runtime)."""

    id: str
    name: str
    status: str = Field(..., description="e.g. PREPARED (Bedrock), READY (AgentCore)")
    platform: str = Field(..., description="'bedrock-agent' | 'agentcore-runtime'")
    version: Optional[str] = None
    updated_at: Optional[str] = None
    arn: Optional[str] = Field(
        None,
        description=(
            "Account-masked resource ARN when the discovery API returns one. "
            "AgentCore runtimes carry agentRuntimeArn; classic Bedrock Agent "
            "summaries do not expose an ARN, so this stays null for them."
        ),
    )
    description: Optional[str] = Field(
        None,
        description=(
            "The agent's own description as AWS returns it, verbatim. Both "
            "ListAgents (agentSummaries[].description) and ListAgentRuntimes "
            "(agentRuntimes[].description) include it, at no extra API cost, but "
            "only when the agent was created with one - measured on the reference "
            "account, 5 of 7 Bedrock Agents and 8 of 29 AgentCore runtimes have "
            "one. None means AWS returned no description for this agent; render "
            "that as absent rather than substituting a generated sentence, which "
            "is what the frontend mapper used to do ('AWS Bedrock Agent (live)')."
        ),
    )


class DiscoveredAgentsResponse(BaseModel):
    """Real deployed agents pulled from Bedrock Agents + AgentCore runtimes."""

    agents: List[DiscoveredAgent] = Field(default_factory=list)
    total: int = 0
    bedrock_agents: int = Field(0, description="Classic Bedrock Agents count")
    agentcore_runtimes: int = Field(0, description="AgentCore runtime count")
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class PostureResource(BaseModel):
    """A single AgentCore control-plane resource, normalized."""

    name: str
    status: Optional[str] = None
    updated_at: Optional[str] = None


class PostureCategory(BaseModel):
    """One AgentCore resource category (gateways, memories, etc.)."""

    key: str = Field(..., description="gateways | gateway-targets | memories | workload-identities | policy-engines | knowledge-bases")
    label: str
    total: int = 0
    ready: int = Field(0, description="Count in a READY/ACTIVE state")
    items: List[PostureResource] = Field(default_factory=list, description="First few, for display")
    live: bool = False
    note: Optional[str] = None


class AgentCorePostureResponse(BaseModel):
    """AgentCore control-plane posture across resource categories."""

    categories: List[PostureCategory] = Field(default_factory=list)
    live: bool
    source: str
    note: Optional[str] = None


class AgentRuntimeMetric(BaseModel):
    """Real per-agent runtime metrics from CloudWatch AWS/Bedrock-AgentCore.

    Keyed by the agent runtime name (the CloudWatch `Name` dimension with the
    `::DEFAULT` endpoint suffix stripped). Only agents that have actually been
    invoked emit these — idle runtimes won't appear.
    """

    runtime_name: str
    invocations: int = 0
    avg_latency_ms: float = 0.0
    errors: int = 0
    sessions: int = 0


class AgentRuntimeMetricsResponse(BaseModel):
    """Per-agent runtime metrics for the agents that have traffic."""

    by_agent: List[AgentRuntimeMetric] = Field(default_factory=list)
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


class RuntimeMetrics(BaseModel):
    """Runtime-level metrics: throttles, active sessions, errors."""

    throttles: int = 0
    active_session_count: int = Field(0, description="Current active sessions gauge")
    system_errors: int = 0
    user_errors: int = 0
    by_service: dict[str, dict[str, float]] = Field(
        default_factory=dict,
        description="Service breakdowns: AgentCore.Runtime, CodeInterpreter, Browser",
    )


class RuntimeMetricsResponse(BaseModel):
    """Runtime metrics response from AWS/Bedrock-AgentCore namespace."""

    metrics: RuntimeMetrics
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


class ResourceUsageMetric(BaseModel):
    """Per-resource usage metric (CPU/Memory)."""

    service: str
    resource: str
    name: str
    cpu_vcpu_hours: float = 0.0
    memory_gb_hours: float = 0.0


class ResourceUsageResponse(BaseModel):
    """Resource usage metrics: CPU and memory consumption by service/resource/name."""

    by_resource: List[ResourceUsageMetric] = Field(default_factory=list)
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


class GatewayMetric(BaseModel):
    """Gateway-level metrics: invocations, latency, errors."""

    operation: str
    protocol: Optional[str] = None
    method: Optional[str] = None
    resource: Optional[str] = None
    name: Optional[str] = None
    invocations: int = 0
    throttles: int = 0
    system_errors: int = 0
    user_errors: int = 0
    latency_avg_ms: float = 0.0
    latency_p50_ms: float = 0.0
    latency_p90_ms: float = 0.0
    latency_p99_ms: float = 0.0
    duration_avg_ms: float = 0.0
    duration_p50_ms: float = 0.0
    duration_p90_ms: float = 0.0
    duration_p99_ms: float = 0.0
    target_execution_time_avg_ms: float = 0.0
    target_execution_time_p50_ms: float = 0.0
    target_execution_time_p90_ms: float = 0.0
    target_execution_time_p99_ms: float = 0.0
    target_type_count: int = 0


class GatewayMetricsResponse(BaseModel):
    """Gateway metrics from AWS/Bedrock-AgentCore namespace."""

    by_gateway: List[GatewayMetric] = Field(default_factory=list)
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


class MemoryMetric(BaseModel):
    """Memory store metrics: invocations, latency, errors, creations."""

    name: Optional[str] = None
    invocations: int = 0
    latency_avg_ms: float = 0.0
    latency_p50_ms: float = 0.0
    latency_p90_ms: float = 0.0
    latency_p99_ms: float = 0.0
    system_errors: int = 0
    user_errors: int = 0
    creation_count: int = 0


class MemoryMetricsResponse(BaseModel):
    """Memory store metrics from AWS/Bedrock-AgentCore namespace."""

    by_memory: List[MemoryMetric] = Field(default_factory=list)
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


class AgentTrace(BaseModel):
    """Single agent trace/span from CloudWatch Logs or X-Ray."""

    trace_id: str
    span_id: str
    operation_name: str
    agent_id: Optional[str] = None
    endpoint_name: Optional[str] = None
    session_id: Optional[str] = None
    latency_ms: float = 0.0
    error_type: Optional[str] = None
    timestamp: str
    request_id: Optional[str] = None
    resource_arn: Optional[str] = None


class AgentTracesResponse(BaseModel):
    """Agent runtime traces/spans from CloudWatch Logs Insights or X-Ray."""

    traces: List[AgentTrace] = Field(default_factory=list)
    total_count: int = 0
    window_days: int = 7
    live: bool
    source: str
    note: Optional[str] = None


# ─────────────────── Detailed AgentCore Resource Lists ───────────────────


class Gateway(BaseModel):
    """Detailed gateway resource from AgentCore."""

    gateway_id: str
    name: str
    status: str
    description: Optional[str] = None
    protocol_type: Optional[str] = None
    authorization_type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GatewaysListResponse(BaseModel):
    """Full list of AgentCore gateways."""

    gateways: List[Gateway] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class GatewayTarget(BaseModel):
    """Detailed gateway target resource."""

    target_id: str
    gateway_id: str
    name: str
    status: str
    target_type: Optional[str] = None
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GatewayTargetsListResponse(BaseModel):
    """Full list of gateway targets across all gateways."""

    targets: List[GatewayTarget] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class PolicyEngine(BaseModel):
    """Detailed policy engine resource from AgentCore."""

    policy_engine_id: str
    name: str
    status: str
    description: Optional[str] = None
    policy_store_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PolicyEnginesListResponse(BaseModel):
    """Full list of AgentCore policy engines."""

    policy_engines: List[PolicyEngine] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )


class WorkloadIdentity(BaseModel):
    """Detailed workload identity resource from AgentCore.

    AgentCore workload (machine) identities carry NO IAM resource scoping. The
    only resource-ish field is `oauth2_return_urls` — the OAuth2 redirect
    allow-list from GetWorkloadIdentity (usually empty). Real agent resource
    permissions come from each agent's IAM execution role, not the identity.
    """

    name: str
    workload_identity_id: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None
    oauth2_return_urls: List[str] = Field(default_factory=list)
    # Back-compat only; AgentCore workload identities do not carry IAM resource
    # scoping, so this is always None (the list/detail APIs never populate it).
    allowed_resources: Optional[List[str]] = None


class WorkloadIdentitiesListResponse(BaseModel):
    """Full list of AgentCore workload identities."""

    workload_identities: List[WorkloadIdentity] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )
