"""Govern Posture Score — Single metric for AI fleet governance health.

Aggregates signals from multiple governance dimensions to produce an overall
"Governance Posture Score" (0-100) with letter grade (A/B/C/D/F).

Dimensions:
- POLICY_COVERAGE (25%): % of detected harnesses with policies applied
- KILLSWITCH_READY (15%): Kill-switch configured and tested
- AUDIT_COMPLETENESS (20%): % of harness runs with audit artifacts
- INCIDENT_RESPONSE (15%): % of recorded incidents and SLA breaches that were
  acknowledged or resolved. Deliberately NOT "within SLA" - see the note on
  DIMENSION_CONFIG[INCIDENT_RESPONSE] for why timeliness is not measurable here.
- VALIDATION_COVERAGE (15%): % of high-risk operations with validation panel review
- DETECTION_BREADTH (10%): Multi-source detection active (CloudTrail + config + git)

Grade thresholds:
- A: 90+
- B: 80-89
- C: 70-79
- D: 60-69
- F: <60
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class PostureDimension(str, Enum):
    """Dimensions that contribute to the overall posture score."""
    POLICY_COVERAGE = "policy_coverage"
    KILLSWITCH_READY = "killswitch_ready"
    AUDIT_COMPLETENESS = "audit_completeness"
    INCIDENT_RESPONSE = "incident_response"
    VALIDATION_COVERAGE = "validation_coverage"
    DETECTION_BREADTH = "detection_breadth"


class PostureGrade(str, Enum):
    """Letter grades for posture score."""
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class PostureTrend(str, Enum):
    """Trend direction for posture score over time."""
    IMPROVING = "improving"
    STABLE = "stable"
    DEGRADING = "degrading"


class UnscoredReason(str, Enum):
    """Why a dimension has score=None.

    `score=None` alone cannot be acted on: "there was nothing to assess" and "the
    assessment blew up" need opposite responses, and the aggregate used to lump them
    into one `unmeasured_dimensions` list. Worse, several dimensions never reached
    None at all - their exception handlers returned an invented number instead - so a
    failed calculation was indistinguishable from a successful one. See the
    per-dimension comments in govern_posture_score_service.py.
    """
    #: Reached the backing store or API successfully; it held no items to score.
    #: A measured zero, and therefore live data.
    NOTHING_ASSESSED = "nothing_assessed"
    #: The calculation raised, or the backing service could not be constructed.
    #: Nothing was verified, so nothing may be asserted about this dimension.
    CALCULATION_FAILED = "calculation_failed"


class DimensionFinding(BaseModel):
    """A specific finding that contributed to a dimension score."""
    item: str = Field(..., description="The item assessed (e.g., harness ID, incident ID)")
    status: str = Field(..., description="Status of the item (e.g., 'covered', 'missing', 'partial')")
    detail: Optional[str] = Field(default=None, description="Additional context")
    impact: float = Field(
        default=0.0,
        ge=-100.0,
        le=100.0,
        description=(
            "Points of this dimension's 0-100 score attributable to this item: positive = "
            "points this item contributed, negative = points lost because of it. Same unit "
            "and scale as DimensionScore.score, so a dimension's findings sum toward its "
            "score. NOT a -10..10 severity rating. The bound used to be -10..10 with the "
            "unit left unstated ('Impact on dimension score'), and the two producers that "
            "did the arithmetic properly - killswitch_ready's 40/20/20/20 check points and "
            "detection_breadth's 33.3 per active source - therefore failed validation and "
            "took their whole dimension down with them, while producers passing an "
            "arbitrary -10 or -5 severity validated fine. The unit is spelled out here "
            "because leaving it implicit is what let the two sides drift apart."
        ),
    )


class DimensionRecommendation(BaseModel):
    """A recommended action to improve a dimension score."""
    action: str = Field(..., description="Recommended action")
    impact: str = Field(..., description="Estimated impact on score (e.g., '+5 points')")
    effort: str = Field(..., description="Effort level (low/medium/high)")
    priority: int = Field(..., ge=1, le=5, description="Priority (1=highest)")


class DimensionScore(BaseModel):
    """Score and details for a single governance dimension."""
    dimension: PostureDimension
    label: str = Field(..., description="Human-readable label")
    description: str = Field(..., description="What this dimension measures")
    score: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description=(
            "Score 0-100, or None when this dimension assessed nothing. None is NOT zero: "
            "three dimensions used to return an arbitrary midpoint when they had no items "
            "(audit_completeness 50, validation_coverage 50, killswitch_ready 40) and one "
            "returned 100 for 'no incidents detected'. Together those carried half the total "
            "weight, so half of a graded A-F posture score was invented. An unmeasured "
            "dimension must be excluded from the weighted average, not given half marks."
        ),
    )
    unscored_reason: Optional[UnscoredReason] = Field(
        default=None,
        description=(
            "Why score is None. Always set when score is None and always None when score "
            "is set. Distinguishes a measured empty result (nothing_assessed - live data) "
            "from a calculation that failed (calculation_failed - nothing verified), which "
            "a bare None cannot."
        ),
    )
    weight: float = Field(..., ge=0.0, le=1.0, description="Weight in overall score")
    weighted_contribution: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Contribution to overall score (score * weight). None when score is None."
    )
    findings: List[DimensionFinding] = Field(
        default_factory=list,
        description="Items that contributed to this score"
    )
    recommendations: List[DimensionRecommendation] = Field(
        default_factory=list,
        description="Actions to improve this dimension"
    )
    items_assessed: int = Field(default=0, ge=0, description="Number of items assessed")
    items_compliant: int = Field(default=0, ge=0, description="Number of compliant items")
    live: bool = Field(default=False, description="Whether data is from live AWS APIs")
    source: str = Field(default="unknown", description="Data source")
    note: Optional[str] = Field(default=None, description="Additional context")


class PostureScore(BaseModel):
    """Overall governance posture score with dimensional breakdown."""
    overall_score: float = Field(..., ge=0.0, le=100.0, description="Overall posture score (0-100)")
    grade: PostureGrade = Field(..., description="Letter grade (A/B/C/D/F)")
    grade_label: str = Field(..., description="Grade descriptor (e.g., 'Excellent', 'Good')")
    dimensions: List[DimensionScore] = Field(..., description="Breakdown by dimension")
    trend: PostureTrend = Field(default=PostureTrend.STABLE, description="Score trend direction")
    trend_delta: float = Field(
        default=0.0,
        description="Change in score over trailing period (positive = improving)"
    )
    calculated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When this score was calculated"
    )
    cached_at: Optional[datetime] = Field(
        default=None,
        description="When this was cached (if from cache)"
    )
    measured_weight_pct: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description=(
            "Share of total dimension weight that produced a score at all, from live or "
            "seeded data alike. The overall score is a weighted mean over those dimensions, "
            "renormalised by this, so a low value means the score and grade rest on a narrow "
            "base. Render it alongside them. This is a COMPLETENESS figure, not a provenance "
            "one - for provenance read live_weight_pct, which is the share that came from a "
            "real AWS read. The two diverge: on the reference account a seeded harness "
            "inventory produced two scored dimensions carrying 35% of the weight."
        ),
    )
    live_weight_pct: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description=(
            "Share of TOTAL dimension weight that both produced a score and read live AWS "
            "data. Always <= measured_weight_pct. The gap between them is score that came "
            "from seeded or fallback inputs, which measured_weight_pct alone hid: it counted "
            "any non-None score as 'measured', so a dimension computed off mock harness "
            "discovery was indistinguishable from one computed off a real API read."
        ),
    )
    unmeasured_dimensions: List[str] = Field(
        default_factory=list,
        description=(
            "Every dimension excluded from the overall score, for any reason. Union of the "
            "nothing-assessed and failed-to-compute cases; failed_dimensions carries the "
            "latter separately."
        ),
    )
    failed_dimensions: List[str] = Field(
        default_factory=list,
        description=(
            "Dimensions whose calculation raised or whose backing service could not be "
            "loaded. A subset of unmeasured_dimensions, split out because the two demand "
            "opposite responses: nothing-assessed is a governance gap to close, "
            "failed-to-compute is a broken integration to fix. These used to be invisible - "
            "three dimensions raised on a single request against the reference account, each "
            "warning was logged and swallowed, and the exception handlers substituted "
            "invented scores (incident_response 75.0 with a fabricated 10 items / 7 "
            "compliant, detection_breadth 33.3) that then counted as measured weight. The "
            "endpoint returned 200 with 79.2 (C) and nothing in the body said a quarter of "
            "the model had failed."
        ),
    )
    live: bool = Field(default=False, description="Whether all dimensions used live data")
    partial_live: bool = Field(default=False, description="Whether some dimensions used live data")
    source: str = Field(default="calculated", description="Data source summary")
    note: Optional[str] = Field(default=None, description="Additional context or caveats")


class PostureRecommendation(BaseModel):
    """A prioritized action to improve the overall posture score."""
    action: str = Field(..., description="Recommended action")
    dimension: PostureDimension = Field(..., description="Which dimension this improves")
    current_score: Optional[float] = Field(
        None, ge=0.0, le=100.0,
        description="Current dimension score. None when the dimension is not scored yet.",
    )
    projected_score: Optional[float] = Field(
        None, ge=0.0, le=100.0,
        description=(
            "Projected score after the action. None when there is no measured baseline to "
            "project from - projecting off an invented starting point is not a projection."
        ),
    )
    overall_impact: float = Field(..., description="Estimated impact on overall score")
    effort: str = Field(..., description="Effort level (low/medium/high)")
    priority: int = Field(..., ge=1, le=10, description="Priority (1=highest)")
    reasoning: str = Field(..., description="Why this action was recommended")


class PostureRecommendationsResponse(BaseModel):
    """Response for recommendations endpoint."""
    recommendations: List[PostureRecommendation] = Field(..., description="Prioritized recommendations")
    current_score: float = Field(..., ge=0.0, le=100.0, description="Current overall score")
    current_grade: PostureGrade = Field(..., description="Current grade")
    projected_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Projected score if all recommendations implemented"
    )
    projected_grade: PostureGrade = Field(..., description="Projected grade")
    live: bool = Field(default=False)
    source: str = Field(default="calculated")


class PostureHistoryEntry(BaseModel):
    """A single point in posture score history."""
    timestamp: datetime = Field(..., description="When this score was recorded")
    overall_score: float = Field(..., ge=0.0, le=100.0)
    grade: PostureGrade
    dimensions: dict = Field(
        default_factory=dict,
        description="Dimension scores at this point {dimension: score}"
    )
    note: Optional[str] = Field(default=None, description="Any notable events")


class PostureHistoryResponse(BaseModel):
    """Response for history endpoint."""
    entries: List[PostureHistoryEntry] = Field(..., description="Historical entries")
    period_days: int = Field(..., ge=1, description="Number of days covered")
    current_score: float = Field(..., ge=0.0, le=100.0)
    period_start_score: float = Field(..., ge=0.0, le=100.0, description="Score at start of period")
    trend: PostureTrend = Field(..., description="Overall trend direction")
    trend_delta: float = Field(..., description="Score change over period")
    live: bool = Field(default=False)
    source: str = Field(default="calculated")


# Grade calculation helper
def calculate_grade(score: float) -> tuple[PostureGrade, str]:
    """Calculate letter grade and label from numeric score."""
    if score >= 90:
        return PostureGrade.A, "Excellent"
    elif score >= 80:
        return PostureGrade.B, "Good"
    elif score >= 70:
        return PostureGrade.C, "Fair"
    elif score >= 60:
        return PostureGrade.D, "Poor"
    else:
        return PostureGrade.F, "Critical"


# Dimension configuration
DIMENSION_CONFIG = {
    PostureDimension.POLICY_COVERAGE: {
        "label": "Policy Coverage",
        "description": "Percentage of detected harnesses with governance policies applied",
        "weight": 0.25,
    },
    PostureDimension.KILLSWITCH_READY: {
        "label": "Kill-Switch Readiness",
        "description": "Emergency kill-switch is configured and can be activated",
        "weight": 0.15,
    },
    PostureDimension.AUDIT_COMPLETENESS: {
        "label": "Audit Completeness",
        "description": "Percentage of harness runs with complete audit artifacts",
        "weight": 0.20,
    },
    PostureDimension.INCIDENT_RESPONSE: {
        "label": "Incident Response",
        # "within SLA" was dropped from this description, not softened: nothing in this
        # system stores an incident-response SLA, so timeliness was never measurable.
        # SLATarget covers availability / latency / error_rate / throughput metrics, and
        # _compute_sla_compliance used to return hardcoded simulated values (99.95, 150ms,
        # 0.1%) with a "In production, this would query CloudWatch" comment; it now returns
        # None for every SLA and every metric_type instead of inventing one, so there is no
        # measured compliance figure to describe rather than a fake one. The dimension's own
        # implementation never got that far either - it multiplied a CloudTrail event count
        # by a literal 0.8 and called the result SLA compliance. What IS stored, and is
        # therefore what this now reports, is whether each recorded incident and SLA breach
        # was acknowledged or resolved at all.
        "description": (
            "Percentage of recorded incidents and SLA breaches that were acknowledged or "
            "resolved (response, not timeliness: no incident-response SLA target is stored)"
        ),
        "weight": 0.15,
    },
    PostureDimension.VALIDATION_COVERAGE: {
        "label": "Validation Coverage",
        "description": "Percentage of high-risk operations with validation panel review",
        "weight": 0.15,
    },
    PostureDimension.DETECTION_BREADTH: {
        "label": "Detection Breadth",
        "description": "Multi-source detection active (CloudTrail, config files, git commits)",
        "weight": 0.10,
    },
}
