"""Govern Harness Audit — audit artifacts for AI harness governance.

Implements the Visa VVAH (Verified Verifiable Audit History) pattern for harness
governance: every harness action (discovery, invocation, tool use, validation)
produces a signed artifact with input/output hashes, policy evaluation results,
and gate pass/fail status.

The HarnessRunManifest aggregates artifacts for a single harness session,
providing a complete audit trail suitable for compliance reporting and
examiner review.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HarnessActionType(str, Enum):
    """Type of harness action being audited."""
    DISCOVERY = "discovery"
    INVOCATION = "invocation"
    TOOL_USE = "tool_use"
    VALIDATION = "validation"


class HarnessVerdict(str, Enum):
    """Governance verdict for the action."""
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    NEEDS_REVIEW = "needs_review"


class HarnessAuditArtifactBase(BaseModel):
    """Base fields for creating a harness audit artifact."""

    # `model_id` is an AI model identifier (the model the audited action invoked) -
    # meaningful domain vocabulary, not a pydantic internal. Pydantic reserves the
    # `model_` prefix, so the namespace guard is disabled deliberately; renaming the
    # field would break the API contract the frontend reads. Pydantic merges config
    # down the MRO, so the Create/read subclasses below inherit this opt-out.
    model_config = {"protected_namespaces": ()}

    harness_type: str = Field(..., min_length=1, max_length=100, description="Type of harness (e.g., 'claude-code', 'mcp-server', 'bedrock-agent')")
    action_type: HarnessActionType = Field(..., description="Type of action being audited")
    user_identity: str = Field(..., min_length=1, max_length=240, description="Identity of user/principal initiating the action")

    # Context
    session_id: Optional[str] = Field(default=None, max_length=100, description="Session or conversation ID")
    model_id: Optional[str] = Field(default=None, max_length=200, description="Model ID if LLM invocation")
    tool_name: Optional[str] = Field(default=None, max_length=200, description="Tool name if tool use")
    target_path: Optional[str] = Field(default=None, max_length=500, description="Target path or resource")

    # Evidence
    input_hash: Optional[str] = Field(default=None, max_length=64, description="SHA256 of input (not raw content)")
    output_hash: Optional[str] = Field(default=None, max_length=64, description="SHA256 of output")
    duration_ms: int = Field(default=0, ge=0, description="Duration in milliseconds")
    token_count: Optional[int] = Field(default=None, ge=0, description="Token count if applicable")

    # Governance
    policy_evaluation: Optional[Dict[str, Any]] = Field(default=None, description="Policy rules that matched")
    gates_passed: List[str] = Field(default_factory=list, description="Gates that passed")
    gates_failed: List[str] = Field(default_factory=list, description="Gates that failed")
    verdict: HarnessVerdict = Field(default=HarnessVerdict.ALLOWED, description="Final governance verdict")


class HarnessAuditArtifactCreate(HarnessAuditArtifactBase):
    """Payload to create a new harness audit artifact. ID/timestamp are server-assigned."""
    pass


class HarnessAuditArtifact(HarnessAuditArtifactBase):
    """Complete harness audit artifact with server-assigned fields."""
    artifact_id: str = Field(default_factory=lambda: f"haa-{uuid.uuid4().hex[:12]}")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HarnessRunManifestBase(BaseModel):
    """Base fields for creating a harness run manifest."""
    harness_type: str = Field(..., min_length=1, max_length=100)
    harness_version: str = Field(..., min_length=1, max_length=50)
    user_identity: str = Field(..., min_length=1, max_length=240)
    config_hash: str = Field(..., min_length=1, max_length=64, description="SHA256 of harness config")
    git_sha: Optional[str] = Field(default=None, max_length=40, description="Git commit SHA if available")


class HarnessRunManifestCreate(HarnessRunManifestBase):
    """Payload to create a new harness run manifest."""
    pass


class HarnessRunSummary(BaseModel):
    """Summary statistics for a harness run."""
    total_artifacts: int = 0
    by_action_type: Dict[str, int] = Field(default_factory=dict)
    by_verdict: Dict[str, int] = Field(default_factory=dict)
    total_duration_ms: int = 0
    total_tokens: int = 0
    gates_passed: int = 0
    gates_failed: int = 0


class HarnessRunManifest(HarnessRunManifestBase):
    """Complete harness run manifest with server-assigned fields and summary."""
    run_id: str = Field(default_factory=lambda: f"hrm-{uuid.uuid4().hex[:12]}")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    artifacts: List[str] = Field(default_factory=list, description="List of artifact IDs")
    summary: HarnessRunSummary = Field(default_factory=HarnessRunSummary)


class HarnessRunManifestWithArtifacts(HarnessRunManifest):
    """Manifest with full artifact details for API responses."""
    artifact_details: List[HarnessAuditArtifact] = Field(default_factory=list)
