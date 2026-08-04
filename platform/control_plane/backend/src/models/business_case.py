"""Business Case data models — based on AWS Enterprise AI Business Case
Evaluation Model (3-year DCF, 8-category risk scorecard, J-curve ramp)."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field
import uuid


# ---------------------------------------------------------------------------
# Enums (xlsx Project Inputs)
# ---------------------------------------------------------------------------

class IndustrySubSector(str, Enum):
    BANKING = "Retail Banking"
    INSURANCE = "Insurance"
    CAPITAL_MARKETS = "Capital Markets"
    OTHER = "Other"


class AITechnologyType(str, Enum):
    TRADITIONAL_ML = "Traditional ML"
    GENERATIVE_AI = "Generative AI"
    AGENTIC_AI = "Agentic AI"


class ProjectSize(str, Enum):
    SMALL = "Small"
    MEDIUM = "Medium"
    LARGE = "Large"


class BusinessCaseStatus(str, Enum):
    DRAFT = "Draft"
    REVIEW = "Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    ARCHIVED = "Archived"


class NpvDecision(str, Enum):
    POSITIVE = "POSITIVE NPV - Proceed"
    NEGATIVE = "NEGATIVE NPV - Reject"
    BREAKEVEN = "BREAKEVEN - Review"


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

class ProjectInputs(BaseModel):
    sponsor: str = ""
    business_unit: str = ""
    evaluation_date: Optional[str] = None  # ISO date string
    industry: IndustrySubSector = IndustrySubSector.OTHER
    ai_technology_type: AITechnologyType = AITechnologyType.GENERATIVE_AI
    project_size: ProjectSize = ProjectSize.MEDIUM
    # Financial parameters
    wacc_base: float = 0.0498              # Banking 4.98% / Insurance 6.34% / CapMkts 6.08% per xlsx
    technology_risk_premium: float = 0.04  # 3-6% above WACC
    hurdle_rate: float = 0.12
    tax_rate: float = 0.21
    inflation_rate: float = 0.025
    # Benefit ramp (J-curve)
    ramp_y1: float = 0.25
    ramp_y2: float = 0.65
    ramp_y3: float = 0.90
    # Compliance adder applied to subtotal of costs
    compliance_adder_pct: float = 0.15

    @property
    def discount_rate(self) -> float:
        return round(self.wacc_base + self.technology_risk_premium, 6)


class CostLineItem(BaseModel):
    """3-year cost line. Year 0 = initial; Years 1-3 = recurring."""
    label: str
    year_0: float = 0
    year_1: float = 0
    year_2: float = 0
    year_3: float = 0


class BenefitLineItem(BaseModel):
    """Per-year benefit values (already ramped). Mirrors xlsx Benefit Model rows."""
    label: str
    year_1: float = 0
    year_2: float = 0
    year_3: float = 0


class CostModel(BaseModel):
    initial: List[CostLineItem] = Field(default_factory=list)
    operating: List[CostLineItem] = Field(default_factory=list)
    staffing: List[CostLineItem] = Field(default_factory=list)


class BenefitModel(BaseModel):
    tangible: List[BenefitLineItem] = Field(default_factory=list)
    intangible: List[BenefitLineItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Risk scorecard — 8 categories with weights from xlsx
# ---------------------------------------------------------------------------

RiskScore = Annotated[int, Field(ge=1, le=5)]

RISK_WEIGHTS_DEFAULT: Dict[str, float] = {
    "technical": 0.15,
    "data": 0.20,
    "model": 0.20,
    "regulatory": 0.15,
    "organizational": 0.10,
    "vendor_lockin": 0.08,
    "change_management": 0.07,
    "cybersecurity": 0.05,
}

RISK_LABELS: Dict[str, str] = {
    "technical":         "Technical Risk",
    "data":              "Data Risk",
    "model":             "Model Risk",
    "regulatory":        "Regulatory & Compliance",
    "organizational":    "Organizational Readiness",
    "vendor_lockin":     "Vendor & Lock-in Risk",
    "change_management": "Change Management",
    "cybersecurity":     "Cybersecurity & Adversarial",
}


class RiskScorecard(BaseModel):
    technical: RiskScore = 3
    data: RiskScore = 3
    model: RiskScore = 3
    regulatory: RiskScore = 3
    organizational: RiskScore = 3
    vendor_lockin: RiskScore = 3
    change_management: RiskScore = 3
    cybersecurity: RiskScore = 3


class RiskWeights(BaseModel):
    technical: float = 0.15
    data: float = 0.20
    model: float = 0.20
    regulatory: float = 0.15
    organizational: float = 0.10
    vendor_lockin: float = 0.08
    change_management: float = 0.07
    cybersecurity: float = 0.05


# ---------------------------------------------------------------------------
# Computed financials
# ---------------------------------------------------------------------------

class CashFlowYear(BaseModel):
    year: int
    benefits: float
    costs: float
    pre_tax: float
    tax_impact: float
    after_tax: float
    cumulative: float
    discount_factor: float
    discounted: float


class ComputedFinancials(BaseModel):
    discount_rate: float
    cash_flow: List[CashFlowYear]
    total_benefits: float
    total_costs: float
    npv: float
    irr: Optional[float]   # None if no sign change in cash flow
    roi: float             # net / total cost
    payback_years: Optional[float]
    benefit_cost_ratio: float
    irr_passes_hurdle: bool
    npv_decision: NpvDecision


class ComputedRisk(BaseModel):
    composite: float          # 1-5
    level: str                # LOW / MODERATE / HIGH
    by_category: Dict[str, float]


class Computed(BaseModel):
    financials: ComputedFinancials
    risk: ComputedRisk


# ---------------------------------------------------------------------------
# Business case shape
# ---------------------------------------------------------------------------

class BusinessCaseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    status: BusinessCaseStatus = BusinessCaseStatus.DRAFT


class BusinessCaseCreate(BusinessCaseBase):
    inputs: Optional[ProjectInputs] = None
    costs: Optional[CostModel] = None
    benefits: Optional[BenefitModel] = None
    risk_scores: Optional[RiskScorecard] = None
    risk_weights: Optional[RiskWeights] = None


class BusinessCaseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[BusinessCaseStatus] = None
    inputs: Optional[ProjectInputs] = None
    costs: Optional[CostModel] = None
    benefits: Optional[BenefitModel] = None
    risk_scores: Optional[RiskScorecard] = None
    risk_weights: Optional[RiskWeights] = None


def _default_costs() -> CostModel:
    """Defaults seeded from the xlsx Cost Model rows."""
    return CostModel(
        initial=[
            CostLineItem(label="Infrastructure & Cloud Setup",     year_0=250),
            CostLineItem(label="AI Platform / Software Licenses",  year_0=200),
            CostLineItem(label="Data Engineering & Preparation",   year_0=350),
            CostLineItem(label="Model Development & Training",     year_0=400),
            CostLineItem(label="System Integration & Testing",     year_0=200),
            CostLineItem(label="Change Management & Training",     year_0=150),
            CostLineItem(label="Regulatory Compliance Setup",      year_0=100),
        ],
        operating=[
            CostLineItem(label="Inference / API / Token Costs",      year_1=100, year_2=150, year_3=200),
            CostLineItem(label="Cloud Compute & GPU",                year_1=80,  year_2=100, year_3=120),
            CostLineItem(label="Data Storage & Management",          year_1=40,  year_2=50,  year_3=55),
            CostLineItem(label="Model Retraining & Updates",         year_1=60,  year_2=80,  year_3=90),
            CostLineItem(label="MLOps & Monitoring",                 year_1=50,  year_2=60,  year_3=70),
            CostLineItem(label="Governance & Compliance (Ongoing)", year_1=80,  year_2=90,  year_3=100),
            CostLineItem(label="Cybersecurity & Risk Controls",      year_1=30,  year_2=35,  year_3=40),
            CostLineItem(label="Vendor Licenses & Subscriptions",    year_1=100, year_2=110, year_3=120),
        ],
        staffing=[
            CostLineItem(label="Data Scientists",       year_1=250, year_2=300, year_3=400),
            CostLineItem(label="ML Engineers",          year_1=350, year_2=400, year_3=400),
            CostLineItem(label="Data Engineers",        year_1=250, year_2=280, year_3=280),
            CostLineItem(label="Project / Program Mgmt", year_1=180, year_2=180, year_3=150),
            CostLineItem(label="Domain Experts / SMEs", year_1=130, year_2=130, year_3=100),
            CostLineItem(label="Change Management",     year_1=120, year_2=100, year_3=80),
        ],
    )


def _default_benefits() -> BenefitModel:
    """Defaults seeded from xlsx Benefit Model rows (per-year, already ramped)."""
    return BenefitModel(
        tangible=[
            BenefitLineItem(label="Cost Savings — Process Automation",          year_1=350, year_2=600, year_3=720),
            BenefitLineItem(label="Cost Savings — FTE Redeployment",            year_1=250, year_2=375, year_3=450),
            BenefitLineItem(label="Cost Savings — Error/Rework Reduction",      year_1=100, year_2=150, year_3=180),
            BenefitLineItem(label="Revenue Uplift — Personalization/Cross-sell", year_1=300, year_2=450, year_3=540),
            BenefitLineItem(label="Revenue Uplift — New Products/Services",     year_1=150, year_2=225, year_3=270),
            BenefitLineItem(label="Risk Reduction — Fraud Loss Avoidance",      year_1=200, year_2=300, year_3=360),
            BenefitLineItem(label="Risk Reduction — Compliance Penalty",        year_1=75,  year_2=125, year_3=135),
            BenefitLineItem(label="Operational Speed — Time-to-Market",         year_1=100, year_2=150, year_3=180),
        ],
        intangible=[
            BenefitLineItem(label="Customer Experience (NPS/CSAT)",        year_1=150,  year_2=400, year_3=500),
            BenefitLineItem(label="Employee Productivity & Satisfaction",  year_1=125,  year_2=250, year_3=300),
            BenefitLineItem(label="Competitive Advantage / Market Position", year_1=150, year_2=500, year_3=800),
            BenefitLineItem(label="Innovation Capacity / Option Value",    year_1=67.5, year_2=200, year_3=450),
            BenefitLineItem(label="Brand & Reputation Enhancement",        year_1=50,   year_2=250, year_3=400),
            BenefitLineItem(label="Organizational Learning & Agility",     year_1=50,   year_2=75,  year_3=100),
        ],
    )


class BusinessCase(BusinessCaseBase):
    business_case_id: str = Field(default_factory=lambda: f"bc-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    inputs: ProjectInputs = Field(default_factory=ProjectInputs)
    costs: CostModel = Field(default_factory=_default_costs)
    benefits: BenefitModel = Field(default_factory=_default_benefits)
    risk_scores: RiskScorecard = Field(default_factory=RiskScorecard)
    risk_weights: RiskWeights = Field(default_factory=RiskWeights)
    computed: Optional[Computed] = None


# ---------------------------------------------------------------------------
# Compute helpers
# ---------------------------------------------------------------------------

def _sum_year(items: List[CostLineItem], y: int) -> float:
    return sum(getattr(item, f"year_{y}", 0) or 0 for item in items)


def _irr(cash_flows: List[float], guess: float = 0.1) -> Optional[float]:
    """Newton-Raphson IRR. Returns None if no convergence (e.g., all-positive flows)."""
    has_positive = any(c > 0 for c in cash_flows)
    has_negative = any(c < 0 for c in cash_flows)
    if not (has_positive and has_negative):
        return None
    rate = guess
    for _ in range(200):
        npv = sum(c / ((1 + rate) ** i) for i, c in enumerate(cash_flows))
        deriv = sum(-i * c / ((1 + rate) ** (i + 1)) for i, c in enumerate(cash_flows))
        if abs(deriv) < 1e-12:
            return None
        new_rate = rate - npv / deriv
        if abs(new_rate - rate) < 1e-7:
            return round(new_rate, 6)
        rate = new_rate
    return None


def _payback_years(cumulative: List[float]) -> Optional[float]:
    """Year-end convention (matches xlsx): payback = i + (-prev/curr_flow) where the
    cumulative crosses zero in year i. cumulative[0] is end-of-Year-0."""
    for i in range(1, len(cumulative)):
        if cumulative[i - 1] < 0 <= cumulative[i]:
            prev = cumulative[i - 1]
            curr = cumulative[i]
            year_flow = curr - prev
            if year_flow == 0:
                return float(i)
            return round(i + (-prev) / year_flow, 4)
    return None


def compute(bc: BusinessCase) -> Computed:
    inp = bc.inputs
    rate = inp.discount_rate

    # Costs by year (incl. compliance adder applied to subtotal of all categories)
    base_costs: List[float] = []
    for y in range(0, 4):
        sub = (_sum_year(bc.costs.initial, y) + _sum_year(bc.costs.operating, y) + _sum_year(bc.costs.staffing, y))
        base_costs.append(round(sub * (1 + inp.compliance_adder_pct), 4))

    # Benefits — sum per-year line items (already ramped per xlsx Benefit Model)
    def _sum_benefits(items: List[BenefitLineItem], y: int) -> float:
        if y == 0:
            return 0.0
        return sum(getattr(b, f"year_{y}", 0) or 0 for b in items)

    benefits = [
        round(_sum_benefits(bc.benefits.tangible, y) + _sum_benefits(bc.benefits.intangible, y), 4)
        for y in range(4)
    ]

    cash_flow: List[CashFlowYear] = []
    cumulative_after_tax = 0.0
    after_tax_flows: List[float] = []
    total_benefits = 0.0
    total_costs = 0.0

    for y in range(4):
        b = benefits[y]
        c = base_costs[y]
        pre_tax = round(b - c, 4)
        # Tax only applies on net positive income
        tax = round(max(0.0, pre_tax) * inp.tax_rate, 4)
        after_tax = round(pre_tax - tax, 4)
        cumulative_after_tax = round(cumulative_after_tax + after_tax, 4)
        df = round(1 / ((1 + rate) ** y), 6)
        disc = round(after_tax * df, 4)
        cash_flow.append(CashFlowYear(
            year=y, benefits=b, costs=c, pre_tax=pre_tax,
            tax_impact=tax, after_tax=after_tax, cumulative=cumulative_after_tax,
            discount_factor=df, discounted=disc,
        ))
        after_tax_flows.append(after_tax)
        total_benefits += b
        total_costs += c

    npv = round(sum(yr.discounted for yr in cash_flow), 4)
    irr = _irr(after_tax_flows)
    payback = _payback_years([yr.cumulative for yr in cash_flow])
    bc_ratio = round(total_benefits / total_costs, 4) if total_costs else 0.0
    roi = round((total_benefits - total_costs) / total_costs, 4) if total_costs else 0.0

    irr_passes = irr is not None and irr >= inp.hurdle_rate
    if npv > 0:
        decision = NpvDecision.POSITIVE
    elif npv < 0:
        decision = NpvDecision.NEGATIVE
    else:
        decision = NpvDecision.BREAKEVEN

    fin = ComputedFinancials(
        discount_rate=rate,
        cash_flow=cash_flow,
        total_benefits=round(total_benefits, 4),
        total_costs=round(total_costs, 4),
        npv=npv,
        irr=irr,
        roi=roi,
        payback_years=payback,
        benefit_cost_ratio=bc_ratio,
        irr_passes_hurdle=irr_passes,
        npv_decision=decision,
    )

    # Risk
    weights = bc.risk_weights.model_dump()
    scores = bc.risk_scores.model_dump()
    by_cat = {k: round(scores[k] * weights[k], 4) for k in weights}
    composite = round(sum(by_cat.values()), 4)
    if composite <= 2.0:
        level = "LOW (Green)"
    elif composite <= 3.0:
        level = "MODERATE (Yellow)"
    else:
        level = "HIGH (Red)"

    return Computed(
        financials=fin,
        risk=ComputedRisk(composite=composite, level=level, by_category=by_cat),
    )
