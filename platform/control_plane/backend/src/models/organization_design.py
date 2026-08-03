"""Organization Design — interactive AI-integrated org design.

Source: AWS_Agentic_Enterprise_OrgDesign.xlsx (18 sheets).

Flow: Strategy -> Value Chain -> Operating Model Canvas -> 8-dim Maturity
Scoring (industry-weighted) -> Gate Criteria -> Agent Configuration by
Function -> Recommendations -> Transition Economics -> Workforce Plan ->
Phased Roadmap -> Blended Org Chart.

Unlike the Operating Model module (which picks a *pattern*), Organization
Design assembles a target-state org where AI agents live at every layer as
subordinates (supervised team members) or peers (autonomous partners).
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field
import math
import uuid


# ---------------------------------------------------------------------------
# Schema constants (mirrors Reference_Tables + Input_* sheets)
# ---------------------------------------------------------------------------

INDUSTRIES: List[str] = [
    "Financial Services", "Healthcare", "Manufacturing", "Technology",
    "Retail", "Other",
]

STRUCTURE_TYPES: List[str] = [
    "Traditional Hierarchy", "Functional", "Matrix", "Flat/Agile", "Network",
]

SCENARIO_PATHWAYS: List[str] = ["Conservative", "Moderate", "Aggressive"]

PHASES: List[str] = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]

BUSINESS_MODELS: List[str] = [
    "Product-led", "Platform", "Services", "Marketplace", "Hybrid",
]

COMPETITIVE_POSITIONING: List[str] = [
    "Cost Leadership", "Differentiation", "Niche Focus", "Innovation",
]

VALUE_DRIVERS: List[str] = [
    "Scale", "Technology & Innovation", "Customer Intimacy",
    "Operational Excellence",
]

MARKET_DYNAMICS: List[str] = ["Stable", "Moderate", "Fast-moving", "Disruptive"]

REVENUE_MODELS: List[str] = [
    "Subscription", "Transaction", "Licensing", "Advertising", "Hybrid",
]

COORDINATION_MECHANISMS: List[str] = [
    "Mutual Adjustment", "Direct Supervision", "Standardization of Work",
    "Standardization of Outputs", "Standardization of Skills",
]

OPERATING_ARCHETYPES: List[str] = [
    "Coordination", "Unification", "Diversification", "Replication",
]

SOURCE_STRATEGIES: List[str] = ["Build", "Buy", "Borrow", "Bot"]

# 8 maturity dimensions
DIMENSIONS: List[str] = [
    "ai_maturity", "skills_talent", "resources_investment",
    "coordination_complexity", "industry_context",
    "culture_change_readiness", "governance_accountability",
    "leadership_capability",
]

DIMENSION_LABELS: Dict[str, str] = {
    "ai_maturity":              "AI Maturity",
    "skills_talent":            "Skills & Talent",
    "resources_investment":     "Resources & Investment",
    "coordination_complexity":  "Coordination Complexity",
    "industry_context":         "Industry Context",
    "culture_change_readiness": "Culture & Change Readiness",
    "governance_accountability":"Governance & Accountability",
    "leadership_capability":    "Leadership Capability",
}

# Industry-specific weight profiles (verbatim from Input_Scoring rows 24-31)
INDUSTRY_WEIGHTS: Dict[str, Dict[str, float]] = {
    "Financial Services": {
        "ai_maturity": 0.15, "skills_talent": 0.15, "resources_investment": 0.10,
        "coordination_complexity": 0.05, "industry_context": 0.10,
        "culture_change_readiness": 0.10, "governance_accountability": 0.25,
        "leadership_capability": 0.10,
    },
    "Healthcare": {
        "ai_maturity": 0.15, "skills_talent": 0.15, "resources_investment": 0.10,
        "coordination_complexity": 0.05, "industry_context": 0.10,
        "culture_change_readiness": 0.10, "governance_accountability": 0.25,
        "leadership_capability": 0.10,
    },
    "Manufacturing": {
        "ai_maturity": 0.20, "skills_talent": 0.15, "resources_investment": 0.15,
        "coordination_complexity": 0.05, "industry_context": 0.05,
        "culture_change_readiness": 0.15, "governance_accountability": 0.15,
        "leadership_capability": 0.10,
    },
    "Technology": {
        "ai_maturity": 0.25, "skills_talent": 0.20, "resources_investment": 0.10,
        "coordination_complexity": 0.05, "industry_context": 0.00,
        "culture_change_readiness": 0.20, "governance_accountability": 0.10,
        "leadership_capability": 0.10,
    },
    "Retail": {
        "ai_maturity": 0.20, "skills_talent": 0.15, "resources_investment": 0.10,
        "coordination_complexity": 0.05, "industry_context": 0.10,
        "culture_change_readiness": 0.15, "governance_accountability": 0.15,
        "leadership_capability": 0.10,
    },
    "Other": {
        "ai_maturity": 0.20, "skills_talent": 0.15, "resources_investment": 0.15,
        "coordination_complexity": 0.10, "industry_context": 0.10,
        "culture_change_readiness": 0.10, "governance_accountability": 0.10,
        "leadership_capability": 0.10,
    },
}

# Industry gate criteria (Reference_Tables section 4)
INDUSTRY_GATES: Dict[str, Dict[str, float]] = {
    "Financial Services": {"governance": 3.5, "ai_maturity": 2.0, "culture": 2.0, "leadership": 2.5},
    "Healthcare":         {"governance": 3.5, "ai_maturity": 2.0, "culture": 2.5, "leadership": 2.5},
    "Manufacturing":      {"governance": 2.5, "ai_maturity": 3.0, "culture": 2.0, "leadership": 2.0},
    "Technology":         {"governance": 2.0, "ai_maturity": 3.0, "culture": 3.0, "leadership": 2.5},
    "Retail":             {"governance": 2.5, "ai_maturity": 2.5, "culture": 2.5, "leadership": 2.0},
    "Other":              {"governance": 2.5, "ai_maturity": 2.5, "culture": 2.5, "leadership": 2.0},
}

# Structure span-of-control ranges (Logic_Recommendations)
STRUCTURE_SPANS: Dict[str, Dict[str, int]] = {
    "Traditional Hierarchy": {"min": 4, "max": 7},
    "Functional":            {"min": 5, "max": 8},
    "Matrix":                {"min": 3, "max": 5},
    "Flat/Agile":            {"min": 10, "max": 20},
    "Network":               {"min": 15, "max": 25},
}

# Structure recommendations by (archetype x phase)
STRUCTURE_MATRIX: Dict[str, Dict[str, str]] = {
    "Stagnating":  {"Phase 1": "Traditional + AI Pilots",   "Phase 2": "Functional + Hybrid Teams",     "Phase 3": "Matrix + AI Automation",       "Phase 4": "Flat/Agile + AI Integration"},
    "Scaling":     {"Phase 1": "Functional + AI Teams",     "Phase 2": "Matrix + Agent Orchestration",  "Phase 3": "Flat/Agile + Semi-Autonomous", "Phase 4": "Network + AI-Native Ops"},
    "Future-built":{"Phase 1": "Flat/Agile + Full AI Teams","Phase 2": "Network + Agent Networks",      "Phase 3": "AI-Integrated + Autonomous",   "Phase 4": "AI-Native + Minimal Hierarchy"},
}

PHASE_GOVERNANCE: Dict[str, str] = {
    "Phase 1": "Observe & Advise",
    "Phase 2": "Act with Approval",
    "Phase 3": "Act Autonomously (bounded)",
    "Phase 4": "Full Autonomy (monitored)",
}

PHASE_RATIO: Dict[str, str] = {
    "Phase 1": "1:1-3",
    "Phase 2": "1:5-20",
    "Phase 3": "1:20-100",
    "Phase 4": "1:100+",
}

PHASE_GAIN: Dict[str, str] = {
    "Phase 1": "10-20% (Proven: 14-55.8%)",
    "Phase 2": "25-50% (Emerging: 50-90%)",
    "Phase 3": "60%+ cost reduction",
    "Phase 4": "3x-10x (Theoretical)",
}

# 10 functions: 5 Shared Services + 5 Specialized (Input_AgentConfig rows 25-34)
FUNCTION_CATALOG: List[Dict] = [
    {"key": "hr_people",       "label": "HR & People Operations",      "type": "Shared Services", "default_headcount": 80,  "default_automated": 20},
    {"key": "finance",         "label": "Finance & Accounting",         "type": "Shared Services", "default_headcount": 100, "default_automated": 30},
    {"key": "it_infra",        "label": "IT & Infrastructure",          "type": "Shared Services", "default_headcount": 120, "default_automated": 25},
    {"key": "procurement",     "label": "Procurement & Supply Chain",   "type": "Shared Services", "default_headcount": 60,  "default_automated": 15},
    {"key": "customer_service","label": "Customer Service",             "type": "Shared Services", "default_headcount": 150, "default_automated": 30},
    {"key": "rd_innovation",   "label": "R&D / Innovation",             "type": "Specialized",     "default_headcount": 120, "default_automated": 20},
    {"key": "product_eng",     "label": "Product & Engineering",        "type": "Specialized",     "default_headcount": 150, "default_automated": 10},
    {"key": "sales_bd",        "label": "Sales & Business Dev",         "type": "Specialized",     "default_headcount": 100, "default_automated": 15},
    {"key": "legal_compliance","label": "Legal & Compliance",           "type": "Specialized",     "default_headcount": 40,  "default_automated": 5},
    {"key": "marketing_comms", "label": "Marketing & Communications",   "type": "Specialized",     "default_headcount": 80,  "default_automated": 35},
]

# Cost benchmarks (Logic_TransitionEcon)
COST_BENCHMARKS: Dict[str, float] = {
    "weekly_salary": 2500.0,
    "severance_c_suite_weeks": 40.0,
    "severance_vp_weeks": 20.0,
    "severance_ic_weeks": 8.0,
    "reskilling_per_employee": 24800.0,
    "hiring_non_exec": 5475.0,
    "hiring_executive": 35879.0,
    "reskilling_savings_vs_hiring": 49000.0,
    "productivity_dip_pct": 0.15,
    "productivity_dip_months": 18.0,
    "engagement_decline_pct": 0.21,
}

# Build/Buy/Borrow/Bot default mix
WORKFORCE_MIX_DEFAULT: Dict[str, float] = {
    "build": 0.40, "buy": 0.20, "borrow": 0.15, "bot": 0.25,
}

# Scenario multipliers for transition economics (Output_ScenarioCompare)
SCENARIO_MULTIPLIERS: Dict[str, Dict[str, float]] = {
    "Conservative": {"severance": 0.30, "reskilling": 0.50},
    "Moderate":     {"severance": 1.00, "reskilling": 1.00},
    "Aggressive":   {"severance": 1.80, "reskilling": 1.50},
}

# Scenario gate minima (Output_ScenarioCompare section 3)
SCENARIO_GATES: Dict[str, Dict[str, float]] = {
    "Conservative": {"composite": 2.0, "governance": 2.0, "ai_maturity": 2.0, "culture": 2.0},
    "Moderate":     {"composite": 2.5, "governance": 2.5, "ai_maturity": 2.5, "culture": 2.5},
    "Aggressive":   {"composite": 3.0, "governance": 3.5, "ai_maturity": 3.0, "culture": 3.0},
}

Score15 = Annotated[int, Field(ge=0, le=5)]
Weight = Annotated[float, Field(ge=0.0, le=1.0)]


# ---------------------------------------------------------------------------
# Input Pydantic shapes
# ---------------------------------------------------------------------------

class OrganizationDesignStatus(str, Enum):
    DRAFT = "Draft"
    IN_PROGRESS = "In Progress"
    COMPLETE = "Complete"
    ARCHIVED = "Archived"


class OrgProfile(BaseModel):
    company_name: str = "Acme Corp"
    company_size: int = Field(default=1000, ge=1)
    industry: str = "Technology"
    structure_type: str = "Functional"
    scenario_pathway: str = "Moderate"
    current_phase: str = "Phase 1"
    target_phase: str = "Phase 2"
    annual_revenue_m: float = 500.0
    ai_budget_pct: float = 0.02
    num_departments: int = 8
    geographic_presence: str = "National"


class ValueChainActivity(BaseModel):
    key: str
    label: str
    kind: str  # primary | support
    strategic_importance: Score15 = 3
    ai_automation_potential: Score15 = 3
    current_capability_gap: str = "Medium"  # Low | Medium | High


DEFAULT_VALUE_CHAIN: List[ValueChainActivity] = [
    ValueChainActivity(key="inbound_logistics",  label="Inbound Logistics",             kind="primary", strategic_importance=3, ai_automation_potential=4, current_capability_gap="Low"),
    ValueChainActivity(key="operations",         label="Operations / Production",       kind="primary", strategic_importance=4, ai_automation_potential=3, current_capability_gap="Medium"),
    ValueChainActivity(key="outbound_logistics", label="Outbound Logistics",            kind="primary", strategic_importance=3, ai_automation_potential=4, current_capability_gap="Low"),
    ValueChainActivity(key="marketing_sales",    label="Marketing & Sales",             kind="primary", strategic_importance=5, ai_automation_potential=4, current_capability_gap="High"),
    ValueChainActivity(key="service_support",    label="Service & Support",             kind="primary", strategic_importance=4, ai_automation_potential=5, current_capability_gap="Medium"),
    ValueChainActivity(key="technology_dev",     label="Technology Development",        kind="support", strategic_importance=5, ai_automation_potential=4, current_capability_gap="Medium"),
    ValueChainActivity(key="hr_mgmt",            label="Human Resource Management",     kind="support", strategic_importance=3, ai_automation_potential=3, current_capability_gap="Medium"),
    ValueChainActivity(key="procurement",        label="Procurement",                   kind="support", strategic_importance=2, ai_automation_potential=4, current_capability_gap="Low"),
    ValueChainActivity(key="firm_infra",         label="Firm Infrastructure (Finance, Legal)", kind="support", strategic_importance=3, ai_automation_potential=3, current_capability_gap="Low"),
]


class CriticalCapability(BaseModel):
    key: str
    label: str
    priority: Score15 = 3
    current_maturity: Score15 = 3
    source_strategy: str = "Build"


DEFAULT_CAPABILITIES: List[CriticalCapability] = [
    CriticalCapability(key="ai_ml_eng",        label="AI/ML Engineering",         priority=5, current_maturity=3, source_strategy="Build"),
    CriticalCapability(key="data_analytics",   label="Data Analytics & Science",  priority=5, current_maturity=3, source_strategy="Build"),
    CriticalCapability(key="process_auto",     label="Process Automation",        priority=4, current_maturity=2, source_strategy="Bot"),
    CriticalCapability(key="change_mgmt",      label="Change Management",         priority=4, current_maturity=3, source_strategy="Build"),
    CriticalCapability(key="ai_governance",    label="AI Governance & Ethics",    priority=4, current_maturity=2, source_strategy="Buy"),
    CriticalCapability(key="cx_design",        label="Customer Experience Design",priority=3, current_maturity=4, source_strategy="Borrow"),
]


class StrategyInputs(BaseModel):
    business_model: str = "Product-led"
    competitive_positioning: str = "Differentiation"
    primary_value_driver: str = "Technology & Innovation"
    market_dynamics: str = "Fast-moving"
    revenue_model: str = "Subscription"
    value_chain: List[ValueChainActivity] = Field(default_factory=lambda: [v.model_copy() for v in DEFAULT_VALUE_CHAIN])
    capabilities: List[CriticalCapability] = Field(default_factory=lambda: [c.model_copy() for c in DEFAULT_CAPABILITIES])


class RapidDecision(BaseModel):
    key: str
    label: str
    recommend: str = ""
    agree: str = ""
    perform: str = ""
    input_role: str = ""
    decide: str = ""


DEFAULT_RAPID: List[RapidDecision] = [
    RapidDecision(key="ai_tool_selection", label="AI Tool Selection",       recommend="AI Team",          agree="CISO/CTO",         perform="IT Ops",       input_role="Business Units",     decide="CTO"),
    RapidDecision(key="agent_deployment",  label="AI Agent Deployment",     recommend="AI Ops",           agree="Legal/Compliance", perform="AI Engineers", input_role="HR/Affected Teams",  decide="CAIO"),
    RapidDecision(key="restructuring",     label="Workforce Restructuring", recommend="HR/Strategy",      agree="CEO/Board",        perform="HR Ops",       input_role="Managers",           decide="CEO"),
    RapidDecision(key="budget_allocation", label="Budget Allocation (AI)",  recommend="CFO/Strategy",     agree="Board",            perform="Finance",      input_role="Department Heads",   decide="CEO"),
    RapidDecision(key="data_governance",   label="Data Governance",         recommend="Data Team",        agree="Legal/Privacy",    perform="Data Eng",     input_role="All Departments",    decide="CDO"),
    RapidDecision(key="process_automation",label="Process Automation",      recommend="Process Owners",   agree="Risk/Compliance",  perform="AI Team",      input_role="Workers",            decide="COO"),
]


class OperatingModelInputs(BaseModel):
    num_product_lines: int = 5
    num_geographies: int = 10
    num_customer_segments: int = 3
    coordination_mechanism: str = "Standardization of Outputs"
    operating_archetype: str = "Coordination"
    rapid_decisions: List[RapidDecision] = Field(default_factory=lambda: [d.model_copy() for d in DEFAULT_RAPID])


class MaturityScores(BaseModel):
    ai_maturity: Score15 = 4
    skills_talent: Score15 = 4
    resources_investment: Score15 = 4
    coordination_complexity: Score15 = 4
    industry_context: Score15 = 4
    culture_change_readiness: Score15 = 4
    governance_accountability: Score15 = 4
    leadership_capability: Score15 = 4


class FunctionConfig(BaseModel):
    key: str
    label: str
    type: str  # Shared Services | Specialized
    headcount: int = 100
    automated_processes: int = 20


DEFAULT_FUNCTION_CONFIG: List[FunctionConfig] = [
    FunctionConfig(key=f["key"], label=f["label"], type=f["type"],
                   headcount=f["default_headcount"],
                   automated_processes=f["default_automated"])
    for f in FUNCTION_CATALOG
]


class AgentConfig(BaseModel):
    total_automated_processes: int = 200
    target_ratio_label: str = "3:1"
    span_of_control: int = 8
    pct_subordinate: float = Field(default=0.60, ge=0.0, le=1.0)
    pct_peer: float = Field(default=0.40, ge=0.0, le=1.0)
    functions: List[FunctionConfig] = Field(default_factory=lambda: [f.model_copy() for f in DEFAULT_FUNCTION_CONFIG])


# ---------------------------------------------------------------------------
# Computed output shapes
# ---------------------------------------------------------------------------

class DimensionResult(BaseModel):
    label: str
    score: int
    weight: float
    weighted: float
    gap: float


class GateStatus(BaseModel):
    key: str
    label: str
    score: float
    required: float
    passed: bool
    detail: str


class FunctionAgentBreakdown(BaseModel):
    key: str
    label: str
    type: str
    human_staff: int
    total_agents: int
    agents_subordinate: int
    agents_peer: int
    supervisors: int
    teams: int
    dominant_role: str
    total_positions: int
    ratio_label: str


class HierarchyLayer(BaseModel):
    layer: int
    level_name: str
    human_roles: str
    agent_functions: str
    headcount: int
    ratio: str
    phase_active: str


class TransitionEconomics(BaseModel):
    severance_cost: float
    reskilling_investment: float
    hiring_cost: float
    productivity_dip_cost: float
    total_transition_cost: float
    expected_annual_savings: float
    payback_years: Optional[float]
    three_year_roi: float


class WorkforcePhase(BaseModel):
    phase: str
    total_headcount: int
    build: int
    buy: int
    borrow: int
    bot: int
    total_cost: float


class WorkforcePlan(BaseModel):
    phases: List[WorkforcePhase]
    total_investment: float
    reskill_vs_hire_savings: float


class ScenarioSummary(BaseModel):
    scenario: str
    timeline: str
    productivity: str
    investment_pct: str
    headcount_reduction: str
    severance_cost: float
    reskilling: float
    risk_level: str
    success_probability: str
    payback: str
    ratio: str
    layers_eliminated: str


class InvestmentAllocation(BaseModel):
    total_budget_m: float
    technology_m: float
    data_infra_m: float
    people_process_m: float


class ComputedOrganizationDesign(BaseModel):
    dimensions: Dict[str, DimensionResult]
    weights: Dict[str, float]
    composite: float
    simple_average: float
    archetype: str                  # Stagnating | Scaling | Future-built
    complexity_class: str           # Simple | Moderate | Complex
    coordination_nodes: int
    expanded_archetype: str
    scale_class: str
    strategic_ai_readiness: float
    gates: List[GateStatus]
    all_gates_passed: bool
    scenario_alignment: str
    recommended_structure: str
    current_layers: int
    target_layers: int
    layers_eliminated: int
    span_current_min: int
    span_current_max: int
    span_ai_adjusted: int
    governance_level: str
    ratio_target: str
    expected_productivity_gain: str
    investment: InvestmentAllocation
    functions: List[FunctionAgentBreakdown]
    hierarchy: List[HierarchyLayer]
    transition: TransitionEconomics
    workforce: WorkforcePlan
    scenarios: List[ScenarioSummary]
    total_ai_agents: int
    total_agents_subordinate: int
    total_agents_peer: int
    total_human_supervisors: int
    total_teams: int
    pct_workforce_ai: float
    effective_ratio: str


# ---------------------------------------------------------------------------
# Top-level OrganizationDesign shape
# ---------------------------------------------------------------------------

class OrganizationDesignBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    organization: Optional[str] = Field(default="", max_length=120)
    designer: Optional[str] = Field(default="", max_length=120)
    status: OrganizationDesignStatus = OrganizationDesignStatus.DRAFT


class OrganizationDesignCreate(OrganizationDesignBase):
    profile: Optional[OrgProfile] = None
    strategy: Optional[StrategyInputs] = None
    operating_model: Optional[OperatingModelInputs] = None
    scores: Optional[MaturityScores] = None
    weights: Optional[Dict[str, float]] = None
    agent_config: Optional[AgentConfig] = None


class OrganizationDesignUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    organization: Optional[str] = Field(default=None, max_length=120)
    designer: Optional[str] = Field(default=None, max_length=120)
    status: Optional[OrganizationDesignStatus] = None
    profile: Optional[OrgProfile] = None
    strategy: Optional[StrategyInputs] = None
    operating_model: Optional[OperatingModelInputs] = None
    scores: Optional[MaturityScores] = None
    weights: Optional[Dict[str, float]] = None
    agent_config: Optional[AgentConfig] = None


class OrganizationDesign(OrganizationDesignBase):
    organization_design_id: str = Field(default_factory=lambda: f"od-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    profile: OrgProfile = Field(default_factory=OrgProfile)
    strategy: StrategyInputs = Field(default_factory=StrategyInputs)
    operating_model: OperatingModelInputs = Field(default_factory=OperatingModelInputs)
    scores: MaturityScores = Field(default_factory=MaturityScores)
    weights: Optional[Dict[str, float]] = None
    agent_config: AgentConfig = Field(default_factory=AgentConfig)
    computed: Optional[ComputedOrganizationDesign] = None


# ---------------------------------------------------------------------------
# Compute logic (mirrors Logic_* sheets)
# ---------------------------------------------------------------------------

def industry_weights(industry: str) -> Dict[str, float]:
    return INDUSTRY_WEIGHTS.get(industry, INDUSTRY_WEIGHTS["Other"]).copy()


def _classify_complexity(nodes: int) -> str:
    if nodes > 100: return "Complex"
    if nodes >= 20: return "Moderate"
    return "Simple"


def _classify_scale(headcount: int) -> str:
    if headcount >= 10000: return "Enterprise"
    if headcount >= 1000:  return "Large"
    if headcount >= 200:   return "Mid-Market"
    return "Small"


def _archetype(composite: float) -> str:
    if composite >= 4.0: return "Future-built"
    if composite >= 2.5: return "Scaling"
    return "Stagnating"


def _expanded_archetype(archetype: str, complexity_class: str) -> str:
    suffix = "Complex" if complexity_class in ("Complex", "Moderate") else "Simple"
    return f"{archetype}-{suffix}"


def _strategic_readiness(strategy: StrategyInputs) -> float:
    primary = [v for v in strategy.value_chain if v.kind == "primary"]
    if not primary:
        return 2.5
    avg_importance = sum(v.strategic_importance for v in primary) / len(primary)
    caps = strategy.capabilities
    if caps:
        avg_gap = sum(max(0, c.priority - c.current_maturity) for c in caps) / len(caps)
    else:
        avg_gap = 0
    val = (avg_importance / 5 + (5 - avg_gap) / 5) / 2 * 5
    return round(val, 4)


def _recommended_ratios(composite: float) -> Dict[str, float]:
    """From Input_AgentConfig 'Recommended Ratios by AI Maturity Level'."""
    if composite >= 4.0:  return {"subordinate": 0.35, "peer": 0.65}
    if composite >= 2.5:  return {"subordinate": 0.60, "peer": 0.40}
    return {"subordinate": 0.80, "peer": 0.20}


def _compute_function_row(
    fn: FunctionConfig, cfg: AgentConfig, composite: float,
) -> FunctionAgentBreakdown:
    total_agents = fn.automated_processes * 2
    if fn.type == "Shared Services":
        sub_pct = min(1.0, cfg.pct_subordinate + 0.15)
    else:
        sub_pct = max(0.0, cfg.pct_subordinate - 0.15)
    agents_sub = round(total_agents * sub_pct)
    agents_peer = max(0, total_agents - agents_sub)
    span = max(1, cfg.span_of_control)
    supervisors = math.ceil((fn.headcount + agents_sub) / span) if (fn.headcount + agents_sub) else 0
    if fn.type == "Shared Services":
        dominant = "Primarily Subordinate" if agents_sub > agents_peer else "Mixed"
    else:
        dominant = "Primarily Peer" if agents_peer > agents_sub else "Mixed"
    denom = agents_sub + agents_peer
    ratio_label = f"{fn.headcount / denom:.1f}:1" if denom else "No AI"
    return FunctionAgentBreakdown(
        key=fn.key, label=fn.label, type=fn.type,
        human_staff=fn.headcount, total_agents=total_agents,
        agents_subordinate=agents_sub, agents_peer=agents_peer,
        supervisors=supervisors, teams=supervisors,
        dominant_role=dominant,
        total_positions=fn.headcount + total_agents,
        ratio_label=ratio_label,
    )


def _hierarchy(company_size: int, target_phase: str, span_ai: int) -> List[HierarchyLayer]:
    def mgr_layer_count() -> int:
        try:
            return max(5, round(company_size / max(1, span_ai)))
        except Exception:
            return 5
    l1 = max(1, round(company_size / 5000) + 3)
    l2 = max(2, round(company_size / 500))
    l3 = max(3, round(company_size / 150))
    l4 = mgr_layer_count()
    l5 = round(company_size * 0.15)
    used = l1 + l2 + l3 + l4 + l5
    l6 = max(0, company_size - used)
    ai_only_active = target_phase in ("Phase 3", "Phase 4")
    return [
        HierarchyLayer(layer=1, level_name="C-Suite",         human_roles="CAIO, CEO, CTO",                                    agent_functions="Strategic AI Advisory",         headcount=l1, ratio="1:1-3",   phase_active="Phase 1+"),
        HierarchyLayer(layer=2, level_name="VP/Senior Dir",   human_roles="AI Agent Orchestrator, VP AI Strategy",             agent_functions="Multi-agent Orchestration",     headcount=l2, ratio="1:50-200",phase_active="Phase 2+"),
        HierarchyLayer(layer=3, level_name="Director",        human_roles="Director AI Ops, Agentic Process Owner",             agent_functions="Process Autonomous Agents",    headcount=l3, ratio="1:100+", phase_active="Phase 2-3+"),
        HierarchyLayer(layer=4, level_name="Manager",         human_roles="Hybrid Manager, Agent Ops Manager",                  agent_functions="Task-execution Agents",        headcount=l4, ratio="1:20-50", phase_active="Phase 1-2+"),
        HierarchyLayer(layer=5, level_name="Senior IC",       human_roles="AI Agent Builder, AI Architect, Prompt Engineer",    agent_functions="Specialized Task Agents",      headcount=l5, ratio="1:3-10",  phase_active="Phase 1+"),
        HierarchyLayer(layer=6, level_name="IC",              human_roles="AI Champion, Knowledge Worker + Copilot",            agent_functions="Copilot Agents",               headcount=l6, ratio="1:1-3",   phase_active="Phase 1+"),
        HierarchyLayer(layer=7, level_name="AI-Only Layer",   human_roles="N/A (Human Oversight)",                              agent_functions="Autonomous Execution Agents",  headcount=0,  ratio="0:many",  phase_active="Phase 3-4" if ai_only_active else "Not Yet Active"),
    ]


def _transition(profile: OrgProfile, functions: List[FunctionAgentBreakdown]) -> TransitionEconomics:
    # Simplified enterprise redesign impact: agents replace ~30% of routine work.
    b = COST_BENCHMARKS
    current = profile.company_size
    target = max(1, round(current * 0.85))  # 15% headcount delta as anchor
    delta = target - current
    absdelta = abs(min(delta, 0))
    severance = absdelta * b["severance_ic_weeks"] * b["weekly_salary"]
    reskill = current * 0.5 * b["reskilling_per_employee"] * 0.1  # 10% of workforce reskilled per phase
    hiring = current * 0.05 * b["hiring_non_exec"]
    dip = profile.annual_revenue_m * 1_000_000 * b["productivity_dip_pct"] * (b["productivity_dip_months"] / 12)
    total = severance + reskill + hiring + dip
    annual_savings = absdelta * b["weekly_salary"] * 52
    payback = round(total / annual_savings, 2) if annual_savings else None
    roi = round((annual_savings * 3 - total) / total, 4) if total else 0.0
    return TransitionEconomics(
        severance_cost=round(severance, 2),
        reskilling_investment=round(reskill, 2),
        hiring_cost=round(hiring, 2),
        productivity_dip_cost=round(dip, 2),
        total_transition_cost=round(total, 2),
        expected_annual_savings=round(annual_savings, 2),
        payback_years=payback,
        three_year_roi=roi,
    )


def _workforce(profile: OrgProfile) -> WorkforcePlan:
    b = COST_BENCHMARKS
    mix = WORKFORCE_MIX_DEFAULT
    phase_scales = [1.0, 0.9, 0.75, 0.6]
    phases: List[WorkforcePhase] = []
    for idx, ph in enumerate(PHASES):
        total = round(profile.company_size * phase_scales[idx])
        build = round(total * mix["build"])
        buy = round(total * mix["buy"])
        borrow = round(total * mix["borrow"])
        bot = round(total * mix["bot"])
        cost = (
            build * b["reskilling_per_employee"]
            + buy * b["hiring_non_exec"]
            + borrow * 130000 * 0.5
            + bot * 50000
        )
        phases.append(WorkforcePhase(
            phase=ph, total_headcount=total, build=build, buy=buy,
            borrow=borrow, bot=bot, total_cost=round(cost, 2),
        ))
    total_investment = round(sum(p.total_cost for p in phases), 2)
    reskill_savings = round(sum(p.build for p in phases) * b["reskilling_savings_vs_hiring"], 2)
    return WorkforcePlan(
        phases=phases, total_investment=total_investment,
        reskill_vs_hire_savings=reskill_savings,
    )


def _scenarios(profile: OrgProfile, transition: TransitionEconomics) -> List[ScenarioSummary]:
    base = transition.severance_cost + transition.reskilling_investment
    def out(name: str, mult: Dict[str, float], timeline: str, prod: str,
            invest: str, hc: str, risk: str, sp: str, payback: str, ratio: str, layers: str) -> ScenarioSummary:
        sev = round(base * mult["severance"], 2)
        rk = round(transition.reskilling_investment * mult["reskilling"], 2)
        return ScenarioSummary(
            scenario=name, timeline=timeline, productivity=prod,
            investment_pct=invest, headcount_reduction=hc,
            severance_cost=sev, reskilling=rk, risk_level=risk,
            success_probability=sp, payback=payback, ratio=ratio,
            layers_eliminated=layers,
        )
    return [
        out("Conservative", SCENARIO_MULTIPLIERS["Conservative"], "7-10 years",  "10-25%",     "1-2%",  "5-10%",  "Low",    "70-80%", "3-5 years", "1:3-5",   "1-2"),
        out("Moderate",     SCENARIO_MULTIPLIERS["Moderate"],     "5-7 years",   "25-60%",     "2-4%",  "15-25%", "Medium", "50-60%", "2-3 years", "1:20-50", "2-4"),
        out("Aggressive",   SCENARIO_MULTIPLIERS["Aggressive"],   "3-5 years",   "60%+ to 3x-10x","4-8%",  "30-50%", "High",   "24-30%", "1-2 years", "1:100+",  "4-6"),
    ]


def compute(model) -> ComputedOrganizationDesign:
    profile = model.profile
    industry = profile.industry
    weights = model.weights or industry_weights(industry)
    scores = model.scores.model_dump()

    # --- scoring ---
    dims: Dict[str, DimensionResult] = {}
    composite_num = 0.0
    composite_den = 0.0
    for d in DIMENSIONS:
        s = int(scores.get(d, 0) or 0)
        w = float(weights.get(d, 0) or 0)
        weighted = round(s * w, 4)
        gap = round(5 - s, 4)
        dims[d] = DimensionResult(label=DIMENSION_LABELS[d], score=s, weight=w, weighted=weighted, gap=gap)
        if s:
            composite_num += s * w
            composite_den += w
    composite = round(composite_num / composite_den, 4) if composite_den else 0.0
    simple_avg = round(sum(int(scores.get(d, 0) or 0) for d in DIMENSIONS) / len(DIMENSIONS), 4)
    archetype = _archetype(composite)

    # --- complexity + scale ---
    om = model.operating_model
    nodes = max(1, om.num_product_lines * om.num_geographies * om.num_customer_segments)
    complexity_class = _classify_complexity(nodes)
    scale_class = _classify_scale(profile.company_size)
    expanded = _expanded_archetype(archetype, complexity_class)

    # --- gates ---
    gates_cfg = INDUSTRY_GATES.get(industry, INDUSTRY_GATES["Other"])
    gate_defs = [
        ("governance", "Governance Gate",       scores["governance_accountability"], gates_cfg["governance"]),
        ("ai_maturity","AI Maturity Gate",      scores["ai_maturity"],               gates_cfg["ai_maturity"]),
        ("culture",    "Culture Gate",          scores["culture_change_readiness"],  gates_cfg["culture"]),
        ("leadership", "Leadership Gate",       scores["leadership_capability"],     gates_cfg["leadership"]),
    ]
    gates: List[GateStatus] = []
    for key, label, s, req in gate_defs:
        passed = float(s) >= float(req)
        detail = f"Score {s:.1f} ≥ {req:.1f}" if passed else f"Score {s:.1f} < {req:.1f}"
        gates.append(GateStatus(key=key, label=label, score=float(s), required=float(req), passed=passed, detail=detail))
    all_passed = all(g.passed for g in gates)

    # --- scenario alignment ---
    if composite >= 3.5:   recommended_scenario = "Aggressive"
    elif composite >= 2.5: recommended_scenario = "Moderate"
    else:                  recommended_scenario = "Conservative"
    scenario_alignment = "ALIGNED" if profile.scenario_pathway == recommended_scenario else f"MISALIGNED — recommended {recommended_scenario}"

    # --- span & layers ---
    span_cfg = STRUCTURE_SPANS.get(profile.structure_type, STRUCTURE_SPANS["Functional"])
    span_ai = max(2, round(span_cfg["min"] * 1.5))
    try:
        current_layers = max(2, math.ceil(math.log(profile.company_size) / math.log((span_cfg["min"] + span_cfg["max"]) / 2)))
    except Exception:
        current_layers = 5
    try:
        target_layers = max(2, math.ceil(math.log(profile.company_size) / math.log(span_ai)))
    except Exception:
        target_layers = 3
    layers_eliminated = max(0, current_layers - target_layers)

    # --- recommendations by (archetype x target phase) ---
    recommended_structure = STRUCTURE_MATRIX.get(archetype, {}).get(profile.target_phase, "—")
    governance_level = PHASE_GOVERNANCE.get(profile.target_phase, "—")
    ratio_target = PHASE_RATIO.get(profile.target_phase, "—")
    expected_gain = PHASE_GAIN.get(profile.target_phase, "—")

    # --- investment (BCG 10/20/70) ---
    total_budget_m = round(profile.annual_revenue_m * profile.ai_budget_pct, 4)
    investment = InvestmentAllocation(
        total_budget_m=total_budget_m,
        technology_m=round(total_budget_m * 0.10, 4),
        data_infra_m=round(total_budget_m * 0.20, 4),
        people_process_m=round(total_budget_m * 0.70, 4),
    )

    # --- per-function agent org ---
    functions: List[FunctionAgentBreakdown] = [
        _compute_function_row(fn, model.agent_config, composite)
        for fn in model.agent_config.functions
    ]
    total_agents = sum(f.total_agents for f in functions)
    total_sub = sum(f.agents_subordinate for f in functions)
    total_peer = sum(f.agents_peer for f in functions)
    total_sup = sum(f.supervisors for f in functions)
    total_teams = sum(f.teams for f in functions)
    total_humans = sum(f.human_staff for f in functions)
    total_workforce = total_humans + total_sub + total_peer
    pct_ai = round((total_sub + total_peer) / total_workforce, 4) if total_workforce else 0.0
    effective_ratio = f"{total_humans / (total_sub + total_peer):.1f}:1" if (total_sub + total_peer) else "N/A"

    # --- hierarchy, transition, workforce, scenarios ---
    hierarchy = _hierarchy(profile.company_size, profile.target_phase, span_ai)
    transition = _transition(profile, functions)
    workforce = _workforce(profile)
    scenarios = _scenarios(profile, transition)

    return ComputedOrganizationDesign(
        dimensions=dims, weights=weights,
        composite=composite, simple_average=simple_avg,
        archetype=archetype, complexity_class=complexity_class,
        coordination_nodes=nodes, expanded_archetype=expanded,
        scale_class=scale_class,
        strategic_ai_readiness=_strategic_readiness(model.strategy),
        gates=gates, all_gates_passed=all_passed,
        scenario_alignment=scenario_alignment,
        recommended_structure=recommended_structure,
        current_layers=current_layers, target_layers=target_layers,
        layers_eliminated=layers_eliminated,
        span_current_min=span_cfg["min"], span_current_max=span_cfg["max"],
        span_ai_adjusted=span_ai,
        governance_level=governance_level, ratio_target=ratio_target,
        expected_productivity_gain=expected_gain,
        investment=investment,
        functions=functions, hierarchy=hierarchy,
        transition=transition, workforce=workforce, scenarios=scenarios,
        total_ai_agents=total_agents,
        total_agents_subordinate=total_sub,
        total_agents_peer=total_peer,
        total_human_supervisors=total_sup,
        total_teams=total_teams,
        pct_workforce_ai=pct_ai,
        effective_ratio=effective_ratio,
    )
