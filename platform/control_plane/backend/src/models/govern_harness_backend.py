"""Govern Harness Backend — Backend-specific sandboxing for AI harnesses.

Defines which tools each AI harness backend can use, enabling fine-grained
control over capabilities based on the underlying provider:
- CLI: Full tools including Bash (Claude Code CLI)
- SDK: Anthropic SDK - no Bash/shell execution
- Bedrock: AWS Bedrock - managed sandbox with guardrails
- OpenAI: OpenAI-compatible - read-only operations only
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class HarnessBackend(str, Enum):
    """Supported AI harness backends."""
    CLI = "cli"           # Full tools including Bash (Claude Code CLI)
    SDK = "sdk"           # Anthropic SDK - no Bash
    BEDROCK = "bedrock"   # AWS Bedrock - managed sandbox
    OPENAI = "openai"     # OpenAI-compatible - read-only only
    AZURE = "azure"       # Azure OpenAI - enterprise managed
    VERTEX = "vertex"     # Google Vertex AI


class BackendCapabilities(BaseModel):
    """Capabilities and restrictions for a harness backend."""
    backend: HarnessBackend = Field(..., description="The backend type")
    allowed_tools: List[str] = Field(
        default_factory=list,
        description="Tools this backend is allowed to use"
    )
    blocked_tools: List[str] = Field(
        default_factory=list,
        description="Tools explicitly blocked for this backend"
    )
    can_write: bool = Field(
        default=False,
        description="Whether the backend can write/edit files"
    )
    can_execute: bool = Field(
        default=False,
        description="Whether the backend can execute shell commands"
    )
    max_context_tokens: int = Field(
        default=128000,
        description="Maximum context window in tokens"
    )
    supports_streaming: bool = Field(
        default=True,
        description="Whether the backend supports streaming responses"
    )
    supports_tool_use: bool = Field(
        default=True,
        description="Whether the backend supports tool/function calling"
    )
    requires_human_approval_for: List[str] = Field(
        default_factory=list,
        description="Tool names that require human approval before execution"
    )
    supports_mcp: bool = Field(
        default=False,
        description="Whether the backend supports MCP (Model Context Protocol)"
    )
    supports_agents: bool = Field(
        default=False,
        description="Whether the backend supports spawning sub-agents"
    )


# Standard tool definitions
STANDARD_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent", "WebFetch"]

# Default capabilities per backend
BACKEND_DEFAULTS: dict[HarnessBackend, BackendCapabilities] = {
    HarnessBackend.CLI: BackendCapabilities(
        backend=HarnessBackend.CLI,
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent", "WebFetch"],
        blocked_tools=[],
        can_write=True,
        can_execute=True,
        max_context_tokens=200000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=["Bash"],  # Dangerous operations
        supports_mcp=True,
        supports_agents=True,
    ),
    HarnessBackend.SDK: BackendCapabilities(
        backend=HarnessBackend.SDK,
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],
        blocked_tools=["Bash", "Agent"],
        can_write=True,
        can_execute=False,
        max_context_tokens=200000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=["Write", "Edit"],
        supports_mcp=True,
        supports_agents=False,
    ),
    HarnessBackend.BEDROCK: BackendCapabilities(
        backend=HarnessBackend.BEDROCK,
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],
        blocked_tools=["Bash", "Agent"],
        can_write=True,
        can_execute=False,
        max_context_tokens=200000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=["Write", "Edit"],
        supports_mcp=False,  # MCP not yet supported in Bedrock
        supports_agents=False,
    ),
    HarnessBackend.OPENAI: BackendCapabilities(
        backend=HarnessBackend.OPENAI,
        allowed_tools=["Read", "Glob", "Grep"],
        blocked_tools=["Write", "Edit", "Bash", "Agent"],
        can_write=False,
        can_execute=False,
        max_context_tokens=128000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=[],
        supports_mcp=False,
        supports_agents=False,
    ),
    HarnessBackend.AZURE: BackendCapabilities(
        backend=HarnessBackend.AZURE,
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],
        blocked_tools=["Bash", "Agent"],
        can_write=True,
        can_execute=False,
        max_context_tokens=128000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=["Write", "Edit"],
        supports_mcp=False,
        supports_agents=False,
    ),
    HarnessBackend.VERTEX: BackendCapabilities(
        backend=HarnessBackend.VERTEX,
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],
        blocked_tools=["Bash", "Agent"],
        can_write=True,
        can_execute=False,
        max_context_tokens=128000,
        supports_streaming=True,
        supports_tool_use=True,
        requires_human_approval_for=["Write", "Edit"],
        supports_mcp=False,
        supports_agents=False,
    ),
}


class BackendDetectionRule(BaseModel):
    """Rule for detecting backend type from userAgent patterns."""
    pattern: str = Field(..., description="Pattern to match in userAgent")
    backend: HarnessBackend = Field(..., description="Backend type when matched")
    priority: int = Field(default=0, description="Higher priority rules are checked first")


# Default detection rules for identifying backend from userAgent
BACKEND_DETECTION_RULES: List[BackendDetectionRule] = [
    BackendDetectionRule(pattern="claude-cli", backend=HarnessBackend.CLI, priority=100),
    BackendDetectionRule(pattern="claude-code", backend=HarnessBackend.CLI, priority=100),
    BackendDetectionRule(pattern="anthropic-sdk", backend=HarnessBackend.SDK, priority=90),
    BackendDetectionRule(pattern="anthropic/", backend=HarnessBackend.SDK, priority=80),
    BackendDetectionRule(pattern="bedrock", backend=HarnessBackend.BEDROCK, priority=95),
    BackendDetectionRule(pattern="aws-sdk", backend=HarnessBackend.BEDROCK, priority=85),
    BackendDetectionRule(pattern="openai", backend=HarnessBackend.OPENAI, priority=70),
    BackendDetectionRule(pattern="azure", backend=HarnessBackend.AZURE, priority=75),
    BackendDetectionRule(pattern="vertex", backend=HarnessBackend.VERTEX, priority=75),
]


class BackendToolValidation(BaseModel):
    """Result of validating a tool operation for a backend."""
    allowed: bool = Field(..., description="Whether the operation is allowed")
    reason: str = Field(default="", description="Explanation if blocked")
    requires_approval: bool = Field(
        default=False,
        description="Whether human approval is required"
    )


class BackendAssignment(BaseModel):
    """Assignment of a backend to a harness instance."""
    harness_id: str = Field(..., description="The harness instance ID")
    backend: HarnessBackend = Field(..., description="Assigned backend type")
    custom_allowed_tools: Optional[List[str]] = Field(
        default=None,
        description="Override allowed tools (if different from default)"
    )
    custom_blocked_tools: Optional[List[str]] = Field(
        default=None,
        description="Additional tools to block"
    )
    assigned_by: Optional[str] = Field(
        default=None,
        description="User who made the assignment"
    )
    assigned_at: Optional[str] = Field(
        default=None,
        description="When the assignment was made"
    )


# Response models

class BackendCapabilitiesResponse(BaseModel):
    """Response with all backend capabilities."""
    backends: List[BackendCapabilities]
    standard_tools: List[str] = STANDARD_TOOLS


class BackendToolsResponse(BaseModel):
    """Response with allowed tools for a backend."""
    backend: HarnessBackend
    allowed_tools: List[str]
    blocked_tools: List[str]
    requires_approval: List[str]


class BackendComparisonResponse(BaseModel):
    """Response comparing capabilities across backends."""
    backends: List[BackendCapabilities]
    tool_matrix: dict  # tool_name -> {backend: allowed/blocked/approval}
