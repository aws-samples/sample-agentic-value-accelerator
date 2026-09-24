"""Pydantic models for Govern Compliance Agent."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ViolationSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ViolationCategory(str, Enum):
    POLICY = "policy"  # Agent policy violations
    SECURITY = "security"  # AWS security findings
    DRIFT = "drift"  # Model/config drift
    COMPLIANCE = "compliance"  # Regulatory compliance
    PRIVACY = "privacy"  # Privacy/DP violations


class RemediationStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class ActionType(str, Enum):
    ASSIGN_GUARDRAIL = "assign_guardrail"
    UPDATE_GUARDRAIL = "update_guardrail"
    CREATE_POLICY = "create_enforcement_policy"
    UPDATE_AUTONOMY = "update_autonomy_tier"
    PAUSE_AGENT = "pause_agent_runtime"
    RESUME_AGENT = "resume_agent_runtime"
    TRIGGER_REVALIDATION = "trigger_revalidation"
    UPDATE_A2A_TRUST = "update_a2a_trust"
    CREATE_FINDING = "create_security_finding"


class ApprovalRequirement(str, Enum):
    AUTO = "auto"  # Can execute automatically within autonomy bounds
    HUMAN = "human"  # Requires human approval
    ESCALATE = "escalate"  # Must escalate to security/compliance team


# ─────────────────────────── Audit Request/Response ───────────────────────────

class ComplianceAuditRequest(BaseModel):
    """Request to run a compliance audit."""
    scope: str = Field(default="all", description="Audit scope: all, agents, security, drift, privacy")
    agent_ids: Optional[list[str]] = Field(default=None, description="Specific agent IDs to audit (None = all)")
    include_remediation: bool = Field(default=True, description="Include remediation recommendations")
    auto_remediate: bool = Field(default=False, description="Auto-remediate within autonomy bounds")
    dry_run: bool = Field(default=False, description="Dry run - no actual changes")


class Violation(BaseModel):
    """A detected compliance violation."""
    id: str = Field(description="Unique violation ID")
    category: ViolationCategory
    severity: ViolationSeverity
    title: str
    description: str
    resource_type: str = Field(description="Type of resource: agent, guardrail, model, etc.")
    resource_id: str
    resource_name: Optional[str] = None
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    evidence: Optional[dict] = Field(default=None, description="Supporting evidence")
    compliance_frameworks: list[str] = Field(default_factory=list, description="Affected frameworks: EU_AI_ACT, SR_26_2, etc.")


class RemediationAction(BaseModel):
    """A proposed remediation action."""
    id: str
    violation_id: str
    action_type: ActionType
    title: str
    description: str
    target_resource: str
    parameters: dict = Field(default_factory=dict)
    approval_required: ApprovalRequirement
    risk_level: ViolationSeverity
    estimated_impact: str = Field(description="Expected impact of this action")
    rollback_possible: bool = True
    status: RemediationStatus = RemediationStatus.PROPOSED


class RemediationPlan(BaseModel):
    """A plan containing multiple remediation actions."""
    id: str
    violations: list[Violation]
    actions: list[RemediationAction]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = Field(default="govern_compliance_agent")
    approval_status: RemediationStatus = RemediationStatus.PROPOSED
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class ComplianceAuditResponse(BaseModel):
    """Response from a compliance audit."""
    audit_id: str
    scope: str
    started_at: datetime
    completed_at: Optional[datetime] = None

    # Summary counts
    agents_scanned: int = 0
    violations_found: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0

    # Detailed results
    violations: list[Violation] = Field(default_factory=list)
    remediation_plan: Optional[RemediationPlan] = None

    # Actions taken (if auto_remediate=True)
    actions_taken: list[RemediationAction] = Field(default_factory=list)
    actions_pending_approval: list[RemediationAction] = Field(default_factory=list)

    # Executive summary
    summary: str = ""
    recommendations: list[str] = Field(default_factory=list)

    # Data source info
    live: bool = True
    sources: list[str] = Field(default_factory=list)
    note: Optional[str] = None


# ─────────────────────────── Agent-specific checks ───────────────────────────

class AgentComplianceStatus(BaseModel):
    """Compliance status for a single agent."""
    agent_id: str
    agent_name: str
    platform: str  # bedrock-agent or agentcore-runtime
    status: str  # READY, etc.

    # Policy compliance
    has_guardrail: bool = False
    guardrail_id: Optional[str] = None
    guardrail_version: Optional[str] = None
    autonomy_tier: Optional[int] = None

    # Model governance
    model_id: Optional[str] = None
    model_attested: bool = False
    last_revalidation: Optional[datetime] = None
    revalidation_due: Optional[datetime] = None

    # Privacy
    dp_enabled: Optional[bool] = None
    privacy_risk_level: Optional[str] = None

    # Violations for this agent
    violations: list[Violation] = Field(default_factory=list)
    compliant: bool = True


# ─────────────────────────── Structured output schemas ───────────────────────────

class PolicyAuditResult(BaseModel):
    """Structured output from PolicyAuditor agent."""
    agents_checked: int
    violations: list[dict] = Field(default_factory=list)
    missing_guardrails: list[str] = Field(default_factory=list)
    autonomy_concerns: list[str] = Field(default_factory=list)
    summary: str


class SecurityScanResult(BaseModel):
    """Structured output from SecurityScanner agent."""
    guardduty_findings: int = 0
    securityhub_findings: int = 0
    config_violations: int = 0
    critical_issues: list[dict] = Field(default_factory=list)
    ai_specific_threats: list[dict] = Field(default_factory=list)
    summary: str


class DriftDetectionResult(BaseModel):
    """Structured output from DriftDetector agent."""
    models_checked: int = 0
    models_with_drift: int = 0
    revalidation_overdue: list[str] = Field(default_factory=list)
    privacy_concerns: list[dict] = Field(default_factory=list)
    eval_degradation: list[dict] = Field(default_factory=list)
    summary: str


class RemediationPlanResult(BaseModel):
    """Structured output from RemediationPlanner agent."""
    total_violations: int
    actions_proposed: int
    auto_remediable: int
    requires_approval: int
    actions: list[dict] = Field(default_factory=list)
    execution_order: list[str] = Field(default_factory=list)
    summary: str
