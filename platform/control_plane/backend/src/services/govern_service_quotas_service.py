"""Govern Service Quotas (AI capacity/throttle) — read-through live view.

Reads AWS Service Quotas (`ListServiceQuotas`) for the AI service codes that
gate agent capacity — Bedrock, SageMaker, and Bedrock AgentCore — and surfaces
only the *throttle* quotas that matter for capacity planning: tokens-per-minute
(TPM), requests-per-minute/second (RPM/RPS), concurrency, and provisioned
throughput. Resource-count quotas (agents, knowledge bases, custom models) are
intentionally left to the capacity module; this source is throughput-focused.

Follows the Govern service convention: constructed with a region, creates its
own boto3 client, caches through core.ttl_cache, and degrades honestly — if
Service Quotas is unreachable or not permitted for every service code, it
returns a `live=False` fallback with a clear note rather than raising or
fabricating data.

Shape notes (verified live, service-quotas ListServiceQuotas, us-east-1):
  Quotas[]{QuotaCode, QuotaName, Value, Unit, Adjustable, GlobalQuota,
           QuotaArn (carries the account id — never surfaced), UsageMetric{
           MetricNamespace, MetricName}}
  Counts observed: bedrock ~1000, sagemaker ~1000, bedrock-agentcore ~200.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.config import settings
from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

# Quota data barely moves; a 5-minute TTL collapses repeat page loads.
_TTL = 300

# AI service codes whose throttle quotas gate agent capacity.
AI_SERVICE_CODES: List[dict] = [
    {"code": "bedrock", "name": "Amazon Bedrock"},
    {"code": "sagemaker", "name": "Amazon SageMaker"},
    {"code": "bedrock-agentcore", "name": "Amazon Bedrock AgentCore"},
]

# Cap the surfaced set so a fleet of per-model TPM/RPM quotas (Bedrock alone
# returns hundreds) never produces an unbounded payload. The most
# capacity-critical categories sort first, so a truncation keeps the useful head.
_MAX_QUOTAS = 400

# Category sort priority — fleet-level limits (concurrency, throughput) first.
_PRIORITY = {
    "concurrency": 0,
    "throughput": 1,
    "rpm": 2,
    "tpm": 3,
    "tps": 4,
    "rps": 5,
    "tpd": 6,
    "throttle": 7,
}


def _categorize(quota_name: str) -> Optional[str]:
    """Classify a quota by its throttle dimension, or None if not capacity-related.

    Returning None filters out resource-count quotas (e.g. "Agents per account",
    "Knowledge bases") — this source is throttle/throughput-focused.
    """
    n = quota_name.lower()
    if "concurren" in n:
        return "concurrency"
    if "provisioned throughput" in n or "model units" in n:
        return "throughput"
    if "tokens per minute" in n:
        return "tpm"
    if "tokens per day" in n:
        return "tpd"
    if "requests per minute" in n:
        return "rpm"
    if "requests per second" in n or "per second" in n or n.startswith("rate of"):
        return "rps"
    if "transactions per" in n:
        return "tps"
    if "throttl" in n:
        return "throttle"
    # General token/request throughput limits (e.g. "... tokens per day", "... requests").
    if "tokens" in n and "per " in n:
        return "throughput"
    if "requests" in n and "per " in n:
        return "rpm"
    return None


class AiCapacityQuota(BaseModel):
    """A single AI throttle/capacity service quota."""

    service_code: str = Field(..., description="AWS service code, e.g. 'bedrock'")
    service_name: str = Field(..., description="Human-readable service name")
    quota_code: str = Field(..., description="Quota code, e.g. 'L-8D02D72A'")
    quota_name: str = Field(..., description="Quota name (account-id masked defensively)")
    value: float = Field(..., description="Current quota limit")
    unit: str = Field("None", description="Unit of measurement")
    adjustable: bool = Field(False, description="Whether this quota can be increased")
    global_quota: bool = Field(False, description="True when global (vs regional)")
    category: str = Field(..., description="Throttle dimension: tpm|rpm|rps|tps|tpd|concurrency|throughput|throttle")
    usage_metric_namespace: Optional[str] = Field(None, description="CloudWatch namespace exposing live usage, if any")
    usage_metric_name: Optional[str] = Field(None, description="CloudWatch metric name exposing live usage, if any")
    has_usage_metric: bool = Field(False, description="True when AWS publishes a live usage metric for this quota")


class AiCapacityQuotasResponse(BaseModel):
    """AI throttle/capacity quotas across the governed AI service codes."""

    quotas: List[AiCapacityQuota] = Field(default_factory=list)
    total: int = Field(0, description="Number of throttle quotas surfaced")
    by_service: dict = Field(default_factory=dict, description="Count of surfaced quotas per service code")
    adjustable_count: int = Field(0, description="How many surfaced quotas are adjustable via a quota increase")
    with_usage_metric_count: int = Field(0, description="How many surfaced quotas publish a live CloudWatch usage metric")
    services_available: List[str] = Field(default_factory=list, description="Service codes whose ListServiceQuotas succeeded")
    services_unavailable: List[str] = Field(default_factory=list, description="Service codes that errored / not permitted")
    truncated: bool = Field(False, description="True when the surfaced set was capped")
    region: str = Field("", description="Region the quotas were read from")
    live: bool = Field(..., description="True when sourced from real Service Quotas data")
    source: str = Field(..., description="'service-quotas' | 'unavailable-fallback'")
    note: Optional[str] = None


class GovernServiceQuotasService:
    """Read-through view of AI throttle/capacity Service Quotas."""

    def __init__(self, region: Optional[str] = None):
        # Service Quotas is a regional API; per the brief this source resolves
        # against the governed-resource region (NOT the Support/Health us-east-1
        # rule, which only applies to those two global clients).
        self.region = region or settings.GOVERN_AWS_REGION
        self._sq_client = None

    def _sq(self):
        if self._sq_client is None:
            self._sq_client = boto3.client("service-quotas", region_name=self.region)
        return self._sq_client

    def get_ai_quotas(self) -> AiCapacityQuotasResponse:
        """AI throttle/TPM/RPM/concurrency quotas (cached ~5 min)."""
        key = f"service-quotas:ai:{self.region}"
        result, cached_at = get_or_load(
            key, _TTL, self._fetch_ai_quotas, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_ai_quotas(self) -> AiCapacityQuotasResponse:
        quotas: List[AiCapacityQuota] = []
        by_service: dict = {}
        available: List[str] = []
        unavailable: List[str] = []

        for svc in AI_SERVICE_CODES:
            code = svc["code"]
            name = svc["name"]
            try:
                svc_count = 0
                paginator = self._sq().get_paginator("list_service_quotas")
                for page in paginator.paginate(ServiceCode=code):
                    for q in page.get("Quotas", []):
                        quota_name = q.get("QuotaName", "") or ""
                        category = _categorize(quota_name)
                        if category is None:
                            continue  # not a throttle/capacity quota
                        usage_metric = q.get("UsageMetric") or {}
                        ns = usage_metric.get("MetricNamespace")
                        mn = usage_metric.get("MetricName")
                        quotas.append(AiCapacityQuota(
                            service_code=code,
                            service_name=name,
                            quota_code=q.get("QuotaCode", ""),
                            # QuotaArn carries the account id and is deliberately
                            # never surfaced; mask the name defensively as well.
                            quota_name=mask_account_id(quota_name) or quota_name,
                            value=float(q.get("Value", 0) or 0),
                            unit=q.get("Unit", "None") or "None",
                            adjustable=bool(q.get("Adjustable", False)),
                            global_quota=bool(q.get("GlobalQuota", False)),
                            category=category,
                            usage_metric_namespace=ns,
                            usage_metric_name=mn,
                            has_usage_metric=bool(ns and mn),
                        ))
                        svc_count += 1
                by_service[code] = svc_count
                available.append(code)
            except (BotoCoreError, ClientError) as e:
                logger.warning("ListServiceQuotas for %s unavailable: %s", code, e)
                unavailable.append(code)
                continue

        # Sort: most capacity-critical category first, adjustable first (actionable),
        # then largest limit, then name — stable and deterministic.
        quotas.sort(key=lambda q: (
            _PRIORITY.get(q.category, 99),
            0 if q.adjustable else 1,
            -q.value,
            q.quota_name.lower(),
        ))

        truncated = len(quotas) > _MAX_QUOTAS
        if truncated:
            quotas = quotas[:_MAX_QUOTAS]

        adjustable_count = sum(1 for q in quotas if q.adjustable)
        with_usage = sum(1 for q in quotas if q.has_usage_metric)

        if not available:
            # Every service code errored — the source is unavailable/not permitted.
            return AiCapacityQuotasResponse(
                quotas=[], total=0, by_service={},
                adjustable_count=0, with_usage_metric_count=0,
                services_available=[], services_unavailable=unavailable,
                truncated=False, region=self.region,
                live=False, source="unavailable-fallback",
                note=("Service Quotas unavailable or not permitted for "
                      f"{', '.join(unavailable)}. Grant servicequotas:ListServiceQuotas to view AI throttle quotas."),
            )

        if not quotas:
            # APIs answered but no throttle quotas matched — honest degrade.
            return AiCapacityQuotasResponse(
                quotas=[], total=0, by_service=by_service,
                adjustable_count=0, with_usage_metric_count=0,
                services_available=available, services_unavailable=unavailable,
                truncated=False, region=self.region,
                live=False, source="service-quotas",
                note=("Service Quotas reachable but no AI throttle/TPM/RPM/concurrency "
                      f"quotas found in {self.region}."),
            )

        note_parts = [f"{len(quotas)} AI throttle quota(s) across {', '.join(available)} in {self.region}"]
        if truncated:
            note_parts.append(f"showing top {_MAX_QUOTAS} by capacity priority")
        if unavailable:
            note_parts.append(f"{', '.join(unavailable)} unavailable")
        return AiCapacityQuotasResponse(
            quotas=quotas,
            total=len(quotas),
            by_service=by_service,
            adjustable_count=adjustable_count,
            with_usage_metric_count=with_usage,
            services_available=available,
            services_unavailable=unavailable,
            truncated=truncated,
            region=self.region,
            live=True,
            source="service-quotas",
            note=" · ".join(note_parts) + ".",
        )
