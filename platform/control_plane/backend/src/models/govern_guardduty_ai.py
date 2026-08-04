"""Govern GuardDuty AI — AI-related threat detection findings from GuardDuty.

Source of truth: guardduty:ListFindings + GetFindings filtered for AI/ML services.
Surfaces AI-specific threat findings: prompt injection, model abuse, data exfiltration,
unauthorized access to Bedrock/SageMaker resources.

Honest live/source/note flags, graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


AICategory = Literal[
    "prompt_injection",
    "data_exfiltration",
    "model_abuse",
    "credential_access",
    "unauthorized_access",
    "anomalous_behavior",
]

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class GuardDutyAIFinding(BaseModel):
    """One GuardDuty AI-related finding."""

    id: str
    type: str = Field(..., description="GuardDuty finding type, e.g. UnauthorizedAccess:IAMUser/AnomalousBehavior")
    title: str
    description: str
    severity: Severity
    resource_type: str = Field(..., description="AWS resource type, e.g. AWS::Bedrock::Model")
    resource_id: str
    region: str
    service: str = Field(..., description="AWS service, e.g. bedrock, sagemaker")
    created_at: str
    updated_at: str
    ai_category: AICategory
    confidence: int = Field(..., ge=0, le=100, description="Confidence score 0-100")
    account_id: Optional[str] = None
    investigate_url: Optional[str] = None


class SeverityCount(BaseModel):
    severity: Severity
    count: int


class CategoryCount(BaseModel):
    category: str
    count: int


class GuardDutyAIFindingsResponse(BaseModel):
    """GuardDuty AI findings response with severity and category breakdowns."""

    findings: List[GuardDutyAIFinding] = Field(default_factory=list)
    total: int = 0
    by_severity: List[SeverityCount] = Field(default_factory=list)
    by_category: List[CategoryCount] = Field(default_factory=list)
    live: bool
    source: str
    note: Optional[str] = None
