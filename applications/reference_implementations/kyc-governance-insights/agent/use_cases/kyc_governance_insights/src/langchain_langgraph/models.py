"""
KYC Controlled Quality Output — Use Case Models.

Pydantic models for the governance-controlled KYC assessment. Extends the base
KYC assessment (credit + compliance) with an explicit governance layer:
deterministic financial checks, sanctions/PEP screening, a three-layer policy
cascade (ORG / APP / REQUEST), and an LLM-as-Judge quality score. The final
decision (APPROVE / ESCALATE / DECLINE / BLOCK) is produced by the governance
pipeline, not by the agents alone.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    """Type of risk assessment to perform."""
    FULL = "full"
    CREDIT_ONLY = "credit_only"
    COMPLIANCE_ONLY = "compliance_only"


class RiskLevel(str, Enum):
    """Risk level classification."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ComplianceStatusEnum(str, Enum):
    """Compliance status classification."""
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"
    REVIEW_REQUIRED = "review_required"


class Decision(str, Enum):
    """Final governance decision for the onboarding."""
    APPROVE = "APPROVE"
    ESCALATE = "ESCALATE"
    DECLINE = "DECLINE"
    BLOCK = "BLOCK"


class PolicyLayer(str, Enum):
    """The three governance policy layers, most-restrictive-wins."""
    ORG = "ORG"
    APP = "APP"
    REQ = "REQ"


class PolicyAction(str, Enum):
    """Action a single policy can return."""
    ALLOW = "ALLOW"
    ESCALATE = "ESCALATE"
    BLOCK = "BLOCK"


class AssessmentRequest(BaseModel):
    """Request model for KYC governance assessment."""
    customer_id: str = Field(..., description="Unique customer identifier")
    assessment_type: AssessmentType = Field(
        default=AssessmentType.FULL,
        description="Type of assessment to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the assessment"
    )


class RiskScore(BaseModel):
    """Credit risk score details."""
    score: int = Field(..., ge=0, le=100, description="Risk score from 0-100")
    level: str | None = Field(default=None, description="Risk level classification")
    factors: list[str] = Field(default_factory=list, description="Contributing factors")
    recommendations: list[str] = Field(default_factory=list, description="Risk mitigation recommendations")


class ComplianceStatus(BaseModel):
    """Compliance check results."""
    status: str | None = Field(default=None, description="Overall compliance status")
    checks_passed: list[str] = Field(default_factory=list, description="Compliance checks that passed")
    checks_failed: list[str] = Field(default_factory=list, description="Compliance checks that failed")
    regulatory_notes: list[str] = Field(default_factory=list, description="Regulatory notes and observations")


# --- Governance layer models ---------------------------------------------

class SanctionsResult(BaseModel):
    """Sanctions / PEP screening outcome (fuzzy match against watch lists)."""
    matched: bool = Field(default=False, description="Whether a match crossed the threshold")
    score: float = Field(default=0.0, ge=0.0, le=1.0, description="Best fuzzy match score 0-1")
    matched_name: str | None = Field(default=None, description="Name of the matched list entry")
    list_name: str | None = Field(default=None, description="Watch list the match came from (e.g. OFAC SDN)")
    entry_id: str | None = Field(default=None, description="Identifier of the matched entry")
    threshold: float = Field(default=0.70, description="Match threshold applied")
    pep_level: int | None = Field(default=None, description="PEP level 0-3 if a PEP match was found")


class DeterministicCheck(BaseModel):
    """One deterministic financial check: agent-claimed vs independently recomputed."""
    metric: str = Field(..., description="Metric name (e.g. de_ratio)")
    computed: float = Field(..., description="Independently recomputed value")
    agent_stated: float | None = Field(default=None, description="Value the agent claimed")
    result: str = Field(..., description="PASS or FAIL")


class DeterministicChecks(BaseModel):
    """Aggregate deterministic-check result."""
    overall: str = Field(default="PASS", description="PASS or FAIL across all checks")
    checks: list[DeterministicCheck] = Field(default_factory=list, description="Individual metric checks")


class PolicyEvaluation(BaseModel):
    """Result of a single policy rule in the cascade."""
    layer: PolicyLayer = Field(..., description="ORG / APP / REQ")
    rule: str = Field(..., description="Policy rule id (e.g. ORG-001)")
    result: PolicyAction = Field(..., description="ALLOW / ESCALATE / BLOCK")
    reason: str | None = Field(default=None, description="Why the rule fired")


class JudgeScores(BaseModel):
    """LLM-as-Judge quality scores (0-1 per dimension)."""
    correctness: float = Field(default=0.0, ge=0.0, le=1.0)
    faithfulness: float = Field(default=0.0, ge=0.0, le=1.0)
    completeness: float = Field(default=0.0, ge=0.0, le=1.0)
    helpfulness: float = Field(default=0.0, ge=0.0, le=1.0)
    tone: float = Field(default=0.0, ge=0.0, le=1.0)
    model: str | None = Field(default=None, description="Judge model used")


class AssessmentResponse(BaseModel):
    """Response model for the governance-controlled KYC assessment."""
    customer_id: str = Field(..., description="Customer identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Assessment timestamp")

    # Core agent findings
    credit_risk: RiskScore | None = Field(default=None, description="Credit risk assessment results")
    compliance: ComplianceStatus | None = Field(default=None, description="Compliance check results")

    # Governance decision
    decision: Decision = Field(default=Decision.ESCALATE, description="Final governance decision")
    risk_score: int = Field(default=50, ge=0, le=100, description="Composite risk score 0-100")
    risk_level: str = Field(default="medium", description="Composite risk level")

    # Governance controls
    sanctions: SanctionsResult | None = Field(default=None, description="Sanctions / PEP screening result")
    deterministic_checks: DeterministicChecks | None = Field(default=None, description="Deterministic financial validation")
    policy_cascade: list[PolicyEvaluation] = Field(default_factory=list, description="Policy cascade evaluations")
    judge_scores: JudgeScores | None = Field(default=None, description="LLM-as-Judge quality scores")

    # Block / escalation detail
    blocked: bool = Field(default=False, description="True if a governance gate blocked the assessment")
    block_reason: str | None = Field(default=None, description="Why the assessment was blocked")
    incident_id: str | None = Field(default=None, description="Incident id when blocked/escalated")
    policy_layer: PolicyLayer | None = Field(default=None, description="Layer of the deciding policy")

    summary: str = Field(..., description="Executive summary of the assessment")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents and governance services")


__all__ = [
    "AssessmentType",
    "RiskLevel",
    "ComplianceStatusEnum",
    "Decision",
    "PolicyLayer",
    "PolicyAction",
    "AssessmentRequest",
    "RiskScore",
    "ComplianceStatus",
    "SanctionsResult",
    "DeterministicCheck",
    "DeterministicChecks",
    "PolicyEvaluation",
    "JudgeScores",
    "AssessmentResponse",
]
