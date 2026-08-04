"""AI Operating Model — interactive design form.

Source: AWS Enterprise Operating Model Assessment workbook.
Mirrors the shape of models.maturity for consistency.

7 TOM dimensions × 3 questions = 21 questions, scored 1–5.
Plus pattern + governance choice, capability placement, investment split, and roadmap phases.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field
import uuid


# ---------------------------------------------------------------------------
# Schema constants
# ---------------------------------------------------------------------------

DIMENSIONS = [
    "strategy",
    "governance",
    "organization",
    "people",
    "technology",
    "process",
    "ecosystem",
]

DIMENSION_LABELS: Dict[str, str] = {
    "strategy":     "AI Strategy & Vision",
    "governance":   "Governance & Risk",
    "organization": "Organization & Operating Model",
    "people":       "People & Talent",
    "technology":   "Technology & Platform",
    "process":      "Process & Delivery",
    "ecosystem":    "Ecosystem & Partners",
}

DIMENSION_WEIGHTS_DEFAULT: Dict[str, float] = {
    "strategy":     0.20,
    "governance":   0.15,
    "organization": 0.15,
    "people":       0.15,
    "technology":   0.15,
    "process":      0.10,
    "ecosystem":    0.10,
}

DIMENSION_PARAM_COUNTS: Dict[str, int] = {
    "strategy":     3,
    "governance":   3,
    "organization": 3,
    "people":       3,
    "technology":   3,
    "process":      3,
    "ecosystem":    3,
}

DIMENSION_BY_PREFIX: Dict[str, str] = {
    "STR": "strategy",
    "GOV": "governance",
    "ORG": "organization",
    "PEO": "people",
    "TEC": "technology",
    "PRO": "process",
    "ECO": "ecosystem",
}

MATURITY_LEVELS = {
    1: "L1 — Awareness",
    2: "L2 — Developing",
    3: "L3 — Defined",
    4: "L4 — Advanced",
    5: "L5 — Transformational",
}

PATTERNS: List[str] = [
    "Centralized CoE",
    "CoE + BU Liaisons",
    "Hub-and-Spoke",
    "Federated + Central Gov",
    "Fully Federated",
]

GOVERNANCE_APPROACHES: List[str] = [
    "Executive-sponsored / informal",
    "Formal AI Council",
    "Three-tier (Board · Council · Teams)",
    "Automated central guardrails",
    "Embedded in workflows",
]

ParamScore = Annotated[int, Field(ge=0, le=5)]
PercentInt = Annotated[int, Field(ge=0, le=100)]


def dimension_for(qid: str) -> Optional[str]:
    """Map a question ID to its dimension key."""
    pid = (qid or "").strip().upper()
    for prefix, dim in DIMENSION_BY_PREFIX.items():
        if pid.startswith(prefix):
            return dim
    return None


# ---------------------------------------------------------------------------
# Operating Model shape
# ---------------------------------------------------------------------------

class OperatingModelStatus(str, Enum):
    DRAFT = "Draft"
    IN_PROGRESS = "In Progress"
    COMPLETE = "Complete"
    ARCHIVED = "Archived"


class DimensionWeights(BaseModel):
    strategy: float = 0.20
    governance: float = 0.15
    organization: float = 0.15
    people: float = 0.15
    technology: float = 0.15
    process: float = 0.10
    ecosystem: float = 0.10


class CapabilityChoice(BaseModel):
    capability_id: int
    placement: str = Field(default="Centralized")  # Centralized | Hub-and-Spoke | Federated
    ownership: str = ""


class InvestmentSplit(BaseModel):
    people_pct: PercentInt = 70
    technology_pct: PercentInt = 20
    algorithms_pct: PercentInt = 10


class RoadmapPhase(BaseModel):
    name: str
    months: str = ""
    investment_m: float = 0.0
    enabled: bool = True


DEFAULT_ROADMAP: List[RoadmapPhase] = [
    RoadmapPhase(name="Phase 1: Foundation",    months="0–6",   investment_m=1.2, enabled=True),
    RoadmapPhase(name="Phase 2: Build & Pilot", months="6–12",  investment_m=2.0, enabled=True),
    RoadmapPhase(name="Phase 3: Scale",         months="12–24", investment_m=2.2, enabled=True),
    RoadmapPhase(name="Phase 4: Optimize",      months="24–36", investment_m=1.4, enabled=True),
]


class DimensionResult(BaseModel):
    label: str
    answered: int
    total: int
    average: float
    weighted_contribution: float
    level: int


class ComputedOperatingModel(BaseModel):
    dimensions: Dict[str, DimensionResult]
    composite: float
    maturity_level: int
    recommended_pattern: str
    recommended_governance: str
    answered: int
    total: int
    completion: float
    total_investment_m: float


class OperatingModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    organization: Optional[str] = Field(default="", max_length=120)
    designer: Optional[str] = Field(default="", max_length=120)
    status: OperatingModelStatus = OperatingModelStatus.DRAFT


class OperatingModelCreate(OperatingModelBase):
    scores: Optional[Dict[str, int]] = None
    weights: Optional[DimensionWeights] = None
    pattern: Optional[str] = None
    governance: Optional[str] = None
    capability_choices: Optional[List[CapabilityChoice]] = None
    investment: Optional[InvestmentSplit] = None
    roadmap: Optional[List[RoadmapPhase]] = None


class OperatingModelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    organization: Optional[str] = Field(default=None, max_length=120)
    designer: Optional[str] = Field(default=None, max_length=120)
    status: Optional[OperatingModelStatus] = None
    scores: Optional[Dict[str, int]] = None
    weights: Optional[DimensionWeights] = None
    pattern: Optional[str] = None
    governance: Optional[str] = None
    capability_choices: Optional[List[CapabilityChoice]] = None
    investment: Optional[InvestmentSplit] = None
    roadmap: Optional[List[RoadmapPhase]] = None


class OperatingModel(OperatingModelBase):
    operating_model_id: str = Field(default_factory=lambda: f"om-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    scores: Dict[str, int] = Field(default_factory=dict)
    weights: DimensionWeights = Field(default_factory=DimensionWeights)
    pattern: str = "Centralized CoE"
    governance: str = "Executive-sponsored / informal"
    capability_choices: List[CapabilityChoice] = Field(default_factory=list)
    investment: InvestmentSplit = Field(default_factory=InvestmentSplit)
    roadmap: List[RoadmapPhase] = Field(default_factory=lambda: [p.model_copy() for p in DEFAULT_ROADMAP])
    computed: Optional[ComputedOperatingModel] = None


# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

def _recommend_pattern(composite: float) -> str:
    if composite >= 4.5: return "Fully Federated"
    if composite >= 3.6: return "Federated + Central Gov"
    if composite >= 3.0: return "Hub-and-Spoke"
    if composite >= 2.0: return "CoE + BU Liaisons"
    return "Centralized CoE"


def _recommend_governance(composite: float) -> str:
    if composite >= 4.5: return "Embedded in workflows"
    if composite >= 3.6: return "Automated central guardrails"
    if composite >= 3.0: return "Three-tier (Board · Council · Teams)"
    if composite >= 2.0: return "Formal AI Council"
    return "Executive-sponsored / informal"


def compute(model: OperatingModel) -> ComputedOperatingModel:
    by_dim: Dict[str, List[int]] = {d: [] for d in DIMENSIONS}
    for qid, raw in (model.scores or {}).items():
        try:
            v = int(raw)
        except (TypeError, ValueError):
            continue
        if v < 1 or v > 5:
            continue
        dim = dimension_for(qid)
        if dim is None:
            continue
        by_dim[dim].append(v)

    weights = model.weights.model_dump()
    dims_out: Dict[str, DimensionResult] = {}
    composite_num = 0.0
    composite_den = 0.0
    answered_total = 0

    for d in DIMENSIONS:
        scored = by_dim[d]
        total = DIMENSION_PARAM_COUNTS[d]
        avg = round(sum(scored) / len(scored), 4) if scored else 0.0
        w = weights.get(d, 0)
        contrib = round(avg * w, 4)
        dims_out[d] = DimensionResult(
            label=DIMENSION_LABELS[d],
            answered=len(scored),
            total=total,
            average=avg,
            weighted_contribution=contrib,
            level=int(round(avg)) if avg else 0,
        )
        if scored:
            composite_num += avg * w
            composite_den += w
        answered_total += len(scored)

    composite = round(composite_num / composite_den, 4) if composite_den else 0.0
    total_investment = round(sum(p.investment_m for p in (model.roadmap or []) if p.enabled), 4)

    return ComputedOperatingModel(
        dimensions=dims_out,
        composite=composite,
        maturity_level=int(round(composite)) if composite else 0,
        recommended_pattern=_recommend_pattern(composite),
        recommended_governance=_recommend_governance(composite),
        answered=answered_total,
        total=sum(DIMENSION_PARAM_COUNTS.values()),
        completion=round(answered_total / sum(DIMENSION_PARAM_COUNTS.values()), 4),
        total_investment_m=total_investment,
    )
