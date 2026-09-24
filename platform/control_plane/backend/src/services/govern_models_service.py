"""Govern Models service — real Bedrock catalog + CloudWatch runtime metrics.

Read-through (no DynamoDB). Two live AWS sources:
  - bedrock:ListFoundationModels  → the model catalog
  - cloudwatch AWS/Bedrock        → per-model runtime health (invocations,
    latency, errors, tokens)

Follows the govern_cost slice convention: lazy boto3 clients, honest
live/source/note flags, graceful live=False fallback that never raises.

CloudWatch note: the model dimension is `ModelId`, and the SAME logical model
appears under both a bare id (`anthropic.claude-...`) and a cross-region id
(`us.anthropic.claude-...`). We normalize by stripping a leading region prefix
so both roll up into one model row.

Region scope: one instance reads exactly one region. Every record it emits is
stamped with that region (`available_regions` / `active_regions`) so the route can
fan out over the governed set and merge without having to guess where a row came
from. Callers wanting the whole governed set go through api/routes/govern_models.py,
which owns the fan-out and the merge.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load
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

logger = logging.getLogger(__name__)

# Read-through cache TTLs (seconds). The catalog barely changes; runtime metrics
# move slowly over a multi-day window — short TTLs keep repeat page loads instant.
_CATALOG_TTL = 900   # 15 min
_METRICS_TTL = 120   # 2 min
_ROUTING_TTL = 900   # 15 min — profiles/routers change rarely

# CloudWatch AWS/Bedrock metric names we roll up per model.
_METRICS = {
    "Invocations": "Sum",
    "InvocationLatency": "Average",
    "InvocationClientErrors": "Sum",
    "InvocationServerErrors": "Sum",
    "InputTokenCount": "Sum",
    "OutputTokenCount": "Sum",
    "CacheReadInputTokenCount": "Sum",
    "CacheWriteInputTokenCount": "Sum",
}

# Leading cross-region inference prefix, e.g. "us.anthropic..." or
# "global.anthropic..." -> "anthropic...".
_REGION_PREFIX = re.compile(r"^(us|eu|apac|us-gov|global)\.")


def _canonical_model_id(model_id: str) -> str:
    """Reduce a raw CloudWatch ModelId to one region-agnostic canonical id.

    Strips a full model/inference-profile ARN down to its bare id
    (`arn:aws:bedrock:...:foundation-model/anthropic.claude-...` ->
    `anthropic.claude-...`), then removes a leading cross-region prefix
    (us./eu./apac./us-gov./global.) so every regional and ARN form of one
    logical model rolls up into a single row instead of double-counting.
    """
    if model_id and "/" in model_id:
        model_id = model_id.split("/", 1)[1]
    return _REGION_PREFIX.sub("", model_id)


def _region_from_model_arn(model_arn: str) -> Optional[str]:
    """Parse the region out of a model ARN: arn:aws:bedrock:REGION:acct:... .

    Foundation-model ARNs carry no account (`arn:aws:bedrock:us-east-1::…`),
    inference-profile ARNs do — both keep the region at colon-index 3.
    """
    parts = (model_arn or "").split(":")
    return parts[3] if len(parts) > 3 and parts[3] else None


def _shorten_model_ref(model_arn: str) -> str:
    """Reduce a model/profile ARN to its bare id so no account id is exposed.

    `arn:aws:bedrock:us-east-1:123:inference-profile/us.amazon.nova-pro-v1:0`
    → `us.amazon.nova-pro-v1:0`; a bare id is returned unchanged.
    """
    if model_arn and "/" in model_arn:
        return model_arn.split("/", 1)[1]
    return model_arn


def _with_cache_note(result, cached_at: float):
    """Stamp an honest 'cached as of' age onto a live response's note.

    Only annotates live results served from cache (age > ~2s); fresh loads and
    non-live fallbacks are returned untouched so their own note is preserved.
    """
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    # ttl_cache hands back the object it still holds, so mutating result.note
    # would append a stamp per hit and grow the cached note without bound.
    # model_copy swaps only this top-level scalar, leaving the cache entry intact.
    note = f"{result.note} · {stamp}" if result.note else stamp
    return result.model_copy(update={"note": note})


class GovernModelsService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._bedrock = None
        self._cw = None

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def _cw_client(self):
        if self._cw is None:
            self._cw = boto3.client("cloudwatch", region_name=self.region)
        return self._cw

    def get_catalog(self, provider: Optional[str] = None) -> FoundationModelCatalog:
        """Cached wrapper around the live Bedrock catalog fetch (15 min TTL)."""
        key = f"models:catalog:{self.region}:{provider or 'all'}"
        result, cached_at = get_or_load(
            key, _CATALOG_TTL, lambda: self._fetch_catalog(provider),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_catalog(self, provider: Optional[str] = None) -> FoundationModelCatalog:
        """Real Bedrock foundation-model catalog (bedrock:ListFoundationModels).

        provider: optional case-insensitive filter on providerName.
        """
        try:
            resp = self._bedrock_client().list_foundation_models()
            summaries = resp.get("modelSummaries", [])
            models: list[FoundationModel] = []
            for s in summaries:
                pname = s.get("providerName", "") or ""
                if provider and pname.lower() != provider.lower():
                    continue
                models.append(FoundationModel(
                    model_id=s.get("modelId", ""),
                    name=s.get("modelName", s.get("modelId", "")),
                    provider=pname,
                    input_modalities=s.get("inputModalities", []) or [],
                    output_modalities=s.get("outputModalities", []) or [],
                    streaming=bool(s.get("responseStreamingSupported", False)),
                    inference_types=s.get("inferenceTypesSupported", []) or [],
                    lifecycle=(s.get("modelLifecycle", {}) or {}).get("status", "ACTIVE"),
                    available_regions=[self.region],
                ))
            models.sort(key=lambda m: (m.provider.lower(), m.name.lower()))
            providers = sorted({m.provider for m in models if m.provider})
            active = sum(1 for m in models if m.lifecycle == "ACTIVE")
            return FoundationModelCatalog(
                models=models, total=len(models), providers=providers, active=active,
                live=True, source="bedrock-list-foundation-models",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListFoundationModels unavailable, returning fallback catalog: %s", e)
            return FoundationModelCatalog(
                models=[], total=0, providers=[], active=0,
                live=False, source="unavailable-fallback",
                note="Bedrock unreachable or bedrock:ListFoundationModels not granted.",
            )

    def get_runtime_metrics(self, days: int = 7) -> ModelMetricsResponse:
        """Cached wrapper around the live CloudWatch metrics fetch (5 min TTL)."""
        key = f"models:runtime:{self.region}:{days}"
        result, cached_at = get_or_load(
            key, _METRICS_TTL, lambda: self._fetch_runtime_metrics(days),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_runtime_metrics(self, days: int = 7) -> ModelMetricsResponse:
        """Per-model runtime metrics from CloudWatch AWS/Bedrock over the window.

        Discovers the models emitting metrics (list_metrics on Invocations),
        then batch-pulls each metric per ModelId via get_metric_data. Rolls up
        cross-region + bare ids into a single canonical model row.
        """
        try:
            cw = self._cw_client()
            # 1) Discover which ModelId dimensions actually emit Invocations.
            model_ids: set[str] = set()
            paginator = cw.get_paginator("list_metrics")
            for page in paginator.paginate(Namespace="AWS/Bedrock", MetricName="Invocations"):
                for m in page.get("Metrics", []):
                    for d in m.get("Dimensions", []):
                        if d.get("Name") == "ModelId" and d.get("Value"):
                            model_ids.add(d["Value"])
            if not model_ids:
                return ModelMetricsResponse(
                    by_model=[], window_days=days, live=False, source="no-data",
                    note="No AWS/Bedrock ModelId metrics found — no model invocations in this account yet.",
                )

            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)  # single bucket over the whole window

            # 2) Build one query per (raw model id, metric).
            raw_ids = sorted(model_ids)
            queries = []
            qid_map: dict[str, tuple[str, str]] = {}  # query id -> (raw_id, metric)
            for i, rid in enumerate(raw_ids):
                for j, (metric, stat) in enumerate(_METRICS.items()):
                    qid = f"m{i}_{j}"
                    qid_map[qid] = (rid, metric)
                    queries.append({
                        "Id": qid,
                        "MetricStat": {
                            "Metric": {
                                "Namespace": "AWS/Bedrock",
                                "MetricName": metric,
                                "Dimensions": [{"Name": "ModelId", "Value": rid}],
                            },
                            "Period": period,
                            "Stat": stat,
                        },
                        "ReturnData": True,
                    })

            # 3) get_metric_data caps at 500 queries per call — chunk defensively.
            results: dict[str, float] = {}
            # Query ids whose metric returned at least one datapoint. CloudWatch returns
            # an EMPTY Values list both for "this metric summed to zero" and for "this
            # metric was never published for this model" — and for the cache metrics
            # those mean opposite things. A model that has never had prompt caching
            # requested publishes no CacheReadInputTokenCount at all; reporting that as
            # a measured 0 asserts a 0% cache hit rate was observed, when nothing was.
            # Tracked here so the cache fields can be None rather than a fabricated 0.
            with_data: set[str] = set()
            for k in range(0, len(queries), 450):
                chunk = queries[k:k + 450]
                resp = cw.get_metric_data(MetricDataQueries=chunk, StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0
                    if vals:
                        with_data.add(r["Id"])

            # 4) Roll up per canonical model id. Organize the raw per-(id, metric)
            #    results first so latency can be invocation-weighted correctly.
            per_rid: dict[str, dict[str, float]] = {}
            # Metric names that returned data for at least one raw id rolling up to a
            # given canonical model. A canonical model can merge several raw ids (e.g.
            # regional and cross-region copies of one model), and it counts as measured
            # if ANY of them published the metric.
            measured: dict[str, set[str]] = {}
            for qid, (rid, metric) in qid_map.items():
                per_rid.setdefault(rid, {})[metric] = results.get(qid, 0.0)
                if qid in with_data:
                    measured.setdefault(_canonical_model_id(rid), set()).add(metric)

            agg: dict[str, dict[str, float]] = {}
            for rid, rid_metrics in per_rid.items():
                canon = _canonical_model_id(rid)
                bucket = agg.setdefault(canon, {})
                rid_inv = rid_metrics.get("Invocations", 0.0)
                for metric, val in rid_metrics.items():
                    if metric == "InvocationLatency":
                        continue
                    bucket[metric] = bucket.get(metric, 0.0) + val
                # InvocationLatency is a per-raw-id Average, so pool it as an
                # invocation-weighted mean — and only over raw ids that actually
                # served traffic and returned a latency, so a zero-traffic id's
                # 0.0 average can't dilute the merged model's latency.
                lat_avg = rid_metrics.get("InvocationLatency", 0.0)
                if rid_inv > 0 and lat_avg > 0:
                    bucket["_lat_weighted"] = bucket.get("_lat_weighted", 0.0) + lat_avg * rid_inv
                    bucket["_lat_inv"] = bucket.get("_lat_inv", 0.0) + rid_inv

            by_model: list[ModelRuntimeMetrics] = []
            total_inv = 0
            total_err = 0
            lat_weighted_sum = 0.0
            for canon, b in agg.items():
                inv = int(b.get("Invocations", 0))
                cerr = int(b.get("InvocationClientErrors", 0))
                serr = int(b.get("InvocationServerErrors", 0))
                # latency: invocation-weighted mean over the raw ids that served traffic
                lat_inv = b.get("_lat_inv", 0.0)
                lat = round(b.get("_lat_weighted", 0.0) / lat_inv, 1) if lat_inv > 0 else 0.0
                errs = cerr + serr
                by_model.append(ModelRuntimeMetrics(
                    model_id=canon,
                    invocations=inv,
                    avg_latency_ms=lat,
                    client_errors=cerr,
                    server_errors=serr,
                    input_tokens=int(b.get("InputTokenCount", 0)),
                    output_tokens=int(b.get("OutputTokenCount", 0)),
                    # None when CloudWatch published no datapoint for the metric, i.e.
                    # prompt caching was never exercised on this model in this window.
                    # Distinct from 0, which would claim a cache hit rate of 0% was
                    # measured. The UI renders None as "not measured".
                    cache_read_tokens=(
                        int(b.get("CacheReadInputTokenCount", 0))
                        if "CacheReadInputTokenCount" in measured.get(canon, ())
                        else None
                    ),
                    cache_write_tokens=(
                        int(b.get("CacheWriteInputTokenCount", 0))
                        if "CacheWriteInputTokenCount" in measured.get(canon, ())
                        else None
                    ),
                    error_rate_pct=round((errs / inv * 100), 2) if inv > 0 else 0.0,
                    # Only when traffic was actually recorded: a ModelId dimension can
                    # exist in this region's CloudWatch from an older window and report
                    # zero over this one, which is not "active here".
                    active_regions=[self.region] if inv > 0 else [],
                ))
                total_inv += inv
                total_err += errs
                lat_weighted_sum += lat * inv

            by_model.sort(key=lambda m: m.invocations, reverse=True)
            fleet_lat = round(lat_weighted_sum / total_inv, 1) if total_inv > 0 else 0.0
            fleet_err = round(total_err / total_inv * 100, 2) if total_inv > 0 else 0.0
            return ModelMetricsResponse(
                by_model=by_model,
                total_invocations=total_inv,
                avg_latency_ms=fleet_lat,
                fleet_error_rate_pct=fleet_err,
                window_days=days,
                live=True,
                source="cloudwatch-aws-bedrock",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch AWS/Bedrock metrics unavailable, returning fallback: %s", e)
            return ModelMetricsResponse(
                by_model=[], window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch unreachable or cloudwatch:GetMetricData not granted.",
            )

    def get_inference_profiles(self) -> InferenceProfilesResponse:
        """Cached wrapper around the live inference-profile fetch (15 min TTL)."""
        key = f"models:inference-profiles:{self.region}"
        result, cached_at = get_or_load(
            key, _ROUTING_TTL, self._fetch_inference_profiles,
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_inference_profiles(self) -> InferenceProfilesResponse:
        """Real Bedrock inference profiles (bedrock:ListInferenceProfiles).

        Cross-region system-defined + application-defined profiles. The routed
        regions are parsed from each target model's ARN.
        """
        try:
            bedrock = self._bedrock_client()
            summaries: list[dict] = []
            next_token: Optional[str] = None
            while True:
                kwargs: dict = {"maxResults": 100}
                if next_token:
                    kwargs["nextToken"] = next_token
                resp = bedrock.list_inference_profiles(**kwargs)
                summaries.extend(resp.get("inferenceProfileSummaries", []) or [])
                next_token = resp.get("nextToken")
                if not next_token:
                    break

            profiles: list[InferenceProfile] = []
            for s in summaries:
                models = s.get("models", []) or []
                regions: list[str] = []
                for m in models:
                    r = _region_from_model_arn(m.get("modelArn", "") or "")
                    if r and r not in regions:
                        regions.append(r)
                profiles.append(InferenceProfile(
                    id=s.get("inferenceProfileId", ""),
                    name=s.get("inferenceProfileName", s.get("inferenceProfileId", "")),
                    arn=mask_account_id(s.get("inferenceProfileArn")),
                    description=s.get("description"),
                    type=s.get("type", "") or "",
                    status=s.get("status", "") or "",
                    model_count=len(models),
                    regions=sorted(regions),
                    available_regions=[self.region],
                ))
            profiles.sort(key=lambda p: (p.type, p.name.lower()))
            system_defined = sum(1 for p in profiles if p.type == "SYSTEM_DEFINED")
            application_defined = sum(1 for p in profiles if p.type == "APPLICATION_DEFINED")
            return InferenceProfilesResponse(
                profiles=profiles, total=len(profiles),
                system_defined=system_defined, application_defined=application_defined,
                live=True, source="bedrock-list-inference-profiles",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListInferenceProfiles unavailable, returning fallback: %s", e)
            return InferenceProfilesResponse(
                profiles=[], total=0, system_defined=0, application_defined=0,
                live=False, source="unavailable-fallback",
                note="Bedrock unreachable or bedrock:ListInferenceProfiles not granted.",
            )

    def get_prompt_routers(self) -> PromptRoutersResponse:
        """Cached wrapper around the live prompt-router fetch (15 min TTL)."""
        key = f"models:prompt-routers:{self.region}"
        result, cached_at = get_or_load(
            key, _ROUTING_TTL, self._fetch_prompt_routers,
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_prompt_routers(self) -> PromptRoutersResponse:
        """Real Bedrock intelligent prompt routers (bedrock:ListPromptRouters).

        The fallback model ARN is shortened to a bare model id so no account id
        is surfaced to the UI.
        """
        try:
            bedrock = self._bedrock_client()
            summaries: list[dict] = []
            next_token: Optional[str] = None
            while True:
                kwargs: dict = {"maxResults": 100}
                if next_token:
                    kwargs["nextToken"] = next_token
                resp = bedrock.list_prompt_routers(**kwargs)
                summaries.extend(resp.get("promptRouterSummaries", []) or [])
                next_token = resp.get("nextToken")
                if not next_token:
                    break

            routers: list[PromptRouter] = []
            for s in summaries:
                models = s.get("models", []) or []
                fallback_arn = (s.get("fallbackModel") or {}).get("modelArn")
                routers.append(PromptRouter(
                    name=s.get("promptRouterName", "") or "",
                    arn=mask_account_id(s.get("promptRouterArn")),
                    description=s.get("description"),
                    status=s.get("status", "") or "",
                    type=s.get("type", "") or "",
                    model_count=len(models),
                    fallback_model=_shorten_model_ref(fallback_arn) if fallback_arn else None,
                    available_regions=[self.region],
                ))
            routers.sort(key=lambda r: r.name.lower())
            return PromptRoutersResponse(
                routers=routers, total=len(routers),
                live=True, source="bedrock-list-prompt-routers",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListPromptRouters unavailable, returning fallback: %s", e)
            return PromptRoutersResponse(
                routers=[], total=0,
                live=False, source="unavailable-fallback",
                note="Bedrock unreachable or bedrock:ListPromptRouters not granted.",
            )
