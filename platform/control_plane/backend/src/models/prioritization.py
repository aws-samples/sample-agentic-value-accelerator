"""Use case prioritization data models — based on the AWS Enterprise AI
Scoring & Prioritization Model v1.0 (xlsx)."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field
import uuid


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AIType(str, Enum):
    TRADITIONAL_ML = "Traditional ML"
    GENERATIVE_AI = "Generative AI"
    AGENTIC_AI = "Agentic AI"


class Complexity(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class AutomationScope(str, Enum):
    AUGMENTATION = "Augmentation"
    COPILOT = "Co-pilot"
    FULL_AUTONOMY = "Full Autonomy"


class IntegrationDepth(str, Enum):
    SINGLE_BATCH = "Single-system batch"
    API_REALTIME = "API-connected real-time"
    MULTI_SYSTEM = "Multi-system orchestration"


class UseCaseStatus(str, Enum):
    CONCEPT = "Concept"
    ACTIVE = "Active"
    PILOT = "Pilot"
    PRODUCTION = "Production"
    PAUSED = "Paused"
    ARCHIVED = "Archived"


class GoNoGo(str, Enum):
    GO = "GO"
    CONDITIONAL_GO = "CONDITIONAL GO"
    NO_GO = "NO GO"


# ---------------------------------------------------------------------------
# Scoring schema
# ---------------------------------------------------------------------------
# Sub-criterion weights (within-dimension) — match the xlsx exactly.
# Dimension weights (top-level) are defaults; users can override per scoring.

DIMENSION_WEIGHTS_DEFAULT: Dict[str, float] = {
    "business_value": 0.30,
    "technical_feasibility": 0.20,
    "risk_governance": 0.15,
    "org_readiness": 0.15,
    "strategic_alignment": 0.10,
    "cost_efficiency": 0.10,
}

SUB_WEIGHTS: Dict[str, Dict[str, float]] = {
    "business_value": {
        "revenue_impact": 0.25,
        "cost_savings": 0.25,
        "productivity_gains": 0.20,
        "customer_experience": 0.15,
        "scalability_potential": 0.15,
    },
    "technical_feasibility": {
        "data_readiness": 0.25,
        "technical_complexity": 0.20,
        "integration_requirements": 0.20,
        "time_to_value": 0.20,
        "talent_availability": 0.15,
    },
    "risk_governance": {
        "regulatory_compliance": 0.25,
        "data_privacy_security": 0.20,
        "ethical_bias_risk": 0.20,
        "model_reliability": 0.20,
        "autonomous_decision_risk": 0.15,
    },
    "org_readiness": {
        "data_infrastructure": 0.25,
        "process_maturity": 0.20,
        "change_management": 0.20,
        "executive_sponsorship": 0.20,
        "cross_functional_collab": 0.15,
    },
    "strategic_alignment": {
        "mission_criticality": 0.35,
        "competitive_advantage": 0.35,
        "innovation_potential": 0.30,
    },
    "cost_efficiency": {
        "implementation_cost": 0.35,
        "ongoing_operational_cost": 0.35,
        "roi_timeline": 0.30,
    },
}


# A single 1-5 score per sub-criterion. Annotated int keeps Pydantic v2 happy.
Score = Annotated[int, Field(ge=1, le=5)]


class BusinessValueScores(BaseModel):
    revenue_impact: Score = 3
    cost_savings: Score = 3
    productivity_gains: Score = 3
    customer_experience: Score = 3
    scalability_potential: Score = 3


class TechnicalFeasibilityScores(BaseModel):
    data_readiness: Score = 3
    technical_complexity: Score = 3
    integration_requirements: Score = 3
    time_to_value: Score = 3
    talent_availability: Score = 3


class RiskGovernanceScores(BaseModel):
    regulatory_compliance: Score = 3
    data_privacy_security: Score = 3
    ethical_bias_risk: Score = 3
    model_reliability: Score = 3
    autonomous_decision_risk: Score = 3


class OrgReadinessScores(BaseModel):
    data_infrastructure: Score = 3
    process_maturity: Score = 3
    change_management: Score = 3
    executive_sponsorship: Score = 3
    cross_functional_collab: Score = 3


class StrategicAlignmentScores(BaseModel):
    mission_criticality: Score = 3
    competitive_advantage: Score = 3
    innovation_potential: Score = 3


class CostEfficiencyScores(BaseModel):
    implementation_cost: Score = 3
    ongoing_operational_cost: Score = 3
    roi_timeline: Score = 3


class Scores(BaseModel):
    """Container for all 25 sub-criterion scores."""
    business_value: BusinessValueScores = Field(default_factory=BusinessValueScores)
    technical_feasibility: TechnicalFeasibilityScores = Field(default_factory=TechnicalFeasibilityScores)
    risk_governance: RiskGovernanceScores = Field(default_factory=RiskGovernanceScores)
    org_readiness: OrgReadinessScores = Field(default_factory=OrgReadinessScores)
    strategic_alignment: StrategicAlignmentScores = Field(default_factory=StrategicAlignmentScores)
    cost_efficiency: CostEfficiencyScores = Field(default_factory=CostEfficiencyScores)


class DimensionWeights(BaseModel):
    """Top-level dimension weights. Must sum to 1.0 (validated server-side)."""
    business_value: float = 0.30
    technical_feasibility: float = 0.20
    risk_governance: float = 0.15
    org_readiness: float = 0.15
    strategic_alignment: float = 0.10
    cost_efficiency: float = 0.10


class ComputedScore(BaseModel):
    """Computed dimension subtotals + composite + verdict."""
    dimension_subtotals: Dict[str, float]
    composite: float
    risk_score: int  # 0-25 = max(likelihood) x max(impact); approximated from sub-scores
    readiness_score: float
    go_no_go: GoNoGo


# ---------------------------------------------------------------------------
# Use case shape
# ---------------------------------------------------------------------------

class UseCaseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    ai_type: AIType = AIType.GENERATIVE_AI
    business_domain: Optional[str] = Field(default="", max_length=80)
    complexity: Complexity = Complexity.MEDIUM
    automation_scope: AutomationScope = AutomationScope.COPILOT
    integration_depth: IntegrationDepth = IntegrationDepth.API_REALTIME
    business_owner: Optional[str] = Field(default="", max_length=120)
    technical_owner: Optional[str] = Field(default="", max_length=120)
    target_go_live: Optional[str] = Field(default="", max_length=40)
    status: UseCaseStatus = UseCaseStatus.CONCEPT


class UseCaseCreate(UseCaseBase):
    scores: Optional[Scores] = None
    weights: Optional[DimensionWeights] = None


class UseCaseUpdate(BaseModel):
    """Partial update — all fields optional."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    ai_type: Optional[AIType] = None
    business_domain: Optional[str] = Field(default=None, max_length=80)
    complexity: Optional[Complexity] = None
    automation_scope: Optional[AutomationScope] = None
    integration_depth: Optional[IntegrationDepth] = None
    business_owner: Optional[str] = Field(default=None, max_length=120)
    technical_owner: Optional[str] = Field(default=None, max_length=120)
    target_go_live: Optional[str] = Field(default=None, max_length=40)
    status: Optional[UseCaseStatus] = None
    scores: Optional[Scores] = None
    weights: Optional[DimensionWeights] = None


class UseCase(UseCaseBase):
    use_case_id: str = Field(default_factory=lambda: f"uc-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    scores: Scores = Field(default_factory=Scores)
    weights: DimensionWeights = Field(default_factory=DimensionWeights)
    computed: Optional[ComputedScore] = None


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

# Risk & readiness sub-criteria are inverted in the xlsx (higher score = less
# risk / more readiness). For the Risk Score gate (0-25), we convert back to a
# 1-5 likelihood/impact view: lower scores mean MORE risk, so risk = 5 - score
# for the highest-risk sub-criterion times its inverse.
#
# Concretely we approximate the spreadsheet's risk score as:
#    likelihood = 6 - min(risk_governance scores)
#    impact     = 6 - min(autonomous_decision_risk, model_reliability)
#    risk_score = likelihood * impact   (capped at 25)
#
# Readiness composite is the weighted average of the org_readiness dimension
# scores (still 1-5).

def compute_dimension_subtotal(
    dim_scores: Dict[str, int],
    sub_weights: Dict[str, float],
) -> float:
    return sum(dim_scores[k] * sub_weights[k] for k in sub_weights)


def compute(use_case: UseCase) -> ComputedScore:
    """Compute weighted subtotals, composite, risk and readiness, and Go/No-Go."""
    s = use_case.scores
    w = use_case.weights

    bv = compute_dimension_subtotal(s.business_value.model_dump(), SUB_WEIGHTS["business_value"])
    tf = compute_dimension_subtotal(s.technical_feasibility.model_dump(), SUB_WEIGHTS["technical_feasibility"])
    rg = compute_dimension_subtotal(s.risk_governance.model_dump(), SUB_WEIGHTS["risk_governance"])
    orr = compute_dimension_subtotal(s.org_readiness.model_dump(), SUB_WEIGHTS["org_readiness"])
    sa = compute_dimension_subtotal(s.strategic_alignment.model_dump(), SUB_WEIGHTS["strategic_alignment"])
    ce = compute_dimension_subtotal(s.cost_efficiency.model_dump(), SUB_WEIGHTS["cost_efficiency"])

    subtotals = {
        "business_value": round(bv, 4),
        "technical_feasibility": round(tf, 4),
        "risk_governance": round(rg, 4),
        "org_readiness": round(orr, 4),
        "strategic_alignment": round(sa, 4),
        "cost_efficiency": round(ce, 4),
    }

    composite = (
        bv * w.business_value
        + tf * w.technical_feasibility
        + rg * w.risk_governance
        + orr * w.org_readiness
        + sa * w.strategic_alignment
        + ce * w.cost_efficiency
    )
    composite = round(composite, 4)

    rg_scores = s.risk_governance.model_dump()
    likelihood = 6 - min(rg_scores.values())
    impact = 6 - min(rg_scores["autonomous_decision_risk"], rg_scores["model_reliability"])
    risk_score = max(1, min(25, likelihood * impact))

    readiness_score = round(orr, 4)

    # Verdict matches the xlsx Go/No-Go thresholds (Scoring Criteria & Weights):
    #   GO            composite >= 3.5  AND  risk <= 15  AND  readiness >= 3.0
    #   NO GO         composite <  2.5  OR   risk >  20  OR   readiness <  2.0
    #   CONDITIONAL   everything in between
    if composite >= 3.5 and risk_score <= 15 and readiness_score >= 3.0:
        verdict = GoNoGo.GO
    elif composite < 2.5 and risk_score > 20 and readiness_score < 2.0:
        verdict = GoNoGo.NO_GO
    else:
        verdict = GoNoGo.CONDITIONAL_GO

    return ComputedScore(
        dimension_subtotals=subtotals,
        composite=composite,
        risk_score=int(risk_score),
        readiness_score=readiness_score,
        go_no_go=verdict,
    )
