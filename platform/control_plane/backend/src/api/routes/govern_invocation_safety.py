"""Govern Invocation Safety — live runtime safety telemetry, read-through GET route.

Aggregates the account's Bedrock model-invocation logs (via CloudWatch Logs
Insights) into safety signals: guardrail-intervention rate, stop-reason mix,
token throughput, per-model breakdown, daily trend. Aggregates only — no raw
prompt/response content or caller identities.

Telemetry is aggregated across the governed-region set (core.region_config): each
region is queried independently and the per-region responses are summed into one
account-wide view. With a single governed region this is a pass-through.
"""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from models.govern_invocation_safety import InvocationRecordsResponse, InvocationSafetyResponse
from services.govern_invocation_safety_service import GovernInvocationSafetyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/invocation-safety", tags=["govern-invocation-safety"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_invocation_safety", region_scope.MULTI_REGION, prefix="/govern/invocation-safety")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernInvocationSafetyService] = {}


def _svc_for(region: str) -> GovernInvocationSafetyService:
    if region not in _svcs:
        _svcs[region] = GovernInvocationSafetyService(region=region)
    return _svcs[region]


def _merge(results: List[Tuple[str, object]], days: int) -> InvocationSafetyResponse:
    total_calls = completion_calls = guardrail_intervened = 0
    input_tokens = output_tokens = 0
    stop_reasons: Dict[str, int] = {}
    by_model: Dict[str, dict] = {}
    trend: Dict[str, dict] = {}
    logging_enabled = False

    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        total_calls += d.get("total_calls", 0)
        completion_calls += d.get("completion_calls", 0)
        guardrail_intervened += d.get("guardrail_intervened", 0)
        input_tokens += d.get("input_tokens", 0)
        output_tokens += d.get("output_tokens", 0)
        logging_enabled = logging_enabled or bool(d.get("logging_enabled"))

        for sr in d.get("stop_reasons") or []:
            reason = sr.get("reason")
            if not reason:
                continue
            stop_reasons[reason] = stop_reasons.get(reason, 0) + sr.get("count", 0)

        for m in d.get("by_model") or []:
            mid = m.get("model_id")
            entry = by_model.setdefault(mid, {"model_id": mid, "calls": 0, "guardrail_intervened": 0})
            entry["calls"] += m.get("calls", 0)
            entry["guardrail_intervened"] += m.get("guardrail_intervened", 0)

        for p in d.get("trend") or []:
            date = p.get("date")
            entry = trend.setdefault(date, {"date": date, "calls": 0, "guardrail_intervened": 0})
            entry["calls"] += p.get("calls", 0)
            entry["guardrail_intervened"] += p.get("guardrail_intervened", 0)

    # Recompute the rate from summed numerator/denominator — never average per-region rates.
    rate = round((guardrail_intervened / completion_calls * 100), 2) if completion_calls > 0 else 0.0
    n_live = live_region_count(results)
    return InvocationSafetyResponse(
        window_days=days,
        total_calls=total_calls,
        completion_calls=completion_calls,
        guardrail_intervened=guardrail_intervened,
        intervention_rate_pct=rate,
        stop_reasons=[{"reason": r, "count": c} for r, c in stop_reasons.items()],
        by_model=list(by_model.values()),
        trend=sorted(trend.values(), key=lambda x: x["date"]),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        log_group=None,  # Redacted: log group name can reveal internal naming
        logging_enabled=logging_enabled,
        live=total_calls > 0,
        source=f"bedrock-invocation-logs ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_records(results: List[Tuple[str, object]], days: int, limit: int) -> InvocationRecordsResponse:
    """Combine per-region metadata rows into one timestamp-desc, limit-capped view.

    METADATA ONLY — the per-region records carry no prompt/response content, so the
    merge simply concatenates, sorts by time, and caps at the requested limit.
    """
    records: List[dict] = []
    logging_enabled = False
    truncated = False
    live = False

    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        logging_enabled = logging_enabled or bool(d.get("logging_enabled"))
        truncated = truncated or bool(d.get("truncated"))
        live = live or bool(d.get("live"))
        records.extend(d.get("records") or [])

    # Newest first across all regions, then cap at the requested limit.
    records.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
    if len(records) > limit:
        records = records[:limit]
        truncated = True

    n_live = live_region_count(results)
    return InvocationRecordsResponse(
        window_days=days,
        records=records,
        count=len(records),
        truncated=truncated,
        log_group=None,  # Redacted: log group name can reveal internal naming
        logging_enabled=logging_enabled,
        live=live,
        # Not "mock" when nothing is live: the merged payload carries no records in that
        # case, so there is no illustrative data for the label to refer to. The specific
        # reason per region is already in `note` (merge_note) and `regions` (provenance).
        source=f"bedrock-invocation-logs ({n_live} region(s))" if live else "unavailable-fallback",
        note=merge_note(results),
        regions=provenance(results),
    )


@router.get("/telemetry", response_model=InvocationSafetyResponse)
def get_invocation_safety(days: int = Query(default=7, ge=1, le=30), _=Depends(require_role(Role.VIEWER))):
    """Live runtime safety telemetry from Bedrock invocation logs, aggregated across governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_telemetry(days=days))
    return _merge(results, days)


@router.get("/invocations", response_model=InvocationRecordsResponse)
def get_invocation_records(
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
):
    """Per-invocation METADATA rows (never prompt/response content) from Bedrock invocation logs.

    Aggregated across governed regions: each region is queried independently and the
    per-region rows are merged newest-first and capped at `limit`.
    """
    results = run_over_regions(lambda r: _svc_for(r).get_invocations(days=days, limit=limit))
    return _merge_records(results, days, limit)
