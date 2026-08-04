"""Pydantic models for unified control evaluation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class EvaluationStatus(str, Enum):
    """Status of a control evaluation."""
    PASS = "pass"
    FAIL = "fail"
    PARTIAL = "partial"
    UNKNOWN = "unknown"
    ERROR = "error"


class AutoDetectSource(str, Enum):
    """Supported auto-detection sources."""
    CLOUDTRAIL = "cloudtrail"
    CLOUDWATCH = "cloudwatch"
    BEDROCK_GUARDRAILS = "bedrock-guardrails"
    BEDROCK_AGENTS = "bedrock-agents"
    CONFIG = "config"
    CONFIG_RULES = "config-rules"
    SAGEMAKER = "sagemaker"
    IAM = "iam"
    GLUE = "glue"


class ControlEvaluationRequest(BaseModel):
    """A single control to evaluate."""
    id: str = Field(..., description="Control ID (e.g., CRI-GV-1.1.1, ATLAS-REC-1)")
    autoDetectSource: str = Field(..., description="Source to use for auto-detection")


class EvaluateControlsRequest(BaseModel):
    """Request body for batch control evaluation."""
    controls: List[ControlEvaluationRequest] = Field(..., description="Controls to evaluate")


class ControlEvaluation(BaseModel):
    """Result of evaluating a single control."""
    controlId: str = Field(..., description="Control ID that was evaluated")
    status: EvaluationStatus = Field(..., description="Evaluation result status")
    evidence: str = Field(..., description="Human-readable evidence supporting the status")
    lastEvaluated: datetime = Field(..., description="Timestamp of this evaluation")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in the evaluation (0-1)")
    source: Optional[str] = Field(None, description="Source that provided the evaluation")
    details: Optional[Dict] = Field(None, description="Additional structured details from the source")


class SourceStatus(BaseModel):
    """Status of a data source used in evaluation."""
    live: bool = Field(..., description="Whether the source returned live data")
    latency_ms: int = Field(..., description="Latency to fetch from source in milliseconds")
    note: Optional[str] = Field(None, description="Additional notes about the source status")
    error: Optional[str] = Field(None, description="Error message if source failed")


class EvaluateControlsResponse(BaseModel):
    """Response from batch control evaluation."""
    live: bool = Field(..., description="Whether all evaluations used live data")
    evaluations: List[ControlEvaluation] = Field(..., description="Evaluation results per control")
    sources: Dict[str, SourceStatus] = Field(..., description="Status of each data source used")
    evaluated_at: datetime = Field(default_factory=datetime.utcnow, description="When the evaluation was performed")
