"""Govern Graduation — earned/progressive autonomy computed from REAL signals.

The differentiator no competitor ships (even statically): an agent's graduation
readiness + verdict are computed live from the real, persisted audit/decision
log — chiefly the human-agreement rate from real handoff decisions — not from a
seeded generator. A bidirectional ratchet earns a step UP the L1->L4 ladder as
agreement accumulates, and steps DOWN to a safe degraded state on a real
incident / guardrail spike / falling agreement (with provenance back to the
triggering audit event).

Design (per the sharpened spec + adversarial critique):
- PERSIST only human-grant INTENT (GraduationRecord.ratchet: who promoted, when,
  probation, acknowledged step-downs). Never auto-promote.
- COMPUTE signals + criteria + verdict on read from the audit log — never
  denormalized/stale (mirrors the conformance compute() pattern).
- Reuse the exact THRESHOLDS + verdict logic semantics from the frontend
  graduationData.ts so L2/L3/L4 meaning is unchanged.

Grounded in the AWS Agentic AI Security Scoping Matrix (progressive autonomy),
EU AI Act Art. 14 (oversight transforms, never vanishes), and NIST AI RMF
MANAGE 2.4/4.1 (supersede/override) for the step-down being a first-class action.
"""

from __future__ import annotations

import math
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

# Autonomy scope levels: 1 No Agency -> 2 Prescribed -> 3 Supervised -> 4 Full.
AgentScopeLevel = int

GraduationVerdict = str  # "ready" | "conditional" | "not_ready" | "insufficient_evidence"


class RatchetDirection(str, Enum):
    UP = "up"
    HOLD = "hold"
    DOWN = "down"


# Per-target-level graduation thresholds — ported verbatim from the frontend
# graduationData.ts THRESHOLDS so the meaning of L2/L3/L4 is identical.
THRESHOLDS: Dict[int, Dict[str, float]] = {
    2: {"decisions": 200,  "days": 14, "maxIncidentRate": 2.0, "maxErrorRate": 3.0, "maxGuardrail": 2.0, "minAgreement": 85},
    3: {"decisions": 500,  "days": 30, "maxIncidentRate": 1.0, "maxErrorRate": 2.0, "maxGuardrail": 1.0, "minAgreement": 90},
    4: {"decisions": 5000, "days": 90, "maxIncidentRate": 0.2, "maxErrorRate": 1.0, "maxGuardrail": 0.5, "minAgreement": 95},
}

# How agent decision actions map to agreement vs override (for agreement rate).
AGREEMENT_ACTIONS = {"approve", "answer", "acknowledge", "choose"}
PARTIAL_ACTIONS = {"approve-with-edit"}   # counted as partial agreement (0.5)
OVERRIDE_ACTIONS = {"reject", "escalate", "take-over"}


# ── Readiness scoring ───────────────────────────────────────────────────────────
#
# Readiness used to be `passed / len(criteria) * 100`, which had two defects:
#
#  1. Every criterion weighed the same, so "Active guardrail policy: none" - a
#     BLOCKING safety gate - contributed exactly as much as "Incident rate
#     1.2/1k", which is advisory. An agent could display 86% readiness while a
#     blocking safety gate was failing.
#  2. A criterion whose status is `insufficient` ("not enough evidence to judge")
#     stayed in the denominator as a non-pass, so NOT KNOWN scored identically to
#     FAILED. That is the same null-vs-zero error the rest of this module treats
#     as a bug: an agent nobody has instrumented is unmeasured, not bad.
#
# Both are fixed below: weights reflect consequence, and unknown criteria leave
# the denominator entirely while `coverage` travels with the score so a reader can
# see how much of the model was actually evaluated.
#
# There is deliberately NO second tier scale (no T1-T4 "trust tier"). Agents sit
# on one ladder, L1-L4, and the delegation-chain minimum already exists as the
# A2A autonomy ceiling in models/govern_a2a_trust.py:
# min(source.scope_level, target.scope_level, policy.max_delegated_autonomy).
# A parallel 4-point scale over the same question would only be ambiguous to a
# reader, especially since "Supervised" names L3 (second highest) on this ladder.

CRITERION_WEIGHTS: Dict[str, float] = {
    # Blocking safety gates - highest consequence.
    "Open incidents": 0.20,
    "Active guardrail policy": 0.20,
    # Blocking, and the signal this whole model is built on.
    "Human agreement rate": 0.18,
    # Blocking, but they measure evidence VOLUME rather than behaviour quality.
    "Decisions in current scope": 0.12,
    "Time at current level": 0.10,
    # Advisory: a breach warrants attention, not a held promotion.
    "Incident rate": 0.08,
    "Guardrail intervention rate": 0.07,
    "Error rate": 0.05,
}

# Share of total criterion weight that must be KNOWN before a readiness number is
# emitted at all. Below this the score is null and the reason is stated. 0.60 is
# set so that the three highest-weight criteria alone (0.58) are NOT sufficient -
# a readiness number always rests on more than the safety gates.
MIN_CRITERION_COVERAGE = 0.60

# Hysteresis. To EARN a step up, a numeric criterion must clear its threshold by a
# margin; to KEEP the level already held, the bare threshold applies. Without it an
# agent sitting exactly on a threshold flips between `conditional` and `ready` on
# consecutive reads, which reads as instability in the agent rather than in the
# measurement.
#
# TWO margins, because a single relative margin is wrong for bounded scales:
#
# PROMOTION_MARGIN is relative, for quantities with no upper bound - decision
# counts, days, and the rate ceilings.
#
# PROMOTION_MARGIN_POINTS is absolute, for percentages bounded at 100. Applying the
# relative margin to `minAgreement` produced effective bars of 99% for L3 (90 x 1.1)
# and 104.5% for L4 (95 x 1.1) - the second of which is unreachable, so NO agent
# could ever have been promoted to L4. Absolute points give 92% and 97%, which are
# demanding but attainable. The result is capped at 100 so a high threshold can
# never become impossible.
PROMOTION_MARGIN = 0.10
PROMOTION_MARGIN_POINTS = 2.0


class Ratchet(BaseModel):
    direction: RatchetDirection = RatchetDirection.HOLD
    step_down_triggered: bool = False
    step_down_reason: Optional[str] = None
    triggered_by_event_id: Optional[str] = None  # provenance link into the audit log
    last_ratchet_at: Optional[datetime] = None
    promoted_by: Optional[str] = None
    promoted_at: Optional[datetime] = None
    probation_until: Optional[str] = None


class GraduationRecordBase(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120)
    name: str = Field(default="", max_length=200)
    business_unit: str = Field(default="", max_length=120)
    current_level: AgentScopeLevel = 2
    has_policy: bool = True
    reviewer_hours_per_month: int = 0


class GraduationRecordCreate(GraduationRecordBase):
    pass


class GraduationRecord(GraduationRecordBase):
    """Persisted grant-intent state-of-record. Signals are NOT stored here."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    ratchet: Ratchet = Field(default_factory=Ratchet)


class GraduationCriterion(BaseModel):
    label: str
    requirement: str
    value: str
    status: str  # pass | warning | fail | insufficient
    blocking: bool
    detail: Optional[str] = None
    # Share of the readiness score this criterion carries (see CRITERION_WEIGHTS).
    # Surfaced so a reader can tell why one unmet criterion moved the score more
    # than another rather than having to infer it.
    weight: float = 0.0
    # True when `status == "insufficient"`: this criterion is UNKNOWN, not failed,
    # and is excluded from the readiness denominator.
    unknown: bool = False


class ScoreProvenance(BaseModel):
    """What a score means and what it is made of.

    Every readiness number is rendered with this block. The platform also carries
    `riskScore` in the same 0-100 space with the OPPOSITE polarity, so a bare
    number is genuinely ambiguous to a reader - `polarity` exists to remove that
    ambiguity at the point of display, not in a tooltip somewhere else.
    """
    metric: str
    # One sentence a non-specialist can act on.
    definition: str
    # "higher_is_better" | "lower_is_better"
    polarity: str
    # How the number is arrived at, in words rather than as a formula.
    method: str
    # The concrete data behind it, named so a reader can go and check it.
    inputs: List[str]
    # Share of criterion weight that was actually known, 0-100.
    scored_weight_pct: int
    known_criteria: int
    total_criteria: int
    # Criteria that could not be evaluated. Named, so an operator learns what to
    # switch on rather than just seeing a dash.
    unknown_criteria: List[str] = Field(default_factory=list)
    min_coverage_pct: int = int(MIN_CRITERION_COVERAGE * 100)
    # Populated only when `readiness` is null. Always safe to show a user.
    unscored_reason: Optional[str] = None
    # True when the numbers came from the real audit log rather than a seeded
    # roster, so the UI badge and the score cannot disagree.
    live: bool = True


class ComputedSignals(BaseModel):
    """Computed live from the audit log each request — never persisted."""
    decisions_in_scope: int = 0
    agreement_rate: int = 0            # %
    agreement_trend: str = "flat"      # rising | flat | falling
    guardrail_intervention_rate: float = 0.0
    open_incidents: int = 0
    incident_rate: float = 0.0
    error_rate: float = 0.0
    days_in_scope: int = 0
    window_counts: Dict[str, int] = Field(default_factory=dict)
    sufficient_evidence: bool = False  # enough decisions to judge at all
    # `error_rate` has no live feed today - the service sets it to 0.0 as a
    # placeholder. Without this flag a 0.0 placeholder would score as a PASS on a
    # dimension nothing measures, which is a fabricated pass. Set it True only when
    # a real per-agent error signal is wired up.
    error_rate_measured: bool = False


class AgentGraduation(BaseModel):
    """The full drop-in payload for the frontend EarnedAutonomyView."""
    agent_id: str
    name: str
    business_unit: str
    current_level: AgentScopeLevel
    target_level: Optional[AgentScopeLevel]
    verdict: GraduationVerdict
    # None means NOT SCORED - too little of the model was known to produce a
    # number. Render as "not scored" with `score_provenance.unscored_reason`,
    # never as 0, which would read as a total failure.
    readiness: Optional[int] = None
    summary: str
    criteria: List[GraduationCriterion]
    signals: ComputedSignals
    ratchet: Ratchet
    reviewer_hours_per_month: int
    # Always populated, including when readiness is None.
    score_provenance: Optional[ScoreProvenance] = None
    # Labels of blocking criteria currently failing. Drives the "Blocked by" line,
    # which is what a user actually needs to act on - a low score does not say
    # WHICH gate is shut.
    blocking_failures: List[str] = Field(default_factory=list)


class GraduationSummary(BaseModel):
    total: int = 0
    ready: int = 0
    conditional: int = 0
    not_ready: int = 0
    step_down_recommended: int = 0
    reclaimable_hours_per_month: int = 0
    pct_at_low_autonomy: int = 0
    # Agents held because nothing is known about them yet, as distinct from agents
    # judged and found wanting. Kept separate so "not ready" cannot absorb them.
    insufficient_evidence: int = 0
    # Agents whose readiness could not be scored at all. Reported at fleet level so
    # a roll-up cannot imply the whole fleet was assessed: "12 ready of 40" reads
    # very differently when 21 of the 40 were never scoreable.
    unscored: int = 0
    # Mean readiness across SCORED agents only, or None when none could be scored.
    # Averaging unscored agents in as 0 would understate the fleet.
    mean_readiness_scored: Optional[int] = None


def _verdict_from(criteria: List[GraduationCriterion]) -> GraduationVerdict:
    """blocking fail -> not_ready; blocking unknown -> insufficient_evidence;
    any other non-pass -> conditional; else ready.

    `insufficient_evidence` is a distinct verdict rather than being folded into
    `conditional`. An agent with three logged decisions used to come out as
    "conditional", which renders as "eligible for L3 with monitoring" - a positive
    statement about an agent nobody has evidence about. Not knowing is not a mild
    form of qualifying.

    A blocking FAIL still outranks it: a shut safety gate is a decided outcome, and
    reporting "insufficient evidence" for an agent with an open incident would bury
    the thing that actually needs attention.
    """
    if any(c.blocking and c.status == "fail" for c in criteria):
        return "not_ready"
    if any(c.blocking and c.status == "insufficient" for c in criteria):
        return "insufficient_evidence"
    # An UNKNOWN advisory criterion does not degrade the verdict. Advisory criteria
    # do not gate a promotion by definition, and one of them (Error rate) has no
    # live feed at all, so treating its absence as a shortfall would hold every
    # agent at `conditional` permanently with no action an operator could take to
    # clear it. It is still excluded from the readiness score and named in
    # `score_provenance.unknown_criteria`, so the gap is visible rather than hidden.
    # A BREACHED advisory criterion (`warning`) does still degrade to conditional -
    # that is a real measured shortfall.
    if any(c.status not in ("pass", "insufficient") for c in criteria):
        return "conditional"
    return "ready"


def score_readiness(criteria: List[GraduationCriterion]) -> tuple[Optional[int], ScoreProvenance]:
    """Weighted readiness over KNOWN criteria only, plus the provenance to render it.

    Returns (readiness, provenance). `readiness` is None when too little of the
    model was known for a number to mean anything; `provenance.unscored_reason`
    then says why, in language safe to show a user.

    A `warning` (advisory criterion breached) scores as a half pass rather than
    zero: it is a real shortfall, but treating it as total failure on that
    dimension would make an advisory criterion behave like a blocking one, which
    is the distinction the `blocking` flag exists to draw.
    """
    inputs = [
        "Human decisions recorded in the Govern audit log (approve / reject / escalate / take-over)",
        "Bedrock Guardrails intervention counts for the guardrail bound to this agent",
        "Incidents reported against this agent, and their open/closed state",
        "Elapsed time at the agent's current scope level",
        "Whether a guardrail policy is currently attached",
    ]

    def provenance(
        scored_pct: int,
        known: int,
        unknown_labels: List[str],
        reason: Optional[str],
    ) -> ScoreProvenance:
        return ScoreProvenance(
            metric="Readiness",
            definition=(
                "How much of the evidence required to reduce human oversight for this "
                "agent is currently satisfied. It is a measure of EVIDENCE, not of the "
                "agent's quality, and it never promotes anything on its own - a human "
                "grants every step up the L1-L4 ladder."
            ),
            polarity="higher_is_better",
            method=(
                "Weighted share of the graduation criteria that pass, counting an "
                "advisory breach as half. Criteria are weighted by consequence, so the "
                "blocking safety gates move the number more than the advisory rates. "
                "Criteria that cannot be evaluated are excluded from the calculation "
                "rather than counted as failures, and the share of weight actually "
                "evaluated is reported alongside the score."
            ),
            inputs=inputs,
            scored_weight_pct=scored_pct,
            known_criteria=known,
            total_criteria=len(criteria),
            unknown_criteria=unknown_labels,
            unscored_reason=reason,
        )

    if not criteria:
        # No target level: the agent is already at L4, so there is nothing to earn.
        return None, provenance(
            0, 0, [],
            "This agent is already at L4 Full Agency, so there is no further step to earn.",
        )

    known = [c for c in criteria if not c.unknown]
    unknown_labels = [c.label for c in criteria if c.unknown]
    total_weight = sum(c.weight for c in criteria)
    known_weight = sum(c.weight for c in known)
    coverage = (known_weight / total_weight) if total_weight > 0 else 0.0
    scored_pct = round(coverage * 100)

    if known_weight <= 0:
        return None, provenance(
            0, 0, unknown_labels,
            "None of the graduation criteria could be evaluated for this agent yet.",
        )

    # A blocking gate that is UNKNOWN cannot be scored past. Reporting a number
    # here would imply the gate had been checked and cleared.
    unknown_blocking = [c.label for c in criteria if c.unknown and c.blocking]
    if unknown_blocking:
        return None, provenance(
            scored_pct, len(known), unknown_labels,
            "Not scored: "
            + ", ".join(unknown_blocking)
            + " must be evaluated before readiness means anything, and there is not "
            "enough evidence for it yet.",
        )

    if coverage < MIN_CRITERION_COVERAGE:
        return None, provenance(
            scored_pct, len(known), unknown_labels,
            f"Not scored: only {scored_pct}% of the criteria weight could be evaluated, "
            f"below the {int(MIN_CRITERION_COVERAGE * 100)}% minimum for a readiness "
            "number to be meaningful.",
        )

    credit = 0.0
    for c in known:
        if c.status == "pass":
            credit += c.weight
        elif c.status == "warning":
            credit += c.weight * 0.5

    return round(credit / known_weight * 100), provenance(
        scored_pct, len(known), unknown_labels, None
    )


def compute(record: GraduationRecord, signals: ComputedSignals) -> AgentGraduation:
    """Build the graduation criteria + verdict from real computed signals."""
    current = record.current_level
    target: Optional[int] = current + 1 if current < 4 else None
    criteria: List[GraduationCriterion] = []

    # Hysteresis: an agent that has NOT yet been granted this step must clear each
    # numeric threshold by PROMOTION_MARGIN to earn it; one already holding the
    # level keeps it at the bare threshold. Without the margin an agent sitting
    # exactly on a threshold flips verdict between consecutive reads.
    holding = record.ratchet.promoted_at is not None and not record.ratchet.step_down_triggered
    margin = 0.0 if holding else PROMOTION_MARGIN

    # Comparisons carry an epsilon because the effective bars are products of
    # floats: 90 * 1.1 is 99.00000000000001, so an agent measured at exactly 99
    # would be failed against a bar it visibly meets.
    EPS = 1e-9

    def _fmt(v: float, integer: bool) -> str:
        return str(int(round(v))) if integer else f"{v:g}"

    def at_least(
        value: float, threshold: float, unit: str = "", integer: bool = True,
        pct_bounded: bool = False,
    ) -> tuple[str, bool]:
        """Lower bound. Returns the requirement AS TESTED, plus the outcome.

        The requirement string states the effective bar rather than the base
        threshold. Showing ">= 90%" while actually testing against 99% would mark
        an agent measured at 99% as failing a requirement it appears to meet -
        indefensible to the person reading the row.

        `pct_bounded` marks a percentage that cannot exceed 100, where the margin is
        absolute points capped at 100 rather than relative. See the comment on
        PROMOTION_MARGIN_POINTS.
        """
        if pct_bounded:
            eff = min(100.0, threshold + (PROMOTION_MARGIN_POINTS if margin else 0.0))
        else:
            eff = threshold * (1 + margin)
        if integer:
            eff = math.ceil(eff - EPS)
        ok = value + EPS >= eff
        req = (
            f">= {_fmt(threshold, integer)}{unit}"
            if margin == 0
            else f">= {_fmt(eff, integer)}{unit} to earn ({_fmt(threshold, integer)}{unit} to hold)"
        )
        return req, ok

    def at_most(value: float, threshold: float, unit: str = "", integer: bool = False) -> tuple[str, bool]:
        """Upper bound. Same contract as at_least."""
        eff = threshold * (1 - margin)
        ok = value <= eff + EPS
        req = (
            f"<= {_fmt(threshold, integer)}{unit}"
            if margin == 0
            else f"<= {_fmt(eff, integer)}{unit} to earn ({_fmt(threshold, integer)}{unit} to hold)"
        )
        return req, ok

    def crit(
        label: str,
        requirement: str,
        value: str,
        ok: bool,
        blocking: bool,
        detail: Optional[str] = None,
        unknown: bool = False,
    ) -> GraduationCriterion:
        return GraduationCriterion(
            label=label,
            requirement=requirement,
            value=value,
            status="insufficient" if unknown else ("pass" if ok else ("fail" if blocking else "warning")),
            blocking=blocking,
            detail=detail,
            weight=CRITERION_WEIGHTS.get(label, 0.0),
            unknown=unknown,
        )

    if target is not None:
        t = THRESHOLDS[target]
        # With too few decisions the behavioural rates are ratios over a
        # near-empty denominator, so they are reported as UNKNOWN rather than
        # scored. This is the whole point of `sufficient_evidence`: an agent with
        # 3 logged decisions and a 0% error rate has not demonstrated anything.
        thin = not signals.sufficient_evidence
        thin_detail = "Rate computed over too few decisions to be meaningful." if thin else None

        req, ok = at_least(signals.decisions_in_scope, t["decisions"])
        criteria.append(crit(
            "Decisions in current scope", req, str(signals.decisions_in_scope), ok, True,
            detail="Not enough real decisions logged yet to judge readiness." if thin else None,
            unknown=thin,
        ))

        req, ok = at_least(signals.days_in_scope, t["days"], unit="d")
        criteria.append(crit(
            "Time at current level", req, f"{signals.days_in_scope}d", ok, True,
        ))

        criteria.append(crit(
            "Open incidents", "0", str(signals.open_incidents),
            signals.open_incidents == 0, True,
            detail="Counted from real incident records; an open incident blocks a step up outright.",
        ))

        req, ok = at_most(signals.incident_rate, t["maxIncidentRate"], unit="/1k")
        criteria.append(crit(
            "Incident rate", req, f"{signals.incident_rate}/1k", ok, False,
            detail=thin_detail, unknown=thin,
        ))

        # Error rate is UNKNOWN unless a real per-agent error signal is wired up.
        # `signals.error_rate` defaults to 0.0, and 0.0 tested against "<= 2%" would
        # pass - a clean bill of health on a dimension nothing measures. It is still
        # listed rather than hidden, so an operator can see what is missing.
        err_measured = signals.error_rate_measured and not thin
        req, ok = at_most(signals.error_rate, t["maxErrorRate"], unit="%")
        criteria.append(crit(
            "Error rate", req,
            f"{signals.error_rate}%" if err_measured else "not measured",
            ok, False,
            detail=(
                thin_detail if thin else
                None if err_measured else
                "No per-agent error signal is wired up yet, so this is reported as unknown rather than scored as a pass."
            ),
            unknown=not err_measured,
        ))

        req, ok = at_most(signals.guardrail_intervention_rate, t["maxGuardrail"], unit="%")
        criteria.append(crit(
            "Guardrail intervention rate", req, f"{signals.guardrail_intervention_rate}%", ok, False,
            detail=thin_detail, unknown=thin,
        ))

        req, ok = at_least(signals.agreement_rate, t["minAgreement"], unit="%", pct_bounded=True)
        falling = signals.agreement_trend == "falling"
        criteria.append(crit(
            "Human agreement rate", req,
            f"{signals.agreement_rate}% {'▲' if signals.agreement_trend == 'rising' else '▼' if falling else ''}".strip(),
            ok and not falling, True,
            detail=(
                "Not enough decisions to compute an agreement rate." if thin else
                "Agreement is trending down, which is an early misalignment signal - a step up is held regardless of the rate."
                if falling else
                "Reviewers approve nearly everything - oversight adds little marginal safety."
                if ok else
                "Reviewers still overturn enough proposals that the human is adding safety."
            ),
            unknown=thin,
        ))

        criteria.append(crit(
            "Active guardrail policy", "attached", "yes" if record.has_policy else "none",
            record.has_policy, True,
        ))

    # Step-down (from persisted ratchet) forces not_ready regardless.
    if record.ratchet.step_down_triggered:
        verdict = "not_ready"
    else:
        verdict = "ready" if target is None else _verdict_from(criteria)

    readiness, provenance = score_readiness(criteria)
    blocking_failures = [c.label for c in criteria if c.blocking and c.status == "fail"]

    if record.ratchet.step_down_triggered:
        summary = f"Stepped down: {record.ratchet.step_down_reason or 'adverse signal'}."
    elif target is None:
        summary = "At maximum autonomy (L4 Full Agency)."
    elif not signals.sufficient_evidence:
        summary = f"Insufficient evidence - {signals.decisions_in_scope} decisions logged so far."
    elif verdict == "ready":
        summary = f"Earned L{target}. {signals.agreement_rate}% agreement over {signals.days_in_scope}d, {signals.open_incidents} open incidents."
    elif verdict == "conditional":
        summary = f"Eligible for L{target} with monitoring - some criteria not yet met."
    else:
        summary = (
            f"Not yet ready for L{target} - blocked by "
            + ", ".join(blocking_failures)
            + "."
        ) if blocking_failures else f"Not yet ready for L{target}."

    return AgentGraduation(
        agent_id=record.agent_id, name=record.name, business_unit=record.business_unit,
        current_level=current, target_level=target, verdict=verdict, readiness=readiness,
        summary=summary, criteria=criteria, signals=signals, ratchet=record.ratchet,
        reviewer_hours_per_month=record.reviewer_hours_per_month,
        score_provenance=provenance, blocking_failures=blocking_failures,
    )
