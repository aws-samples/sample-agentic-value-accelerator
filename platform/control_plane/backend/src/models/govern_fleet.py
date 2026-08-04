"""Govern Fleet — Server-side aggregation for 10k+ agent fleet scaling.

Pre-aggregates agent inventory data into governance-relevant rollups (summary,
segments, exception queue) so the frontend never fetches 10k raw agent records.

Sources: Bedrock Agents, AgentCore runtimes, AVA deployments, multi-cloud connector
metadata. Aggregation runs server-side with caching; the client receives pre-computed
counts and a bounded exception queue.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class GovernanceDistribution(BaseModel):
    """Governance status distribution across the fleet."""

    compliant: int = 0
    review_needed: int = 0
    blocked: int = 0
    unknown: int = 0


class RiskDistribution(BaseModel):
    """Risk tier distribution (0-100 score bucketed into 4 tiers)."""

    critical: int = Field(0, description="score >= 75")
    high: int = Field(0, description="50 <= score < 75")
    medium: int = Field(0, description="25 <= score < 50")
    low: int = Field(0, description="score < 25")


class ScopeDistribution(BaseModel):
    """Autonomy scope distribution (AWS Scoping Matrix L1-L4)."""

    l1_no_agency: int = Field(0, alias="1")
    l2_prescribed: int = Field(0, alias="2")
    l3_supervised: int = Field(0, alias="3")
    l4_full_agency: int = Field(0, alias="4")

    class Config:
        populate_by_name = True


class FleetSummary(BaseModel):
    """Pre-aggregated fleet summary — the only thing the hero needs (no row rendering)."""

    total: int = 0
    governance: GovernanceDistribution = Field(default_factory=GovernanceDistribution)
    risk: RiskDistribution = Field(default_factory=RiskDistribution)
    scope: ScopeDistribution = Field(default_factory=ScopeDistribution)
    prod_full_agency: int = Field(0, description="prod environment + scope L4 — highest blast radius")
    open_incidents: int = Field(0, description="total open incidents across fleet")
    unprotected: int = Field(0, description="agents without active guardrail/policy")
    needs_attention: int = Field(0, description="size of the exception set")
    pct_compliant: int = Field(0, description="governance.compliant / total * 100")
    live: bool = False
    source: str = "aggregation"
    note: Optional[str] = None


class FleetSummaryResponse(BaseModel):
    """Response wrapper for fleet summary."""

    summary: FleetSummary
    live: bool
    source: str
    note: Optional[str] = None


class SegmentRow(BaseModel):
    """One segment (grouped by business unit, provider, or environment)."""

    key: str
    total: int = 0
    compliant: int = 0
    review_needed: int = 0
    blocked: int = 0
    critical: int = 0
    high: int = 0
    pct_compliant: int = 0


class FleetSegmentsResponse(BaseModel):
    """Segments grouped by a dimension (for heatmap)."""

    group_by: str = Field(..., description="businessUnit | provider | environment")
    segments: List[SegmentRow] = Field(default_factory=list)
    live: bool
    source: str
    note: Optional[str] = None


class ExceptionAgent(BaseModel):
    """One agent in the exception/attention queue (bounded, never the full fleet)."""

    id: str
    name: str
    business_unit: str
    environment: Literal["prod", "pilot", "dev"]
    provider: str
    scope_level: int = Field(..., ge=1, le=4)
    governance_status: str
    risk_score: int = Field(..., ge=0, le=100)
    open_incidents: int = 0
    has_policy: bool = False
    attention_score: int = Field(0, description="composite score driving queue order")
    reasons: List[str] = Field(default_factory=list, description="why this agent is flagged")


class FleetExceptionsResponse(BaseModel):
    """Bounded exception queue — top N agents needing attention."""

    queue: List[ExceptionAgent] = Field(default_factory=list)
    queue_size: int = Field(0, description="size of returned queue")
    total_needing_attention: int = Field(0, description="full count before limit")
    limit: int = Field(100, description="max agents returned")
    filter_key: Optional[str] = Field(None, description="filter applied (e.g. business unit)")
    live: bool
    source: str
    note: Optional[str] = None


class InventoryRow(BaseModel):
    """Inventory breakdown row (by model, provider, etc.)."""

    key: str
    count: int
    pct_of_fleet: int


class FleetInventoryResponse(BaseModel):
    """Inventory breakdown for the registry lens."""

    by_model: List[InventoryRow] = Field(default_factory=list)
    by_provider: List[InventoryRow] = Field(default_factory=list)
    live: bool
    source: str
    note: Optional[str] = None
