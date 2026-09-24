"""
Govern Compliance Agent Models (Strands Implementation).

Pydantic models for compliance audit requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AuditScope(str, Enum):
    ALL = "all"
    AGENTS = "agents"
    SECURITY = "security"
    DRIFT = "drift"
    PRIVACY = "privacy"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ViolationType(str, Enum):
    MISSING_GUARDRAIL = "missing_guardrail"
    POLICY_VIOLATION = "policy_violation"
    SECURITY_FINDING = "security_finding"
    REVALIDATION_OVERDUE = "revalidation_overdue"
    DRIFT_DETECTED = "drift_detected"
    AUTONOMY_MISMATCH = "autonomy_mismatch"
    PRIVACY_RISK = "privacy_risk"


class ComplianceAuditRequest(BaseModel):
    scope: AuditScope = Field(default=AuditScope.ALL, description="Scope of the compliance audit")
    include_remediation: bool = Field(default=True, description="Whether to include remediation recommendations")
    auto_remediate: bool = Field(default=False, description="Auto-execute safe remediations (use with caution)")
    dry_run: bool = Field(default=True, description="Preview changes without executing")
    target_agents: list[str] | None = Field(default=None, description="Specific agent IDs to audit (None = all)")


class Violation(BaseModel):
    violation_id: str = Field(..., description="Unique violation identifier")
    violation_type: ViolationType = Field(..., description="Type of violation")
    severity: Severity = Field(..., description="Violation severity")
    resource_type: str = Field(..., description="Type of resource (agent, model, guardrail)")
    resource_id: str = Field(..., description="ID of the affected resource")
    description: str = Field(..., description="Human-readable description")
    evidence: dict = Field(default_factory=dict, description="Supporting evidence")
    detected_at: datetime = Field(default_factory=datetime.utcnow, description="Detection timestamp")


class RemediationAction(BaseModel):
    action_id: str = Field(..., description="Unique action identifier")
    action_type: str = Field(..., description="Type of remediation action")
    target_resource: str = Field(..., description="Resource to remediate")
    description: str = Field(..., description="What this action will do")
    requires_approval: bool = Field(default=True, description="Whether human approval is required")
    auto_approved: bool = Field(default=False, description="Whether this was auto-approved")
    executed: bool = Field(default=False, description="Whether the action was executed")
    result: str | None = Field(default=None, description="Execution result")


class ComplianceAuditResponse(BaseModel):
    audit_id: str = Field(..., description="Unique audit identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Audit timestamp")
    scope: AuditScope = Field(..., description="Audit scope")
    violations: list[Violation] = Field(default_factory=list, description="Detected violations")
    remediations: list[RemediationAction] = Field(default_factory=list, description="Remediation actions")
    summary: str = Field(..., description="Executive summary of the audit")
    agents_scanned: int = Field(default=0, description="Number of agents scanned")
    models_scanned: int = Field(default=0, description="Number of models scanned")
    findings_by_severity: dict[str, int] = Field(default_factory=dict, description="Count by severity")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "AuditScope",
    "Severity",
    "ViolationType",
    "ComplianceAuditRequest",
    "Violation",
    "RemediationAction",
    "ComplianceAuditResponse",
]
