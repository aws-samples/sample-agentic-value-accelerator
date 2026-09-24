"""Govern Harness Policy — tiered tool access for AI harness governance.

Defines policies that control which tools each harness type can access,
what paths they can read/write, and what outputs they can produce.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ToolTier(str, Enum):
    """Tool access tier for harnesses."""

    READ_ONLY = "read_only"      # Glob, Grep, Read, WebFetch (read-only)
    READ_WRITE = "read_write"    # + Edit, Write (can modify files)
    FULL = "full"                # + Bash, Agent (full system access)


class HarnessPhase(str, Enum):
    """Phase of the harness workflow affecting tool access."""

    DISCOVERY = "discovery"      # Read-only phase (exploring, searching)
    BUILD = "build"              # Read-write phase (creating, modifying)
    VALIDATION = "validation"    # Read-only adversarial (reviewing, testing)


# Default tool mappings per tier
TIER_TOOLS = {
    ToolTier.READ_ONLY: ["Glob", "Grep", "Read", "WebFetch", "ToolSearch"],
    ToolTier.READ_WRITE: ["Glob", "Grep", "Read", "WebFetch", "ToolSearch", "Edit", "Write", "NotebookEdit"],
    ToolTier.FULL: ["Glob", "Grep", "Read", "WebFetch", "ToolSearch", "Edit", "Write", "NotebookEdit", "Bash", "Agent", "SendMessage"],
}

# Default blocked paths for security
DEFAULT_BLOCKED_PATHS = [
    "**/secrets/**",
    "**/.env",
    "**/.env.*",
    "**/credentials/**",
    "**/private/**",
    "**/*.pem",
    "**/*.key",
    "**/id_rsa*",
    "**/.aws/credentials",
    "**/.ssh/**",
]


class HarnessPolicy(BaseModel):
    """Policy defining tool access and constraints for an AI harness."""

    policy_id: str = Field(..., description="Unique policy identifier")
    harness_type: str = Field(..., description="Harness type, e.g., claude_code, kiro, codex")
    display_name: str = Field("", description="Human-readable name")
    description: Optional[str] = Field(None, description="Policy description")

    # Tool tier and access
    allowed_tier: ToolTier = Field(ToolTier.READ_ONLY, description="Maximum tool tier allowed")
    allowed_tools: List[str] = Field(default_factory=list, description="Explicit list of allowed tools (overrides tier)")
    blocked_tools: List[str] = Field(default_factory=list, description="Tools explicitly blocked regardless of tier")

    # Path restrictions
    allowed_paths: List[str] = Field(default_factory=lambda: ["**"], description="Glob patterns for allowed paths")
    blocked_paths: List[str] = Field(default_factory=lambda: DEFAULT_BLOCKED_PATHS.copy(), description="Glob patterns for blocked paths (e.g., **/secrets/**)")

    # Output constraints
    max_output_size_kb: int = Field(200, ge=1, le=10000, description="Maximum output size in KB")
    max_file_size_kb: int = Field(1000, ge=1, le=100000, description="Maximum file size for read/write in KB")

    # Approval requirements
    require_human_approval: bool = Field(False, description="Require human approval for actions")
    approval_required_for: List[str] = Field(default_factory=list, description="Specific tools requiring approval")

    # Status
    enabled: bool = Field(True, description="Whether policy is active")
    created_at: Optional[str] = Field(None, description="ISO8601 creation timestamp")
    updated_at: Optional[str] = Field(None, description="ISO8601 last update timestamp")


class HarnessPolicyCreate(BaseModel):
    """Request to create a new harness policy."""

    harness_type: str = Field(..., description="Harness type identifier")
    display_name: Optional[str] = Field(None, description="Human-readable name")
    description: Optional[str] = Field(None, description="Policy description")
    allowed_tier: ToolTier = Field(ToolTier.READ_ONLY, description="Maximum tool tier allowed")
    allowed_tools: Optional[List[str]] = Field(None, description="Explicit allowed tools")
    blocked_tools: Optional[List[str]] = Field(None, description="Blocked tools")
    allowed_paths: Optional[List[str]] = Field(None, description="Allowed path patterns")
    blocked_paths: Optional[List[str]] = Field(None, description="Blocked path patterns")
    max_output_size_kb: int = Field(200, ge=1, le=10000)
    max_file_size_kb: int = Field(1000, ge=1, le=100000)
    require_human_approval: bool = Field(False)
    approval_required_for: Optional[List[str]] = Field(None)


class HarnessPolicyUpdate(BaseModel):
    """Request to update an existing harness policy."""

    display_name: Optional[str] = None
    description: Optional[str] = None
    allowed_tier: Optional[ToolTier] = None
    allowed_tools: Optional[List[str]] = None
    blocked_tools: Optional[List[str]] = None
    allowed_paths: Optional[List[str]] = None
    blocked_paths: Optional[List[str]] = None
    max_output_size_kb: Optional[int] = Field(None, ge=1, le=10000)
    max_file_size_kb: Optional[int] = Field(None, ge=1, le=100000)
    require_human_approval: Optional[bool] = None
    approval_required_for: Optional[List[str]] = None
    enabled: Optional[bool] = None


class ToolAccessEvaluation(BaseModel):
    """Result of evaluating tool access for a harness."""

    allowed: bool = Field(..., description="Whether access is allowed")
    reason: str = Field("", description="Explanation for the decision")
    harness_type: str = Field(..., description="Harness type evaluated")
    tool_name: str = Field(..., description="Tool that was evaluated")
    target_path: Optional[str] = Field(None, description="Path being accessed, if applicable")
    requires_approval: bool = Field(False, description="Whether human approval is required")
    tier_required: Optional[ToolTier] = Field(None, description="Minimum tier required for this tool")
    policy_tier: Optional[ToolTier] = Field(None, description="Current policy tier")


class HarnessPolicyListResponse(BaseModel):
    """Response containing list of harness policies."""

    policies: List[HarnessPolicy] = Field(default_factory=list)
    total: int = 0
    live: bool = False
    source: str = "default-policies"
    note: Optional[str] = None


class ToolTierSummary(BaseModel):
    """Summary of tools available at each tier."""

    tier: ToolTier
    label: str
    tools: List[str]
    description: str


class TierBreakdownResponse(BaseModel):
    """Response with tier breakdown information."""

    tiers: List[ToolTierSummary] = Field(default_factory=list)
    blocked_paths_default: List[str] = Field(default_factory=list)
