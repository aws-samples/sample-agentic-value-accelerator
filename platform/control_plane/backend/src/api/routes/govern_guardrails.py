"""Govern Guardrails — real Bedrock Guardrails telemetry, aggregated across governed regions."""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from models.govern_guardrails import GuardrailTelemetryResponse
from models.guardrail import GuardrailTemplate
from services.govern_guardrails_service import GovernGuardrailsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/guardrails", tags=["govern-guardrails"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_guardrails", region_scope.MULTI_REGION, prefix="/govern/guardrails")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernGuardrailsService] = {}


def _svc_for(region: str) -> GovernGuardrailsService:
    if region not in _svcs:
        _svcs[region] = GovernGuardrailsService(region=region)
    return _svcs[region]


def _merge(results: List[Tuple[str, object]], days: int) -> GuardrailTelemetryResponse:
    guardrails: list = []
    by_policy: Dict[str, dict] = {}
    total_guardrails = total_invocations = total_interventions = with_metrics = 0
    total_blocked = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        guardrails.extend(d.get("guardrails", []))
        for p in d.get("by_policy") or []:
            pt = p.get("policy_type")
            entry = by_policy.get(pt)
            if entry is None:
                entry = by_policy[pt] = {
                    "policy_type": pt,
                    "label": p.get("label", ""),
                    "dimension": p.get("dimension", ""),
                    "interventions": 0,
                }
            entry["interventions"] += p.get("interventions", 0)
        total_guardrails += d.get("total_guardrails", 0)
        total_invocations += d.get("total_invocations", 0)
        total_interventions += d.get("total_interventions", 0)
        # Blocked is summed separately from interventions and never derived from it:
        # an intervention includes PII masking that still returned a response, so
        # reusing it as a block count overstates refusals.
        total_blocked += d.get("total_blocked", 0)
        with_metrics += d.get("guardrails_with_metrics", 0)
        live = live or bool(d.get("live"))

    merged_policy = sorted(by_policy.values(), key=lambda p: p["interventions"], reverse=True)
    rate = round((total_interventions / total_invocations * 100), 2) if total_invocations > 0 else 0.0
    n_live = live_region_count(results)
    return GuardrailTelemetryResponse(
        guardrails=guardrails,
        by_policy=merged_policy,
        total_guardrails=total_guardrails,
        total_invocations=total_invocations,
        total_interventions=total_interventions,
        total_blocked=total_blocked,
        intervention_rate_pct=rate,
        guardrails_with_metrics=with_metrics,
        window_days=days,
        live=live,
        source=f"bedrock-guardrails+cloudwatch ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


@router.get("/telemetry", response_model=GuardrailTelemetryResponse)
async def get_guardrail_telemetry(days: int = Query(default=30, ge=1, le=90), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock guardrail fleet + intervention telemetry, aggregated across governed regions.

    bedrock:ListGuardrails for the configured guardrails, plus CloudWatch
    AWS/Bedrock/Guardrails (Invocations / InvocationsIntervened) per-guardrail and
    per-policy-type (content, topics, words, PII, contextual grounding).
    """
    results = run_over_regions(lambda r: _svc_for(r).get_telemetry(days=days))
    return _merge(results, days)


@router.get("/list", response_model=List[GuardrailTemplate])
async def list_guardrails(_=Depends(require_role(Role.VIEWER))):
    """Live Bedrock guardrails as GuardrailTemplate records, aggregated across governed regions.

    bedrock:ListGuardrails + bedrock:GetGuardrail (DRAFT config) → the same shape the
    Secure module serves (content filters / PII / denied topics / grounding), so the
    Prompt Governance panel renders them directly. Bare JSON array; empty when there
    are none or the region is unreachable.
    """
    results = run_over_regions(lambda r: _svc_for(r).get_guardrails_list())
    out: List[GuardrailTemplate] = []
    for _region, resp in results:
        if resp:
            out.extend(resp)
    return out
