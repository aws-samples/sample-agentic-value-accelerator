"""AI Maturity Assessment data models — based on AWS Enterprise AI Maturity
Assessment Model V3.1 (167 generic parameters across 6 dimensions)."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field
import uuid


# ---------------------------------------------------------------------------
# Schema constants — mirrors the xlsx Scoring Dashboard
# ---------------------------------------------------------------------------

DIMENSIONS = [
    "people",      # People & Talent (28)
    "process",     # Process & Operations (22)
    "technology",  # Technology & Infrastructure (31)
    "data",        # Data & AI Governance (34)
    "governance",  # Governance & Compliance (29)
    "strategy",    # Strategy & Innovation (23)
]

DIMENSION_LABELS: Dict[str, str] = {
    "people":     "People & Talent",
    "process":    "Process & Operations",
    "technology": "Technology & Infrastructure",
    "data":       "Data & AI Governance",
    "governance": "Governance & Compliance",
    "strategy":   "Strategy & Innovation",
}

DIMENSION_WEIGHTS_DEFAULT: Dict[str, float] = {
    "people":     0.20,
    "process":    0.15,
    "technology": 0.20,
    "data":       0.20,
    "governance": 0.10,
    "strategy":   0.15,
}

MATURITY_LEVELS = {
    1: "L1 — Initial / Ad Hoc",
    2: "L2 — Managed",
    3: "L3 — Defined",
    4: "L4 — Quantitatively Managed",
    5: "L5 — Optimizing / Transformative",
}

# 1-5 maturity score for each parameter; 0 means "not yet assessed".
ParamScore = Annotated[int, Field(ge=0, le=5)]


# ---------------------------------------------------------------------------
# Assessment shape
# ---------------------------------------------------------------------------

class AssessmentStatus(str, Enum):
    DRAFT = "Draft"
    IN_PROGRESS = "In Progress"
    COMPLETE = "Complete"
    ARCHIVED = "Archived"


class DimensionWeights(BaseModel):
    people: float = 0.20
    process: float = 0.15
    technology: float = 0.20
    data: float = 0.20
    governance: float = 0.10
    strategy: float = 0.15


class DimensionResult(BaseModel):
    label: str
    answered: int
    total: int
    average: float           # average score across answered params (0 if none)
    weighted_contribution: float  # average × dimension weight
    maturity_level: int      # rounded average -> L1..L5 (0 if unassessed)


class ComputedMaturity(BaseModel):
    dimensions: Dict[str, DimensionResult]
    composite: float          # weighted average across dimensions (0-5)
    maturity_level: int       # rounded composite (0 if unassessed)
    answered: int             # total params answered
    total: int                # total params in catalog
    completion: float         # 0-1


class AssessmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    organization: Optional[str] = Field(default="", max_length=120)
    assessor: Optional[str] = Field(default="", max_length=120)
    status: AssessmentStatus = AssessmentStatus.DRAFT


class AssessmentCreate(AssessmentBase):
    # `scores` is a flat dict keyed by parameter ID (e.g. "P1", "T17", "D34").
    # Values 1-5 = maturity score; 0 or missing = not yet assessed.
    scores: Optional[Dict[str, int]] = None
    weights: Optional[DimensionWeights] = None


class AssessmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    organization: Optional[str] = Field(default=None, max_length=120)
    assessor: Optional[str] = Field(default=None, max_length=120)
    status: Optional[AssessmentStatus] = None
    scores: Optional[Dict[str, int]] = None
    weights: Optional[DimensionWeights] = None


class Assessment(AssessmentBase):
    assessment_id: str = Field(default_factory=lambda: f"as-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    scores: Dict[str, int] = Field(default_factory=dict)
    weights: DimensionWeights = Field(default_factory=DimensionWeights)
    computed: Optional[ComputedMaturity] = None


# ---------------------------------------------------------------------------
# Catalog — list of (param_id, dimension) pairs derived from the xlsx so we
# can compute per-dimension subtotals server-side without re-shipping the
# 78KB JSON. The ID prefixes match the xlsx convention:
#   P*  = People (28),  PR* = Process (22),  T*  = Technology (31),
#   D*  = Data (34),    G*  = Governance (29), S*  = Strategy (23)
# ---------------------------------------------------------------------------

DIMENSION_BY_PREFIX: Dict[str, str] = {
    "PR": "process",
    "P":  "people",
    "T":  "technology",
    "D":  "data",
    "G":  "governance",
    "S":  "strategy",
}

DIMENSION_PARAM_COUNTS: Dict[str, int] = {
    "people": 28,
    "process": 22,
    "technology": 31,
    "data": 34,
    "governance": 29,
    "strategy": 23,
}


def dimension_for(param_id: str) -> Optional[str]:
    """Map a parameter ID to its dimension key. Longer prefixes win (PR > P)."""
    pid = param_id.strip().upper()
    for prefix in ("PR",):  # check 2-letter prefixes first
        if pid.startswith(prefix):
            return DIMENSION_BY_PREFIX[prefix]
    for prefix in ("P", "T", "D", "G", "S"):
        if pid.startswith(prefix):
            return DIMENSION_BY_PREFIX[prefix]
    return None


# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

def compute(assessment: Assessment) -> ComputedMaturity:
    by_dim: Dict[str, List[int]] = {d: [] for d in DIMENSIONS}
    for pid, raw in assessment.scores.items():
        try:
            v = int(raw)
        except (TypeError, ValueError):
            continue
        if v < 1 or v > 5:
            continue
        dim = dimension_for(pid)
        if dim is None:
            continue
        by_dim[dim].append(v)

    weights = assessment.weights.model_dump()
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
            maturity_level=int(round(avg)) if avg else 0,
        )
        if scored:
            composite_num += avg * w
            composite_den += w
        answered_total += len(scored)

    composite = round(composite_num / composite_den, 4) if composite_den else 0.0
    return ComputedMaturity(
        dimensions=dims_out,
        composite=composite,
        maturity_level=int(round(composite)) if composite else 0,
        answered=answered_total,
        total=sum(DIMENSION_PARAM_COUNTS.values()),
        completion=round(answered_total / sum(DIMENSION_PARAM_COUNTS.values()), 4),
    )
