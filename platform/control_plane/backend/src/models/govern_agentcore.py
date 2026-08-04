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


class DiscoveredAgent(BaseModel):
    """One agent discovered from AWS (Bedrock Agent or AgentCore runtime)."""

    id: str
    name: str
    status: str = Field(..., description="e.g. PREPARED (Bedrock), READY (AgentCore)")
    platform: str = Field(..., description="'bedrock-agent' | 'agentcore-runtime'")
    version: Optional[str] = None
    updated_at: Optional[str] = None


class DiscoveredAgentsResponse(BaseModel):
    """Real deployed agents pulled from Bedrock Agents + AgentCore runtimes."""

    agents: List[DiscoveredAgent] = Field(default_factory=list)
    total: int = 0
    bedrock_agents: int = Field(0, description="Classic Bedrock Agents count")
    agentcore_runtimes: int = Field(0, description="AgentCore runtime count")
    live: bool
    source: str
    note: Optional[str] = None


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
