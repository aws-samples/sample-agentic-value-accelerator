"""Govern multi-region — models for region discovery + governed-region management.

Region discovery scans the account's enabled AWS regions for governed-AI signals
(Bedrock guardrails, AgentCore runtimes/identities/gateways, Bedrock invocation
activity) so the UI can prompt the operator to bring active-but-ungoverned regions
under governance. Aggregates only — counts and presence flags, never resource bodies.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class RegionSignal(BaseModel):
    """AI-resource signals discovered in a single AWS region."""

    region: str
    guardrails: int = 0
    agent_runtimes: int = 0
    workload_identities: int = 0
    gateways: int = 0
    knowledge_bases: int = 0
    has_bedrock_activity: bool = Field(
        False, description="True when the AWS/Bedrock Invocations metric exists in-region"
    )
    resource_total: int = Field(0, description="Sum of discovered governed-AI resources")
    governed: bool = Field(False, description="True when this region is in the governed set")
    reachable: bool = Field(True, description="False when probes failed (region opted-out / no access)")
    note: Optional[str] = None


class RegionDiscoveryResponse(BaseModel):
    """Result of scanning all enabled regions for governed-AI resources."""

    regions: List[RegionSignal] = Field(default_factory=list)
    governed_regions: List[str] = Field(default_factory=list)
    # Regions with real AI signals that are NOT yet under governance — the prompt targets.
    discovered_ungoverned: List[str] = Field(default_factory=list)
    regions_scanned: int = 0
    live: bool = False
    source: str = "region-discovery"
    note: Optional[str] = None


class GovernedRegionsResponse(BaseModel):
    """The current governed-region set (persisted)."""

    regions: List[str] = Field(default_factory=list)
    default_region: str = Field(..., description="Fallback region when the set is empty")
    source: str = Field("config-file", description="Where the set is persisted")


class SetGovernedRegionsRequest(BaseModel):
    """Replace or extend the governed-region set."""

    regions: List[str] = Field(
        ...,
        min_length=1,
        description="Region ids to govern, e.g. ['us-east-1','us-west-2']. Validated against the account's enabled regions by the route.",
    )
    mode: Literal["add", "replace"] = Field(
        "add",
        description=(
            "'add' unions with the current set, 'replace' overwrites it. A Literal, not a "
            "free string: set_governed_regions treats anything that is not exactly 'replace' "
            "as 'add', so a typo like 'Replace' silently WIDENED governance when the operator "
            "meant to narrow it. FastAPI now rejects it with a 422 instead."
        ),
    )


class SurfaceScope(BaseModel):
    """One Govern surface's declared region coverage."""

    surface: str = Field(..., description="Route module name, e.g. 'govern_macie'")
    prefix: str = Field("", description="Router prefix the surface mounts under; not unique across surfaces")
    scope: str = Field(..., description="multi-region | single-region | account-pinned | control-plane")
    meaning: str = Field(..., description="What the scope means for the numbers this surface renders")


class RegionScopeResponse(BaseModel):
    """Declared region coverage for every Govern surface.

    Exists so the UI can label a panel with the region reach its data actually has.
    A count from one region and a count merged from five look identical on screen, and
    only the route knows which it is — this is the route saying so.

    `by_scope` is the same information keyed the other way, for rendering a legend
    without re-grouping client-side.
    """

    surfaces: List[SurfaceScope] = Field(default_factory=list)
    by_scope: dict = Field(default_factory=dict, description="scope -> surface names")
    scope_meanings: dict = Field(default_factory=dict, description="scope -> plain-language meaning")
    governed_regions: List[str] = Field(
        default_factory=list,
        description="The set multi-region surfaces fan out over; single-region surfaces cover only the default.",
    )
    default_region: str = Field(..., description="The region single-region surfaces read")
    source: str = "region-scope-registry"
