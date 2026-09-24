"""Govern Models — real Bedrock catalog + CloudWatch runtime metrics.

Read-through GET routes (no CRUD), aggregated across the governed-region set.

Every source behind these four routes is a tier-2 governed read (per-region
`bedrock:*` and CloudWatch `AWS/Bedrock`), so each one fans out with
`run_over_regions` and merges here. The merge is not a concatenation: Bedrock lists
the same model id, the same cross-region inference profile, and the same default
prompt router in every region that offers them, so a plain union would report one
model several times and inflate every total. Identity rules, one per route:

  catalog            -> dedupe by model_id, union capabilities, union regions
  runtime-metrics    -> sum counters by model_id, invocation-weight latency
  inference-profiles -> dedupe by profile id
  prompt-routers     -> dedupe by name (routers have no id)

Counters sum because each region's CloudWatch holds only the invocations made
through that region's endpoint. Catalog entries dedupe because availability is a
fact about a (model, region) pair, which the merged record keeps in
`available_regions` rather than discarding.
"""

import logging
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.multiregion import as_dict, is_live, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from models.govern_models import (
    FoundationModel,
    FoundationModelCatalog,
    InferenceProfile,
    InferenceProfilesResponse,
    ModelMetricsResponse,
    ModelRuntimeMetrics,
    PromptRouter,
    PromptRoutersResponse,
)
from services.govern_models_service import GovernModelsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/models", tags=["govern-models"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_models", region_scope.MULTI_REGION, prefix="/govern/models")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernModelsService] = {}

Results = List[Tuple[str, object]]


def _svc_for(region: str) -> GovernModelsService:
    if region not in _svcs:
        _svcs[region] = GovernModelsService(region=region)
    return _svcs[region]


def _union(*lists) -> List[str]:
    """Sorted union of string lists, skipping empties."""
    out = set()
    for lst in lists:
        out.update(lst or [])
    return sorted(out)


def _any_live(results: Results) -> bool:
    """live=True when at least one governed region measured something.

    Paired with `regions` on the response: `live` says the aggregate rests on real
    data somewhere, `regions.degraded` says where it does not.
    """
    return any(is_live(resp) for _r, resp in results)


# --- catalog ---------------------------------------------------------------


def _merge_catalog(results: Results) -> FoundationModelCatalog:
    """One row per model id, with the regions it is actually available in.

    Capability fields (modalities, inference types, streaming) union across regions:
    the merged catalog answers "what can this model do somewhere in the governed
    set". `lifecycle` is the deliberate exception and takes the *worst* value seen -
    it is a deprecation risk signal, not a capability, and a model that is LEGACY in
    one governed region needs to surface as LEGACY rather than be masked by a region
    that still reports it ACTIVE.
    """
    by_id: Dict[str, dict] = {}
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for m in d.get("models") or []:
            mid = m.get("model_id") or ""
            if not mid:
                continue
            entry = by_id.get(mid)
            if entry is None:
                # First sighting: copy verbatim so a single-region response keeps
                # AWS's own list ordering rather than being re-sorted for no reason.
                by_id[mid] = dict(m)
                continue
            for key in ("input_modalities", "output_modalities", "inference_types", "available_regions"):
                entry[key] = _union(entry.get(key), m.get(key))
            entry["streaming"] = bool(entry.get("streaming")) or bool(m.get("streaming"))
            if (m.get("lifecycle") or "ACTIVE") != "ACTIVE":
                entry["lifecycle"] = m.get("lifecycle")

    models = [FoundationModel(**m) for m in by_id.values()]
    models.sort(key=lambda m: (m.provider.lower(), m.name.lower()))
    n_live = live_region_count(results)
    return FoundationModelCatalog(
        models=models,
        total=len(models),
        providers=sorted({m.provider for m in models if m.provider}),
        active=sum(1 for m in models if m.lifecycle == "ACTIVE"),
        live=_any_live(results),
        source=f"bedrock-list-foundation-models ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


# --- runtime metrics -------------------------------------------------------

_SUMMED_METRIC_FIELDS = (
    "client_errors",
    "server_errors",
    "input_tokens",
    "output_tokens",
)

# Summed like the fields above, but Optional: None means the metric was not published
# in that region, which must not collapse to 0. Summing `int(x or 0)` across regions
# would turn "no region measured this" into a measured zero and assert a 0% cache hit
# rate nobody observed. A model is cache-measured if ANY region measured it.
_OPTIONAL_SUMMED_METRIC_FIELDS = (
    "cache_read_tokens",
    "cache_write_tokens",
)


def _merge_runtime_metrics(results: Results, days: int) -> ModelMetricsResponse:
    """Sum per-model counters across regions; invocation-weight the latencies.

    Latency is the only field that cannot be added, and averaging the per-region
    averages would let a region that served 10 calls move the mean as much as one
    that served 10,000. Each region contributes `avg_latency_ms * invocations`, and
    only when it recorded both - a region with no traffic has no latency to report,
    so its 0.0 must not enter the denominator.
    """
    agg: Dict[str, dict] = {}
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for m in d.get("by_model") or []:
            mid = m.get("model_id") or ""
            if not mid:
                continue
            b = agg.get(mid)
            if b is None:
                b = agg[mid] = {
                    "invocations": 0,
                    "lat_weighted": 0.0,
                    "lat_inv": 0,
                    "active_regions": [],
                    **{k: 0 for k in _SUMMED_METRIC_FIELDS},
                    # None until some region reports a real value.
                    **{k: None for k in _OPTIONAL_SUMMED_METRIC_FIELDS},
                }
            inv = int(m.get("invocations") or 0)
            b["invocations"] += inv
            for k in _SUMMED_METRIC_FIELDS:
                b[k] += int(m.get(k) or 0)
            for k in _OPTIONAL_SUMMED_METRIC_FIELDS:
                v = m.get(k)
                if v is None:
                    continue  # this region did not measure it; leave the running value alone
                b[k] = int(v) if b[k] is None else b[k] + int(v)
            lat = float(m.get("avg_latency_ms") or 0.0)
            if inv > 0 and lat > 0:
                b["lat_weighted"] += lat * inv
                b["lat_inv"] += inv
            b["active_regions"] = _union(b["active_regions"], m.get("active_regions"))

    by_model: List[ModelRuntimeMetrics] = []
    total_inv = 0
    total_err = 0
    fleet_lat_weighted = 0.0
    fleet_lat_inv = 0
    for mid, b in agg.items():
        inv = b["invocations"]
        errs = b["client_errors"] + b["server_errors"]
        lat = round(b["lat_weighted"] / b["lat_inv"], 1) if b["lat_inv"] > 0 else 0.0
        by_model.append(ModelRuntimeMetrics(
            model_id=mid,
            invocations=inv,
            avg_latency_ms=lat,
            client_errors=b["client_errors"],
            server_errors=b["server_errors"],
            input_tokens=b["input_tokens"],
            output_tokens=b["output_tokens"],
            cache_read_tokens=b["cache_read_tokens"],
            cache_write_tokens=b["cache_write_tokens"],
            error_rate_pct=round((errs / inv * 100), 2) if inv > 0 else 0.0,
            active_regions=b["active_regions"],
        ))
        total_inv += inv
        total_err += errs
        fleet_lat_weighted += b["lat_weighted"]
        fleet_lat_inv += b["lat_inv"]

    by_model.sort(key=lambda m: m.invocations, reverse=True)
    n_live = live_region_count(results)
    return ModelMetricsResponse(
        by_model=by_model,
        total_invocations=total_inv,
        # Weighted over invocations that actually reported a latency, so models with
        # traffic but no latency datapoint cannot dilute the fleet mean toward zero.
        avg_latency_ms=round(fleet_lat_weighted / fleet_lat_inv, 1) if fleet_lat_inv > 0 else 0.0,
        fleet_error_rate_pct=round(total_err / total_inv * 100, 2) if total_inv > 0 else 0.0,
        window_days=days,
        live=_any_live(results),
        source=f"cloudwatch-aws-bedrock ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


# --- inference profiles ----------------------------------------------------


def _merge_inference_profiles(results: Results) -> InferenceProfilesResponse:
    """Dedupe by profile id; keep both region senses distinct.

    `regions` is where a profile routes traffic to and comes straight from AWS;
    `available_regions` is which governed regions listed the profile. A system-defined
    `us.*` profile appears in every us-* region with an identical routing set, so
    unioning the two fields is right and summing `total` would not be.
    """
    by_id: Dict[str, dict] = {}
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for p in d.get("profiles") or []:
            pid = p.get("id") or ""
            if not pid:
                continue
            entry = by_id.get(pid)
            if entry is None:
                by_id[pid] = dict(p)
                continue
            entry["regions"] = _union(entry.get("regions"), p.get("regions"))
            entry["available_regions"] = _union(entry.get("available_regions"), p.get("available_regions"))
            entry["model_count"] = max(entry.get("model_count") or 0, p.get("model_count") or 0)

    profiles = [InferenceProfile(**p) for p in by_id.values()]
    profiles.sort(key=lambda p: (p.type, p.name.lower()))
    n_live = live_region_count(results)
    return InferenceProfilesResponse(
        profiles=profiles,
        total=len(profiles),
        system_defined=sum(1 for p in profiles if p.type == "SYSTEM_DEFINED"),
        application_defined=sum(1 for p in profiles if p.type == "APPLICATION_DEFINED"),
        live=_any_live(results),
        source=f"bedrock-list-inference-profiles ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


# --- prompt routers --------------------------------------------------------


def _merge_prompt_routers(results: Results) -> PromptRoutersResponse:
    """Dedupe by router name — ListPromptRouters exposes no id, and AWS default
    routers carry the same name in every region that offers them."""
    by_name: Dict[str, dict] = {}
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for r in d.get("routers") or []:
            name = r.get("name") or ""
            if not name:
                continue
            entry = by_name.get(name)
            if entry is None:
                by_name[name] = dict(r)
                continue
            entry["available_regions"] = _union(entry.get("available_regions"), r.get("available_regions"))
            entry["model_count"] = max(entry.get("model_count") or 0, r.get("model_count") or 0)

    routers = [PromptRouter(**r) for r in by_name.values()]
    routers.sort(key=lambda r: r.name.lower())
    n_live = live_region_count(results)
    return PromptRoutersResponse(
        routers=routers,
        total=len(routers),
        live=_any_live(results),
        source=f"bedrock-list-prompt-routers ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


# --- routes ----------------------------------------------------------------


@router.get("/catalog", response_model=FoundationModelCatalog)
async def get_catalog(provider: Optional[str] = Query(default=None, description="Filter by provider name, e.g. 'Anthropic'"), _=Depends(require_role(Role.VIEWER))):
    """Real Bedrock foundation-model catalog (bedrock:ListFoundationModels).

    Aggregated across governed regions and deduped by model id; each model carries
    the regions whose catalog lists it, because on-demand availability differs per
    region and a merged row must not imply account-wide availability.
    """
    results = run_over_regions(lambda r: _svc_for(r).get_catalog(provider=provider))
    return _merge_catalog(results)


@router.get("/runtime-metrics", response_model=ModelMetricsResponse)
async def get_runtime_metrics(days: int = Query(default=7, ge=1, le=30, description="Trailing window in days"), _=Depends(require_role(Role.VIEWER))):
    """Per-model runtime health from CloudWatch AWS/Bedrock (invocations, latency, errors, tokens).

    Counters sum across governed regions; latencies are invocation-weighted.
    """
    results = run_over_regions(lambda r: _svc_for(r).get_runtime_metrics(days=days))
    return _merge_runtime_metrics(results, days)


@router.get("/inference-profiles", response_model=InferenceProfilesResponse)
async def get_inference_profiles(_=Depends(require_role(Role.VIEWER))):
    """Real Bedrock inference profiles (bedrock:ListInferenceProfiles) — cross-region + application-defined routing."""
    results = run_over_regions(lambda r: _svc_for(r).get_inference_profiles())
    return _merge_inference_profiles(results)


@router.get("/prompt-routers", response_model=PromptRoutersResponse)
async def get_prompt_routers(_=Depends(require_role(Role.VIEWER))):
    """Real Bedrock intelligent prompt routers (bedrock:ListPromptRouters)."""
    results = run_over_regions(lambda r: _svc_for(r).get_prompt_routers())
    return _merge_prompt_routers(results)
