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
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_models import (
    FoundationModel,
    FoundationModelCatalog,
    ModelMetricsResponse,
    ModelRuntimeMetrics,
)

logger = logging.getLogger(__name__)

# Read-through cache TTLs (seconds). The catalog barely changes; runtime metrics
# move slowly over a multi-day window — short TTLs keep repeat page loads instant.
_CATALOG_TTL = 900   # 15 min
_METRICS_TTL = 120   # 2 min

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

# Leading cross-region inference prefix, e.g. "us.anthropic..." -> "anthropic..."
_REGION_PREFIX = re.compile(r"^(us|eu|apac|us-gov)\.")


def _canonical_model_id(model_id: str) -> str:
    return _REGION_PREFIX.sub("", model_id)


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
    result.note = f"{result.note} · {stamp}" if result.note else stamp
    return result


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
            for k in range(0, len(queries), 450):
                chunk = queries[k:k + 450]
                resp = cw.get_metric_data(MetricDataQueries=chunk, StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0

            # 4) Roll up per canonical model id.
            agg: dict[str, dict[str, float]] = {}
            for qid, (rid, metric) in qid_map.items():
                canon = _canonical_model_id(rid)
                bucket = agg.setdefault(canon, {})
                bucket[metric] = bucket.get(metric, 0.0) + results.get(qid, 0.0)
                # latency is an average — track weighted-ish by keeping max/mean later
                if metric == "InvocationLatency":
                    bucket.setdefault("_lat_samples", 0.0)
                    bucket["_lat_samples"] += 1

            by_model: list[ModelRuntimeMetrics] = []
            total_inv = 0
            total_err = 0
            lat_weighted_sum = 0.0
            for canon, b in agg.items():
                inv = int(b.get("Invocations", 0))
                cerr = int(b.get("InvocationClientErrors", 0))
                serr = int(b.get("InvocationServerErrors", 0))
                # latency: our per-raw-id chunk summed the averages; divide by #raw ids merged
                samples = b.get("_lat_samples", 1) or 1
                lat = round(b.get("InvocationLatency", 0.0) / samples, 1)
                errs = cerr + serr
                by_model.append(ModelRuntimeMetrics(
                    model_id=canon,
                    invocations=inv,
                    avg_latency_ms=lat,
                    client_errors=cerr,
                    server_errors=serr,
                    input_tokens=int(b.get("InputTokenCount", 0)),
                    output_tokens=int(b.get("OutputTokenCount", 0)),
                    cache_read_tokens=int(b.get("CacheReadInputTokenCount", 0)),
                    cache_write_tokens=int(b.get("CacheWriteInputTokenCount", 0)),
                    error_rate_pct=round((errs / inv * 100), 2) if inv > 0 else 0.0,
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
