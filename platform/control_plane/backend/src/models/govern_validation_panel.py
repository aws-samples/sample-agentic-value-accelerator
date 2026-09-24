"""Govern Validation Panel — Adversarial validation for harness governance (VVAH-inspired).

Multi-persona validation system where specialized security reviewers assess
harness actions, code changes, and policy changes through different lenses.
Each persona provides findings and recommendations; the system calculates
a weighted verdict using Visa VVAH weights and critical gate logic.

Weights from Visa VVAH:
    - Root Cause Analysis: 43%
    - Instance Coverage: 25%
    - No New Vulnerabilities: 19%
    - Best Practices: 14%
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ValidationPersona(str, Enum):
    """Specialized reviewers for adversarial validation."""
    SECURITY_ARCHITECT = "security_architect"
    PENETRATION_TESTER = "penetration_tester"
    COMPLIANCE_REVIEWER = "compliance_reviewer"
    CROSS_REPO_ANALYZER = "cross_repo_analyzer"


class ValidationTargetType(str, Enum):
    """Types of targets that can be validated."""
    HARNESS_ACTION = "harness_action"
    CODE_CHANGE = "code_change"
    POLICY_CHANGE = "policy_change"


class PersonaVerdict(str, Enum):
    """Verdict from a single persona."""
    APPROVE = "approve"
    REJECT = "reject"
    NEEDS_REVIEW = "needs_review"


class PanelVerdict(str, Enum):
    """Final panel verdict after weighted scoring."""
    VALIDATED = "validated"
    VALIDATION_FAILED = "validation_failed"
    NEEDS_REVIEW = "needs_review"


class ValidationCriterion(BaseModel):
    """A single validation criterion with weight and gate classification."""
    name: str = Field(..., description="Criterion name (e.g., 'root_cause_analysis')")
    label: str = Field(..., description="Human-readable label")
    weight: float = Field(..., ge=0.0, le=1.0, description="Weight in final score (0.0 - 1.0)")
    is_critical: bool = Field(
        default=False,
        description="Critical gates cannot be outweighed by other criteria"
    )
    score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Score assigned (0-100)"
    )
    rationale: Optional[str] = Field(default=None, max_length=1000)


class PersonaFinding(BaseModel):
    """Finding from a single validation persona."""
    persona: ValidationPersona
    verdict: PersonaVerdict
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in verdict (0.0 - 1.0)")
    findings: List[str] = Field(default_factory=list, description="List of findings")
    recommendations: List[str] = Field(default_factory=list, description="List of recommendations")
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_by: Optional[str] = Field(default=None, max_length=200)


class ValidationPanelBase(BaseModel):
    """Base fields for validation panel."""
    target_type: ValidationTargetType
    target_id: str = Field(..., min_length=1, max_length=200, description="ID of the target being validated")
    target_description: Optional[str] = Field(default=None, max_length=1000)


class ValidationPanelCreate(ValidationPanelBase):
    """Request to create a new validation panel."""
    pass


class ValidationPanelFindingSubmit(BaseModel):
    """Request to submit a persona finding."""
    persona: ValidationPersona
    verdict: PersonaVerdict
    confidence: float = Field(..., ge=0.0, le=1.0)
    findings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class ValidationPanel(ValidationPanelBase):
    """Complete validation panel with criteria, findings, and verdict."""
    panel_id: str = Field(default_factory=lambda: f"vp-{uuid.uuid4().hex[:12]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(default=None)
    finalized_at: Optional[datetime] = Field(default=None)
    finalized_by: Optional[str] = Field(default=None)

    # Standard VVAH weights: root_cause 43%, instance_coverage 25%, no_new_vulns 19%, best_practices 14%
    criteria: List[ValidationCriterion] = Field(default_factory=lambda: [
        ValidationCriterion(
            name="root_cause_analysis",
            label="Root Cause Analysis",
            weight=0.43,
            is_critical=True,
        ),
        ValidationCriterion(
            name="instance_coverage",
            label="Instance Coverage",
            weight=0.25,
            is_critical=False,
        ),
        ValidationCriterion(
            name="no_new_vulnerabilities",
            label="No New Vulnerabilities",
            weight=0.19,
            is_critical=True,
        ),
        ValidationCriterion(
            name="best_practices",
            label="Best Practices",
            weight=0.14,
            is_critical=False,
        ),
    ])

    persona_findings: List[PersonaFinding] = Field(default_factory=list)

    # Computed results after finalization
    weighted_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0,
        description=(
            "Weighted score over SCORED criteria only. None means no criterion was "
            "scored, so there is no score - never render as 0."
        ),
    )
    critical_gates_passed: Optional[bool] = Field(
        default=None,
        description="Fail-closed: False when any critical criterion is unscored.",
    )
    final_verdict: Optional[PanelVerdict] = Field(default=None)

    # Coverage of the verdict, so a reader can tell a fully-assessed panel from one
    # resting on two criteria. Without these, `weighted_score` alone looks equally
    # authoritative in both cases.
    scored_criteria: int = Field(default=0, description="Criteria with a real score")
    total_criteria: int = Field(default=0)
    unscored_critical_criteria: List[str] = Field(
        default_factory=list,
        description=(
            "Names of critical criteria nobody scored. Non-empty means the panel "
            "cannot validate - shown to the user so they know what to assess."
        ),
    )
    persona_consensus_score: Optional[float] = Field(
        default=None,
        description=(
            "Confidence-weighted persona opinion, 0-100. Reported as its OWN signal. "
            "This value used to be written into every unscored criterion, which turned "
            "'four reviewers approved' into 'root-cause analysis was verified'."
        ),
    )


# Minimum share of criterion weight that must be scored before a panel can VALIDATE.
# Below this the verdict is NEEDS_REVIEW: a sign-off resting on a fifth of the rubric
# is not a sign-off. Mirrors MIN_CRITERION_COVERAGE in the graduation model.
MIN_CRITERIA_COVERAGE = 0.60


def calculate_verdict(panel: ValidationPanel) -> ValidationPanel:
    """Calculate the weighted verdict from persona findings and criteria scores.

    Logic:
    1. Aggregate persona verdicts by confidence into `persona_consensus_score`. That
       is reported as its own signal and is NEVER written into a criterion.
    2. Critical gates are FAIL-CLOSED: an unscored critical criterion does not pass.
    3. The weighted score renormalises over SCORED criteria only, and is None when
       nothing was scored.
    4. Verdict order: unscored critical criterion or no score at all -> NEEDS_REVIEW;
       failed critical gate -> VALIDATION_FAILED; coverage below
       MIN_CRITERIA_COVERAGE -> NEEDS_REVIEW; then score and persona consensus decide.

    A panel can therefore no longer VALIDATE without someone actually assessing the
    critical criteria, which is what it previously did.
    """
    # Check if we have any findings
    if not panel.persona_findings:
        return panel

    # Aggregate persona verdicts
    total_confidence = sum(f.confidence for f in panel.persona_findings)
    if total_confidence == 0:
        return panel

    weighted_approve = sum(
        f.confidence for f in panel.persona_findings
        if f.verdict == PersonaVerdict.APPROVE
    ) / total_confidence

    weighted_reject = sum(
        f.confidence for f in panel.persona_findings
        if f.verdict == PersonaVerdict.REJECT
    ) / total_confidence

    # Calculate criterion scores from persona findings
    # Each persona's verdict maps to a score: approve=90, needs_review=60, reject=30
    persona_score_map = {
        PersonaVerdict.APPROVE: 90.0,
        PersonaVerdict.NEEDS_REVIEW: 60.0,
        PersonaVerdict.REJECT: 30.0,
    }

    avg_persona_score = sum(
        persona_score_map[f.verdict] * f.confidence
        for f in panel.persona_findings
    ) / total_confidence

    # NO IMPUTATION. This used to be:
    #
    #     for criterion in panel.criteria:
    #         if criterion.score is None:
    #             criterion.score = avg_persona_score
    #
    # which wrote a persona-derived number into every criterion nobody had scored,
    # then gated the CRITICAL criteria on those invented values and persisted them.
    # Verified in-process against the running container: a panel with four APPROVE
    # findings and ZERO scored criteria came out
    # `weighted_score=90.0, critical_gates_passed=True, final_verdict=VALIDATED` -
    # a governance sign-off asserting two critical gates passed when nothing had been
    # assessed. A persona's overall opinion is not a measurement of a specific
    # criterion, and treating it as one is the difference between "four reviewers
    # approved" and "root-cause analysis was verified".
    #
    # The persona aggregate is still used - as its own signal, below - just never
    # laundered into per-criterion scores.

    scored = [c for c in panel.criteria if c.score is not None]
    critical = [c for c in panel.criteria if c.is_critical]

    # Critical gates are FAIL-CLOSED on an unscored criterion. "Not assessed" must
    # never read as "passed": the whole point of a critical gate is that something
    # was checked.
    critical_gates_passed = bool(critical) and all(
        c.score is not None and c.score >= 70.0 for c in critical
    )
    unscored_critical = [c.name for c in critical if c.score is None]

    # Renormalise over SCORED criteria only, so an unscored criterion neither counts
    # as zero (which would sink the score) nor as the persona average (which would
    # inflate it). None when nothing was scored - there is no score to report.
    measured_weight = sum(c.weight for c in scored)
    if measured_weight > 0:
        weighted_score: Optional[float] = round(
            sum(c.score * c.weight for c in scored) / measured_weight, 2
        )
    else:
        weighted_score = None

    total_weight = sum(c.weight for c in panel.criteria)
    coverage = (measured_weight / total_weight) if total_weight > 0 else 0.0

    # Determine final verdict. Ordering encodes the rules:
    #  1. An unscored critical criterion means the panel CANNOT validate, regardless
    #     of how strongly the personas approved.
    #  2. A failed critical gate fails the panel.
    #  3. Only then does the weighted score decide - and it needs enough coverage to
    #     mean anything.
    if unscored_critical or weighted_score is None:
        final_verdict = PanelVerdict.NEEDS_REVIEW
    elif not critical_gates_passed:
        final_verdict = PanelVerdict.VALIDATION_FAILED
    elif coverage < MIN_CRITERIA_COVERAGE:
        final_verdict = PanelVerdict.NEEDS_REVIEW
    elif weighted_score >= 80.0 and weighted_approve > 0.5:
        final_verdict = PanelVerdict.VALIDATED
    elif weighted_score < 50.0 or weighted_reject > 0.5:
        final_verdict = PanelVerdict.VALIDATION_FAILED
    else:
        final_verdict = PanelVerdict.NEEDS_REVIEW

    panel.weighted_score = weighted_score
    panel.critical_gates_passed = critical_gates_passed
    panel.final_verdict = final_verdict
    panel.scored_criteria = len(scored)
    panel.total_criteria = len(panel.criteria)
    panel.unscored_critical_criteria = unscored_critical
    panel.persona_consensus_score = round(avg_persona_score, 2)
    panel.updated_at = datetime.utcnow()

    return panel
