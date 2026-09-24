"""Deterministic mapping of catalog use-case evidence to prioritization scores.

``score_preseed(use_case, context)`` is a **pure** function (no randomness, no
time, no I/O): identical inputs always yield identical outputs, and every emitted
sub-criterion score is an integer in ``[1, 5]``. Missing evidence yields the
neutral score ``3`` — matching the prioritization tool's own defaults — so the
mapping is total (Req 7.2, 7.3, Correctness Property 5).

``context`` is a plain dict resolved from the catalog carrying the related
records for a use case:
    {
      "solutions":  [ {solution dict}, ... ],
      "value_levers": [ {value_lever dict}, ... ],
      "kpis": [ ... ],
      "data_assets": [ {data_asset dict, "current_readiness": <edge text>}, ... ],
      "technology_components": [ ... ],
      "business_domain": {business_domain dict} | None,
    }
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from models.prioritization import (
    BusinessValueScores,
    CostEfficiencyScores,
    OrgReadinessScores,
    RiskGovernanceScores,
    Scores,
    StrategicAlignmentScores,
    TechnicalFeasibilityScores,
)

NEUTRAL = 3


# ---------------------------------------------------------------------------
# Banding helpers (all pure, all total)
# ---------------------------------------------------------------------------


def _clamp(n: int) -> int:
    return max(1, min(5, int(n)))


def band01_to_5(x: Optional[float]) -> int:
    """Map a 0-100 score to 1-5 by fixed thresholds; None -> neutral 3."""
    if x is None:
        return NEUTRAL
    if x < 20:
        return 1
    if x < 40:
        return 2
    if x < 60:
        return 3
    if x < 80:
        return 4
    return 5


def currency_band(amount: Optional[float]) -> int:
    """Map a currency magnitude to 1-5 by fixed bands; None -> neutral 3."""
    if amount is None:
        return NEUTRAL
    a = abs(amount)
    if a < 250_000:
        return 1
    if a < 1_000_000:
        return 2
    if a < 5_000_000:
        return 3
    if a < 25_000_000:
        return 4
    return 5


def inverse_count_band(n: Optional[int]) -> int:
    """Fewer required components -> higher (easier) score. None -> neutral 3."""
    if n is None:
        return NEUTRAL
    if n <= 1:
        return 5
    if n <= 3:
        return 4
    if n <= 6:
        return 3
    if n <= 10:
        return 2
    return 1


def inverse_months_band(months: Optional[float]) -> int:
    """Shorter payback -> higher score. None -> neutral 3."""
    if months is None:
        return NEUTRAL
    if months <= 6:
        return 5
    if months <= 12:
        return 4
    if months <= 24:
        return 3
    if months <= 36:
        return 2
    return 1


# Categorical scales (higher risk -> lower score). Unknown keys -> neutral 3.
_RISK_LEVEL = {"low": 5, "medium": 3, "moderate": 3, "high": 2, "critical": 1}
_COMPLEXITY = {"low": 4, "medium": 3, "moderate": 3, "high": 2, "very high": 1}
_READINESS_TEXT = {
    "fit for planned use": 5, "usable with controls": 4, "target": 4,
    "target for pilot": 4, "interim": 3, "partial": 2,
    "remediation in progress": 2, "remediation required": 1,
}


def _cat(mapping: Dict[str, int], value: Optional[str]) -> int:
    if not value:
        return NEUTRAL
    return mapping.get(str(value).strip().lower(), NEUTRAL)


def _risk_to_score(level: Optional[str]) -> int:
    """Risk level -> score where higher risk means a LOWER (worse) score."""
    return _cat(_RISK_LEVEL, level)


def _bool(v: Any) -> bool:
    return bool(v) if v is not None else False


# ---------------------------------------------------------------------------
# Aggregation helpers over context lists
# ---------------------------------------------------------------------------


def _first(items: Optional[List[dict]]) -> Optional[dict]:
    return items[0] if items else None


def _max_currency(levers: List[dict], key: str) -> Optional[float]:
    vals = [l.get(key) for l in levers if l.get(key) is not None]
    return max(vals) if vals else None


# ---------------------------------------------------------------------------
# The mapper
# ---------------------------------------------------------------------------


def score_preseed(use_case: Dict[str, Any], context: Dict[str, Any]) -> Scores:
    solutions: List[dict] = context.get("solutions") or []
    levers: List[dict] = context.get("value_levers") or []
    data_assets: List[dict] = context.get("data_assets") or []
    tech: List[dict] = context.get("technology_components") or []
    domain: Optional[dict] = context.get("business_domain")

    solution = _first(solutions)

    # --- business_value ---------------------------------------------------
    benefit = solution.get("benefit_base") if solution else None
    lever_value = _max_currency(levers, "financial_value_base")
    revenue_impact = max(currency_band(benefit), currency_band(lever_value))
    run_cost = solution.get("run_cost_annual") if solution else None
    cost_savings = currency_band(lever_value if lever_value is not None else run_cost)
    business_value = BusinessValueScores(
        revenue_impact=_clamp(revenue_impact),
        cost_savings=_clamp(cost_savings),
        # productivity / cx / scalability lean on domain value potential.
        productivity_gains=band01_to_5(domain.get("value_potential_score") if domain else None),
        customer_experience=NEUTRAL,
        # A shared enabler scales broadly; absent that signal, stay neutral.
        scalability_potential=(5 if (solution and _bool(solution.get("shared_enabler_flag"))) else NEUTRAL),
    )

    # --- technical_feasibility -------------------------------------------
    # data readiness: min over required data assets of (quality/completeness,
    # edge current_readiness text).
    da_scores: List[int] = []
    for da in data_assets:
        q = da.get("quality_score")
        c = da.get("completeness_score")
        readiness_text = da.get("current_readiness")
        parts = [band01_to_5(q), band01_to_5(c), _cat(_READINESS_TEXT, readiness_text)]
        # ignore neutral placeholders from missing q/c so text can dominate
        da_scores.append(min(parts))
    data_readiness = min(da_scores) if da_scores else NEUTRAL
    technical = TechnicalFeasibilityScores(
        data_readiness=_clamp(data_readiness),
        technical_complexity=_cat(_COMPLEXITY, use_case.get("complexity")),
        integration_requirements=inverse_count_band(len(tech) if tech else None),
        time_to_value=inverse_months_band(solution.get("expected_payback_months") if solution else None),
        talent_availability=NEUTRAL,
    )

    # --- risk_governance (higher risk -> lower score) --------------------
    pii = any(_bool(da.get("pii_flag")) for da in data_assets)
    privacy_base = _risk_to_score(use_case.get("privacy_risk"))
    data_privacy = _clamp(min(privacy_base, 2) if pii else privacy_base)
    # Autonomy risk: only diverge from neutral when the use case actually carries
    # HITL/override evidence (missing evidence -> neutral 3, per Req 7 defaults).
    if use_case.get("human_in_loop_required") is None and use_case.get("override_allowed") is None:
        autonomous = NEUTRAL
    else:
        hitl = _bool(use_case.get("human_in_loop_required"))
        override = _bool(use_case.get("override_allowed"))
        autonomous = 5 if (hitl and override) else (4 if hitl else 2)
    risk = RiskGovernanceScores(
        regulatory_compliance=_risk_to_score(use_case.get("risk_tier")),
        data_privacy_security=data_privacy,
        ethical_bias_risk=_risk_to_score(use_case.get("bias_risk")),
        model_reliability=_risk_to_score(use_case.get("model_risk")),
        autonomous_decision_risk=_clamp(autonomous),
    )

    # --- org_readiness ----------------------------------------------------
    org = OrgReadinessScores(
        data_infrastructure=band01_to_5(domain.get("data_readiness_score") if domain else None),
        process_maturity=band01_to_5(domain.get("technology_readiness_score") if domain else None),
        change_management=NEUTRAL,
        executive_sponsorship=band01_to_5(domain.get("executive_sponsorship_score") if domain else None),
        cross_functional_collab=NEUTRAL,
    )

    # --- strategic_alignment ---------------------------------------------
    has_objective = bool(domain and domain.get("strategic_objective"))
    strategic = StrategicAlignmentScores(
        mission_criticality=band01_to_5(domain.get("value_potential_score") if domain else None),
        competitive_advantage=(4 if has_objective else NEUTRAL),
        innovation_potential=band01_to_5(domain.get("overall_priority_score") if domain else None),
    )

    # --- cost_efficiency (lower cost/faster payback -> higher score) -----
    invest = solution.get("investment_base") if solution else None
    # invert currency band: cheaper -> higher score.
    implementation_cost = _clamp(6 - currency_band(invest)) if invest is not None else NEUTRAL
    ongoing_cost = _clamp(6 - currency_band(run_cost)) if run_cost is not None else NEUTRAL
    cost = CostEfficiencyScores(
        implementation_cost=implementation_cost,
        ongoing_operational_cost=ongoing_cost,
        roi_timeline=inverse_months_band(solution.get("expected_payback_months") if solution else None),
    )

    return Scores(
        business_value=business_value,
        technical_feasibility=technical,
        risk_governance=risk,
        org_readiness=org,
        strategic_alignment=strategic,
        cost_efficiency=cost,
    )
