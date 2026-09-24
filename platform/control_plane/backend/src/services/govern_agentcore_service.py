"""Govern AgentCore service — real deployed agents + AgentCore posture.

Read-through + cached. Discovers agents from Bedrock Agents (classic) and Bedrock
AgentCore runtimes, plus the AgentCore control-plane posture (gateways, memories,
workload identities, policy engines) and Bedrock knowledge bases. Each AWS call is
independently graceful — one unavailable API never breaks the rest.

Shape notes (verified, boto3 1.43.38):
  - bedrock-agent list_agents → agentSummaries[]{agentId, agentName, agentStatus, latestAgentVersion, updatedAt}
  - bedrock-agentcore-control list_agent_runtimes → agentRuntimes[]{agentRuntimeId, agentRuntimeName, status, agentRuntimeVersion, lastUpdatedAt}
  - list_gateways / list_gateway_targets → items[]{name, status, gatewayId/targetId, updatedAt}
  - list_memories → memories[]{id (no name!), status, updatedAt}
  - list_workload_identities → workloadIdentities[]{name} (no status/timestamp)
  - list_policy_engines → policyEngines[]{name, status, policyEngineId, updatedAt}
  - list_knowledge_bases → knowledgeBaseSummaries[]{name, status, updatedAt}
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.aws_paging import paginate_bounded
from core.ttl_cache import get_or_load
from core.security_utils import mask_account_id
from models.govern_agentcore import (
    AgentCorePostureResponse,
    AgentRuntimeMetric,
    AgentRuntimeMetricsResponse,
    DiscoveredAgent,
    DiscoveredAgentsResponse,
    Gateway,
    GatewayMetric,
    GatewayMetricsResponse,
    GatewaysListResponse,
    GatewayTarget,
    GatewayTargetsListResponse,
    MemoryMetric,
    MemoryMetricsResponse,
    PolicyEngine,
    PolicyEnginesListResponse,
    PostureCategory,
    PostureResource,
    ResourceUsageMetric,
    ResourceUsageResponse,
    RuntimeMetrics,
    RuntimeMetricsResponse,
    WorkloadIdentity,
    WorkloadIdentitiesListResponse,
)

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min
_METRICS_TTL = 300
_READY = {"READY", "ACTIVE", "PREPARED", "AVAILABLE"}
# CloudWatch Logs group carrying Bedrock model-invocation records for this account.
_INVOCATION_LOG_GROUP = "bedrock-invocation-logging"
_INSIGHTS_MAX_POLLS = 30  # ~30s max wait for a Logs Insights batch.
# CloudWatch AWS/Bedrock-AgentCore metrics keyed per-agent via Name|Operation|Resource.
_AGENT_METRICS = {"Invocations": "Sum", "Latency": "Average", "Errors": "Sum", "Sessions": "Sum"}


def _iso(v) -> str | None:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


def _runtime_from_name_dim(name_val: str) -> str:
    """CloudWatch Name dim '<runtime>::DEFAULT' → runtime name."""
    return name_val.split("::", 1)[0]


class GovernAgentCoreService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def _bedrock_agent(self):
        return boto3.client("bedrock-agent", region_name=self.region)

    def _agentcore(self):
        return boto3.client("bedrock-agentcore-control", region_name=self.region)

    def _cloudwatch(self):
        return boto3.client("cloudwatch", region_name=self.region)

    # ─────────────────── Per-agent runtime metrics (CloudWatch) ───────────────────

    def get_agent_metrics(self, days: int = 7) -> AgentRuntimeMetricsResponse:
        result, cached_at = get_or_load(
            f"agentcore:agent-metrics:{self.region}:{days}", _METRICS_TTL,
            lambda: self._fetch_agent_metrics(days), should_cache=lambda r: r.live,
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

    def _fetch_agent_metrics(self, days: int = 7) -> AgentRuntimeMetricsResponse:
        """Real per-agent metrics from AWS/Bedrock-AgentCore.

        The per-agent identity lives ONLY on the `Name|Operation|Resource` dimension
        combo (Name = '<runtime>::DEFAULT'). We enumerate list_metrics to find those
        exact triples (no ARN guessing), then batch get_metric_data. Only agents with
        real traffic emit these — idle runtimes simply won't appear.
        """
        try:
            cw = self._cloudwatch()
            # 1) Discover the Name|Operation|Resource triples per metric.
            queries = []
            qid_map: dict[str, tuple[str, str]] = {}  # qid -> (runtime_name, metric)
            qi = 0
            for metric, stat in _AGENT_METRICS.items():
                paginator = cw.get_paginator("list_metrics")
                for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric):
                    for m in page.get("Metrics", []):
                        dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                        if "Name" not in dims:
                            continue  # only the per-agent (Name-dimensioned) series
                        runtime = _runtime_from_name_dim(dims["Name"])
                        qid = f"q{qi}"
                        qi += 1
                        qid_map[qid] = (runtime, metric)
                        queries.append({
                            "Id": qid,
                            "MetricStat": {
                                "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric,
                                           "Dimensions": m["Dimensions"]},
                                "Period": 86400 * max(1, days),
                                "Stat": stat,
                            },
                            "ReturnData": True,
                        })

            if not queries:
                return AgentRuntimeMetricsResponse(
                    by_agent=[], window_days=days, live=False, source="no-data",
                    note="No per-agent AgentCore metrics yet — only invoked runtimes emit them.",
                )

            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            results: dict[str, float] = {}
            for k in range(0, len(queries), 450):
                resp = cw.get_metric_data(MetricDataQueries=queries[k:k + 450], StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0

            # 2) Roll up per runtime.
            agg: dict[str, dict[str, float]] = {}
            lat_samples: dict[str, int] = {}
            for qid, (runtime, metric) in qid_map.items():
                b = agg.setdefault(runtime, {})
                v = results.get(qid, 0.0)
                if metric == "Latency":
                    b["Latency"] = b.get("Latency", 0.0) + v
                    lat_samples[runtime] = lat_samples.get(runtime, 0) + 1
                else:
                    b[metric] = b.get(metric, 0.0) + v

            by_agent = [
                AgentRuntimeMetric(
                    runtime_name=rt,
                    invocations=int(b.get("Invocations", 0)),
                    avg_latency_ms=round(b.get("Latency", 0.0) / max(1, lat_samples.get(rt, 1)), 1),
                    errors=int(b.get("Errors", 0)),
                    sessions=int(b.get("Sessions", 0)),
                )
                for rt, b in agg.items()
            ]
            by_agent.sort(key=lambda x: x.invocations, reverse=True)
            return AgentRuntimeMetricsResponse(
                by_agent=by_agent, window_days=days, live=True, source="cloudwatch-agentcore",
                note=f"{len(by_agent)} agent(s) with traffic in the window.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AgentCore per-agent metrics unavailable: %s", e)
            return AgentRuntimeMetricsResponse(
                by_agent=[], window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore unreachable or not permitted.",
            )

    # ─────────────────── Runtime metrics (CloudWatch) ───────────────────

    def get_runtime_metrics(self, days: int = 7) -> RuntimeMetricsResponse:
        result, cached_at = get_or_load(
            f"agentcore:runtime-metrics:{self.region}:{days}", _METRICS_TTL,
            lambda: self._fetch_runtime_metrics(days), should_cache=lambda r: r.live,
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

    def _fetch_runtime_metrics(self, days: int = 7) -> RuntimeMetricsResponse:
        """Runtime metrics: Throttles, ActiveSessionCount, SystemErrors, UserErrors."""
        try:
            cw = self._cloudwatch()
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)

            # Metrics to fetch (some with Service dimension breakdowns)
            metric_specs = [
                ("Throttles", "Sum", None),
                ("ActiveSessionCount", "Average", None),  # gauge
                ("SystemErrors", "Sum", None),
                ("UserErrors", "Sum", None),
                ("ActiveSessionCount", "Average", "AgentCore.Runtime"),
                ("ActiveSessionCount", "Average", "CodeInterpreter"),
                ("ActiveSessionCount", "Average", "Browser"),
            ]

            queries = []
            qid_map: dict[str, tuple[str, str | None]] = {}
            for i, (metric, stat, service) in enumerate(metric_specs):
                qid = f"q{i}"
                dims = [{"Name": "Service", "Value": service}] if service else []
                qid_map[qid] = (metric, service)
                queries.append({
                    "Id": qid,
                    "MetricStat": {
                        "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric, "Dimensions": dims},
                        "Period": period,
                        "Stat": stat,
                    },
                    "ReturnData": True,
                })

            resp = cw.get_metric_data(MetricDataQueries=queries, StartTime=start, EndTime=end)
            results: dict[str, float] = {}
            for r in resp.get("MetricDataResults", []):
                vals = r.get("Values", [])
                results[r["Id"]] = sum(vals) if vals else 0.0

            # Aggregate
            metrics = RuntimeMetrics()
            by_service = {}
            for qid, (metric, service) in qid_map.items():
                val = results.get(qid, 0.0)
                if service:
                    by_service.setdefault(service, {})[metric] = val
                else:
                    if metric == "Throttles":
                        metrics.throttles = int(val)
                    elif metric == "ActiveSessionCount":
                        metrics.active_session_count = int(val)
                    elif metric == "SystemErrors":
                        metrics.system_errors = int(val)
                    elif metric == "UserErrors":
                        metrics.user_errors = int(val)

            metrics.by_service = by_service
            return RuntimeMetricsResponse(
                metrics=metrics, window_days=days, live=True, source="cloudwatch-agentcore",
                note="Runtime metrics from AWS/Bedrock-AgentCore namespace.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Runtime metrics unavailable: %s", e)
            return RuntimeMetricsResponse(
                metrics=RuntimeMetrics(), window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore unreachable or not permitted.",
            )

    # ─────────────────── Resource usage metrics (CloudWatch) ───────────────────

    def get_resource_usage(self, days: int = 7) -> ResourceUsageResponse:
        result, cached_at = get_or_load(
            f"agentcore:resource-usage:{self.region}:{days}", _METRICS_TTL,
            lambda: self._fetch_resource_usage(days), should_cache=lambda r: r.live,
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

    def _fetch_resource_usage(self, days: int = 7) -> ResourceUsageResponse:
        """Resource usage: CPUUsed-vCPUHours, MemoryUsed-GBHours by Service/Resource/Name."""
        try:
            cw = self._cloudwatch()
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)

            # Discover all Service/Resource/Name dimension combos for CPU and Memory
            queries = []
            qid_map: dict[str, tuple[str, str, str, str]] = {}  # qid -> (metric, service, resource, name)
            qi = 0

            for metric_name in ["CPUUsed-vCPUHours", "MemoryUsed-GBHours"]:
                paginator = cw.get_paginator("list_metrics")
                for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric_name):
                    for m in page.get("Metrics", []):
                        dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                        if not all(k in dims for k in ["Service", "Resource", "Name"]):
                            continue
                        qid = f"q{qi}"
                        qi += 1
                        qid_map[qid] = (metric_name, dims["Service"], dims["Resource"], dims["Name"])
                        queries.append({
                            "Id": qid,
                            "MetricStat": {
                                "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric_name,
                                           "Dimensions": m["Dimensions"]},
                                "Period": period,
                                "Stat": "Sum",
                            },
                            "ReturnData": True,
                        })

            if not queries:
                return ResourceUsageResponse(
                    by_resource=[], window_days=days, live=False, source="no-data",
                    note="No resource usage metrics found.",
                )

            results: dict[str, float] = {}
            for k in range(0, len(queries), 450):
                resp = cw.get_metric_data(MetricDataQueries=queries[k:k + 450], StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0

            # Aggregate by (service, resource, name)
            agg: dict[tuple[str, str, str], ResourceUsageMetric] = {}
            for qid, (metric, service, resource, name) in qid_map.items():
                key = (service, resource, name)
                if key not in agg:
                    # Resource/Name CloudWatch dimensions can be ARNs carrying the account id.
                    agg[key] = ResourceUsageMetric(service=service, resource=mask_account_id(resource), name=mask_account_id(name))
                val = results.get(qid, 0.0)
                if metric == "CPUUsed-vCPUHours":
                    agg[key].cpu_vcpu_hours = round(val, 2)
                elif metric == "MemoryUsed-GBHours":
                    agg[key].memory_gb_hours = round(val, 2)

            by_resource = sorted(agg.values(), key=lambda x: x.cpu_vcpu_hours + x.memory_gb_hours, reverse=True)
            return ResourceUsageResponse(
                by_resource=by_resource, window_days=days, live=True, source="cloudwatch-agentcore",
                note=f"{len(by_resource)} resource(s) with usage data.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Resource usage metrics unavailable: %s", e)
            return ResourceUsageResponse(
                by_resource=[], window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore unreachable or not permitted.",
            )

    # ─────────────────── Gateway metrics (CloudWatch) ───────────────────

    def get_gateway_metrics(self, days: int = 7) -> GatewayMetricsResponse:
        result, cached_at = get_or_load(
            f"agentcore:gateway-metrics:{self.region}:{days}", _METRICS_TTL,
            lambda: self._fetch_gateway_metrics(days), should_cache=lambda r: r.live,
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

    def _fetch_gateway_metrics(self, days: int = 7) -> GatewayMetricsResponse:
        """Gateway metrics: Invocations, Throttles, Errors, Latency, Duration, TargetExecutionTime."""
        try:
            cw = self._cloudwatch()
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)

            # Gateway metrics with their stats and whether they need percentiles
            metric_configs = {
                "Invocations": ("Sum", False),
                "Throttles": ("Sum", False),
                "SystemErrors": ("Sum", False),
                "UserErrors": ("Sum", False),
                "TargetType": ("Sum", False),
                "Latency": ("Average", True),
                "Duration": ("Average", True),
                "TargetExecutionTime": ("Average", True),
            }

            # Discover dimensions: Operation, Protocol, Method, Resource, Name
            queries = []
            qid_map: dict[str, tuple[str, str, dict[str, str]]] = {}  # qid -> (metric, stat, dims)
            qi = 0

            for metric_name, (base_stat, needs_percentiles) in metric_configs.items():
                stats = [base_stat]
                if needs_percentiles:
                    stats.extend(["p50", "p90", "p99"])

                paginator = cw.get_paginator("list_metrics")
                for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric_name):
                    for m in page.get("Metrics", []):
                        dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                        if "Operation" not in dims:
                            continue  # Only gateway-dimensioned metrics

                        for stat in stats:
                            qid = f"q{qi}"
                            qi += 1
                            qid_map[qid] = (metric_name, stat, dims)
                            queries.append({
                                "Id": qid,
                                "MetricStat": {
                                    "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric_name,
                                               "Dimensions": m["Dimensions"]},
                                    "Period": period,
                                    "Stat": stat,
                                },
                                "ReturnData": True,
                            })

            if not queries:
                return GatewayMetricsResponse(
                    by_gateway=[], window_days=days, live=False, source="no-data",
                    note="No gateway metrics found.",
                )

            results: dict[str, float] = {}
            for k in range(0, len(queries), 450):
                resp = cw.get_metric_data(MetricDataQueries=queries[k:k + 450], StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0

            # Aggregate by gateway dimension tuple
            agg: dict[tuple, GatewayMetric] = {}
            for qid, (metric, stat, dims) in qid_map.items():
                key = (dims.get("Operation", ""), dims.get("Protocol"), dims.get("Method"),
                       dims.get("Resource"), dims.get("Name"))
                if key not in agg:
                    agg[key] = GatewayMetric(
                        operation=dims.get("Operation", ""),
                        protocol=dims.get("Protocol"),
                        method=dims.get("Method"),
                        # Resource/Name CloudWatch dimensions can be ARNs carrying the account id.
                        resource=mask_account_id(dims.get("Resource")),
                        name=mask_account_id(dims.get("Name")),
                    )

                val = results.get(qid, 0.0)
                gm = agg[key]

                # Map metric+stat to field
                if metric == "Invocations":
                    gm.invocations = int(val)
                elif metric == "Throttles":
                    gm.throttles = int(val)
                elif metric == "SystemErrors":
                    gm.system_errors = int(val)
                elif metric == "UserErrors":
                    gm.user_errors = int(val)
                elif metric == "TargetType":
                    gm.target_type_count = int(val)
                elif metric == "Latency":
                    if stat == "Average":
                        gm.latency_avg_ms = round(val, 2)
                    elif stat == "p50":
                        gm.latency_p50_ms = round(val, 2)
                    elif stat == "p90":
                        gm.latency_p90_ms = round(val, 2)
                    elif stat == "p99":
                        gm.latency_p99_ms = round(val, 2)
                elif metric == "Duration":
                    if stat == "Average":
                        gm.duration_avg_ms = round(val, 2)
                    elif stat == "p50":
                        gm.duration_p50_ms = round(val, 2)
                    elif stat == "p90":
                        gm.duration_p90_ms = round(val, 2)
                    elif stat == "p99":
                        gm.duration_p99_ms = round(val, 2)
                elif metric == "TargetExecutionTime":
                    if stat == "Average":
                        gm.target_execution_time_avg_ms = round(val, 2)
                    elif stat == "p50":
                        gm.target_execution_time_p50_ms = round(val, 2)
                    elif stat == "p90":
                        gm.target_execution_time_p90_ms = round(val, 2)
                    elif stat == "p99":
                        gm.target_execution_time_p99_ms = round(val, 2)

            by_gateway = sorted(agg.values(), key=lambda x: x.invocations, reverse=True)
            return GatewayMetricsResponse(
                by_gateway=by_gateway, window_days=days, live=True, source="cloudwatch-agentcore",
                note=f"{len(by_gateway)} gateway operation(s) with traffic.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Gateway metrics unavailable: %s", e)
            return GatewayMetricsResponse(
                by_gateway=[], window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore unreachable or not permitted.",
            )

    # ─────────────────── Memory metrics (CloudWatch) ───────────────────

    def get_memory_metrics(self, days: int = 7) -> MemoryMetricsResponse:
        result, cached_at = get_or_load(
            f"agentcore:memory-metrics:{self.region}:{days}", _METRICS_TTL,
            lambda: self._fetch_memory_metrics(days), should_cache=lambda r: r.live,
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

    def _fetch_memory_metrics(self, days: int = 7) -> MemoryMetricsResponse:
        """Memory metrics: Invocations, Latency (avg + percentiles), Errors, CreationCount."""
        try:
            cw = self._cloudwatch()
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)

            # Memory metrics
            metric_configs = {
                "Invocations": ("Sum", False),
                "Latency": ("Average", True),
                "SystemErrors": ("Sum", False),
                "UserErrors": ("Sum", False),
                "CreationCount": ("Sum", False),
            }

            queries = []
            qid_map: dict[str, tuple[str, str, str | None]] = {}  # qid -> (metric, stat, name)
            qi = 0

            for metric_name, (base_stat, needs_percentiles) in metric_configs.items():
                stats = [base_stat]
                if needs_percentiles:
                    stats.extend(["p50", "p90", "p99"])

                paginator = cw.get_paginator("list_metrics")
                for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric_name):
                    for m in page.get("Metrics", []):
                        dims = {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}
                        # Memory metrics may have a Name dimension
                        name = dims.get("Name")

                        for stat in stats:
                            qid = f"q{qi}"
                            qi += 1
                            qid_map[qid] = (metric_name, stat, name)
                            queries.append({
                                "Id": qid,
                                "MetricStat": {
                                    "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric_name,
                                               "Dimensions": m["Dimensions"]},
                                    "Period": period,
                                    "Stat": stat,
                                },
                                "ReturnData": True,
                            })

            if not queries:
                return MemoryMetricsResponse(
                    by_memory=[], window_days=days, live=False, source="no-data",
                    note="No memory metrics found.",
                )

            results: dict[str, float] = {}
            for k in range(0, len(queries), 450):
                resp = cw.get_metric_data(MetricDataQueries=queries[k:k + 450], StartTime=start, EndTime=end)
                for r in resp.get("MetricDataResults", []):
                    vals = r.get("Values", [])
                    results[r["Id"]] = sum(vals) if vals else 0.0

            # Aggregate by name (or None for namespace-wide)
            agg: dict[str | None, MemoryMetric] = {}
            for qid, (metric, stat, name) in qid_map.items():
                if name not in agg:
                    agg[name] = MemoryMetric(name=name)

                val = results.get(qid, 0.0)
                mm = agg[name]

                if metric == "Invocations":
                    mm.invocations = int(val)
                elif metric == "Latency":
                    if stat == "Average":
                        mm.latency_avg_ms = round(val, 2)
                    elif stat == "p50":
                        mm.latency_p50_ms = round(val, 2)
                    elif stat == "p90":
                        mm.latency_p90_ms = round(val, 2)
                    elif stat == "p99":
                        mm.latency_p99_ms = round(val, 2)
                elif metric == "SystemErrors":
                    mm.system_errors = int(val)
                elif metric == "UserErrors":
                    mm.user_errors = int(val)
                elif metric == "CreationCount":
                    mm.creation_count = int(val)

            by_memory = sorted(agg.values(), key=lambda x: x.invocations, reverse=True)
            return MemoryMetricsResponse(
                by_memory=by_memory, window_days=days, live=True, source="cloudwatch-agentcore",
                note=f"{len(by_memory)} memory metric group(s) with activity.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Memory metrics unavailable: %s", e)
            return MemoryMetricsResponse(
                by_memory=[], window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch AWS/Bedrock-AgentCore unreachable or not permitted.",
            )

    # ─────────────────── Discovered agents (for the registry) ───────────────────

    def get_agents(self) -> DiscoveredAgentsResponse:
        result, cached_at = get_or_load(
            f"agentcore:agents:{self.region}", _TTL, self._fetch_agents,
            should_cache=lambda r: r.live,
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

    def _fetch_agents(self) -> DiscoveredAgentsResponse:
        agents: list[DiscoveredAgent] = []
        bedrock_n = 0
        core_n = 0
        errors: list[str] = []

        notes: list[str] = []

        # Classic Bedrock Agents
        try:
            # Was list_agents(maxResults=100) reading a single page, so the fleet total
            # silently capped at 100 however many agents existed. Nothing raised: the
            # request is legal, it just answers a smaller question than the caller asked.
            # This is the count the Operations Hub publishes, so a cap here understates
            # the estate under a Live badge at precisely the point the estate gets big
            # enough to matter.
            page = paginate_bounded(
                self._bedrock_agent(), "list_agents", "agentSummaries", page_size=100
            )
            if page.failed:
                # The helper already logged it. Record it the same way the old except
                # branch did, so a failed detector stays distinguishable from an empty one.
                errors.append("Bedrock Agents")
            if page.note:
                notes.append(page.note)
            for a in page.items:
                agents.append(DiscoveredAgent(
                    id=a.get("agentId", ""), name=a.get("agentName", a.get("agentId", "")),
                    status=a.get("agentStatus", ""), platform="bedrock-agent",
                    version=str(a["latestAgentVersion"]) if a.get("latestAgentVersion") is not None else None,
                    updated_at=_iso(a.get("updatedAt")),
                    # Free: agentSummaries already carries it. Note that ListAgents does NOT
                    # return guardrailConfiguration - verified against the reference account,
                    # where 0 of 7 summaries include it. Binding an agent to its guardrail
                    # needs a per-agent GetAgent call, so it is deliberately not surfaced here.
                    description=(a.get("description") or None),
                ))
                bedrock_n += 1
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("list_agents unavailable: %s", e)
            errors.append("Bedrock Agents")

        # AgentCore runtimes
        try:
            page = paginate_bounded(
                self._agentcore(), "list_agent_runtimes", "agentRuntimes", page_size=100
            )
            if page.failed:
                errors.append("AgentCore runtimes")
            if page.note:
                notes.append(page.note)
            for r in page.items:
                agents.append(DiscoveredAgent(
                    id=r.get("agentRuntimeId", ""), name=r.get("agentRuntimeName", r.get("agentRuntimeId", "")),
                    status=r.get("status", ""), platform="agentcore-runtime",
                    version=str(r["agentRuntimeVersion"]) if r.get("agentRuntimeVersion") is not None else None,
                    updated_at=_iso(r.get("lastUpdatedAt")),
                    # Account-masked ARN so the UI can join a runtime to its tagged
                    # resource record. ListAgents (classic Bedrock) summaries carry no
                    # ARN at all, so those agents keep arn=None rather than paying for
                    # an extra GetAgent call per agent.
                    arn=mask_account_id(r.get("agentRuntimeArn")) or None,
                    # Free, same as above. Frequently absent (8 of 29 on the reference
                    # account) and often auto-generated as "AgentCore Runtime: <name>",
                    # which restates the name; passed through verbatim either way rather
                    # than filtered, because what AWS holds is the accurate answer.
                    description=(r.get("description") or None),
                ))
                core_n += 1
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("list_agent_runtimes unavailable: %s", e)
            errors.append("AgentCore runtimes")

        # Was `live = len(agents) > 0`, which is the truthiness form of this bug: an account
        # that genuinely runs no agents is a MEASURED zero from two reachable APIs, and that
        # is live data. Reporting it as live=False also meant get_or_load's
        # should_cache=lambda r: r.live never cached it, so both AWS calls re-issued on
        # every single request. `live` answers "did the APIs answer", not "was the answer
        # interesting".
        live = len(errors) < 2
        if errors and live:
            notes.append(f"Partial - {', '.join(errors)} unavailable.")
        elif not live:
            notes.append("Neither Bedrock Agents nor AgentCore runtimes could be listed.")
        elif not agents:
            # The old note said "none deployed or access denied", which are opposite facts:
            # one is a clean bill of health, the other is a broken integration. Both
            # detectors answered here, so this is the first of the two and can be said
            # without hedging.
            notes.append("No agents deployed. Both inventories were read successfully.")
        return DiscoveredAgentsResponse(
            agents=sorted(agents, key=lambda x: x.name.lower()),
            total=len(agents), bedrock_agents=bedrock_n, agentcore_runtimes=core_n,
            live=live, source="bedrock+agentcore",
            note=" ".join(notes) if notes else None,
        )

    # ─────────────────── AgentCore posture (gateways/memories/etc) ───────────────────

    def get_posture(self) -> AgentCorePostureResponse:
        result, cached_at = get_or_load(
            f"agentcore:posture:{self.region}", _TTL, self._fetch_posture,
            should_cache=lambda r: r.live,
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

    def _category(
        self,
        key: str,
        label: str,
        fetch: Callable[[], tuple[list[PostureResource], str | None, bool]],
    ) -> PostureCategory:
        """Run one list call, normalize to a PostureCategory; never raises.

        `fetch` returns (items, note, failed). The note is None unless the underlying paged
        read was cut short, in which case `total` below is a floor rather than a total and has
        to say so - every one of these categories renders its `total` as a count.

        `failed` is the third element because a reader that pages through paginate_bounded
        cannot signal an AWS error by raising: the helper catches ClientError and BotoCoreError
        and hands back PageResult(items=[], failed=True) instead. Until this flag existed, a
        denial on ListGateways arrived here as an ordinary empty list and got published as
        total=0 under live=True, so the card said "0 gateways, measured" about an inventory
        nobody was allowed to look at. Trusting the except arm alone only works for a reader
        that lets the exception out, which is why identities() below needs no flag.
        """
        try:
            items, note, failed = fetch()  # returns (list[PostureResource], note, failed)
            ready = sum(1 for i in items if (i.status or "").upper() in _READY)
            return PostureCategory(
                key=key, label=label, total=len(items), ready=ready,
                items=items[:6], live=not failed, note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("AgentCore %s unavailable: %s", key, e)
            return PostureCategory(key=key, label=label, live=False, note="Unavailable or not permitted.")

    def _fetch_posture(self) -> AgentCorePostureResponse:
        ac = self._agentcore()
        ba = self._bedrock_agent()

        # Each reader returns (items, note, failed). Every one of these used to read a single
        # page and hand back a list whose length became PostureCategory.total, so all six
        # counts capped silently at 50 or 100. paginate_bounded walks them and reports whether
        # the number it returns is a total or a floor.
        #
        # Every reader below also has to answer whether the read happened at all, because
        # paginate_bounded returns its AWS failures rather than raising them. Forwarding only
        # page.note lost that distinction twice over: the category came back live=True with an
        # empty list, and the note carried the helper's generic "AWS list call failed" text in
        # the same slot the truncation caveats use, so the one caveat that means "this number
        # is not a measurement" read like the ones that mean "this number is a floor".

        def read_failure(subject: str, error: str | None) -> str:
            # Says "could not be read" outright. These cards render `total` as a count, so the
            # note is the only thing standing between a reader and the conclusion that the
            # estate is empty, and it cannot afford to sound like a rounding caveat.
            return (
                f"{subject} could not be read ({error or 'no error detail'}); this is a "
                "permissions or enablement failure, not a count of zero."
            )

        def gateways() -> tuple[list[PostureResource], str | None, bool]:
            page = paginate_bounded(ac, "list_gateways", "items", page_size=50)
            out = [
                PostureResource(name=g.get("name", g.get("gatewayId", "")), status=g.get("status"), updated_at=_iso(g.get("updatedAt")))
                for g in page.items
            ]
            if page.failed:
                return out, read_failure("Gateways", page.error), True
            return out, page.note, False

        def gateway_targets() -> tuple[list[PostureResource], str | None, bool]:
            # Targets belong to a gateway, so this is a walk per gateway. Notes from every
            # leg are merged: a truncated gateway list AND a truncated target list are two
            # different reasons the total is short, and collapsing them would hide one.
            #
            # A failure on any leg fails the whole category. Netting the reachable gateways
            # out into a live count was tempting, but the shortfall from a denied leg is an
            # amount this code cannot know, and a partial inventory presented as measured is
            # the same lie in a smaller font. Per-gateway target failures are counted rather
            # than listed one by one, so fifty denials produce one sentence.
            out: list[PostureResource] = []
            notes: list[str] = []
            failed = False
            gw_page = paginate_bounded(ac, "list_gateways", "items", page_size=50)
            if gw_page.failed:
                failed = True
                notes.append(read_failure("Gateways, and so their targets", gw_page.error))
            elif gw_page.note:
                notes.append(gw_page.note)
            scanned = 0
            target_failures = 0
            target_error: str | None = None
            for g in gw_page.items:
                gid = g.get("gatewayId")
                if not gid:
                    continue
                scanned += 1
                t_page = paginate_bounded(
                    ac, "list_gateway_targets", "items",
                    page_size=50, gatewayIdentifier=gid,
                )
                if t_page.failed:
                    failed = True
                    target_failures += 1
                    target_error = target_error or t_page.error
                elif t_page.note:
                    notes.append(t_page.note)
                for t in t_page.items:
                    out.append(PostureResource(name=t.get("name", t.get("targetId", "")), status=t.get("status"), updated_at=_iso(t.get("updatedAt"))))
            if target_failures:
                notes.append(read_failure(
                    f"Targets for {target_failures} of {scanned} gateway(s)", target_error,
                ))
            return out, "; ".join(notes) if notes else None, failed

        def memories() -> tuple[list[PostureResource], str | None, bool]:
            page = paginate_bounded(ac, "list_memories", "memories", page_size=100)
            out = [
                PostureResource(name=m.get("id", ""), status=m.get("status"), updated_at=_iso(m.get("updatedAt")))
                for m in page.items
            ]
            if page.failed:
                return out, read_failure("Memories", page.error), True
            return out, page.note, False

        def identities() -> tuple[list[PostureResource], str | None, bool]:
            # No page-size argument and no paginator on this operation, so there is no
            # bound to disclose - the note is None because the count really is a total.
            # Nothing catches the call either, so an AWS error leaves this reader as an
            # exception and _category's except arm is what reports it; failed is False on
            # the only path that can reach the return.
            out = []
            for w in ac.list_workload_identities().get("workloadIdentities", []):
                out.append(PostureResource(name=w.get("name", "")))
            return out, None, False

        def policy_engines() -> tuple[list[PostureResource], str | None, bool]:
            page = paginate_bounded(ac, "list_policy_engines", "policyEngines", page_size=50)
            out = [
                PostureResource(name=pe.get("name", pe.get("policyEngineId", "")), status=pe.get("status"), updated_at=_iso(pe.get("updatedAt")))
                for pe in page.items
            ]
            if page.failed:
                return out, read_failure("Policy engines", page.error), True
            return out, page.note, False

        def knowledge_bases() -> tuple[list[PostureResource], str | None, bool]:
            page = paginate_bounded(
                ba, "list_knowledge_bases", "knowledgeBaseSummaries", page_size=100
            )
            out = [
                PostureResource(name=kb.get("name", ""), status=kb.get("status"), updated_at=_iso(kb.get("updatedAt")))
                for kb in page.items
            ]
            if page.failed:
                return out, read_failure("Knowledge bases", page.error), True
            return out, page.note, False

        categories = [
            self._category("gateways", "Gateways", gateways),
            self._category("gateway-targets", "Gateway Targets", gateway_targets),
            self._category("memories", "Memories", memories),
            self._category("workload-identities", "Workload Identities", identities),
            self._category("policy-engines", "Policy Engines", policy_engines),
            self._category("knowledge-bases", "Knowledge Bases", knowledge_bases),
        ]
        live = any(c.live for c in categories)
        return AgentCorePostureResponse(
            categories=categories, live=live, source="bedrock-agentcore-control",
            note=None if live else "AgentCore control-plane unavailable or not permitted.",
        )

    # ─────────────────── Traces (CloudWatch Logs Insights) ───────────────────

    def get_traces(self, days: int = 7, limit: int = 100) -> "AgentTracesResponse":
        from models.govern_agentcore import AgentTrace, AgentTracesResponse
        result, cached_at = get_or_load(
            f"agentcore:traces:{self.region}:{days}:{limit}", _METRICS_TTL,
            lambda: self._fetch_traces(days, limit), should_cache=lambda r: r.live,
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

    def _fetch_traces(self, days: int = 7, limit: int = 100) -> "AgentTracesResponse":
        """Query CloudWatch Logs Insights for AgentCore spans in aws/spans log group."""
        from models.govern_agentcore import AgentTrace, AgentTracesResponse
        try:
            logs = boto3.client("logs", region_name=self.region)
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            # Query the aws/spans log group for AgentCore traces
            # Match spans with bedrock-agentcore platform or service type gen_ai_agent
            query = """
            fields @timestamp, @message
            | filter @message like /bedrock-agentcore|aws_bedrock_agentcore|gen_ai_agent/
            | parse @message '"traceId":"*"' as trace_id
            | parse @message '"spanId":"*"' as span_id
            | parse @message '"name":"*"' as operation_name
            | parse @message '"service.name":"*"' as service_name
            | parse @message '"cloud.resource_id":"*"' as resource_arn
            | parse @message '"durationNano":*,' as duration_nano
            | parse @message '"kind":"*"' as span_kind
            | parse @message '"cloud.platform":"*"' as platform
            | sort @timestamp desc
            | limit @limit@
            """.replace("@limit@", str(limit))
            # Try aws/spans first, then fallback to agentcore-specific log groups
            log_groups = ["aws/spans"]
            traces: list = []
            for lg in log_groups:
                try:
                    resp = logs.start_query(
                        logGroupName=lg, startTime=int(start.timestamp()),
                        endTime=int(end.timestamp()), queryString=query,
                    )
                    query_id = resp["queryId"]
                    # Poll for results (max 30s)
                    import time as t
                    for _ in range(30):
                        result = logs.get_query_results(queryId=query_id)
                        if result["status"] in ("Complete", "Failed", "Cancelled"):
                            break
                        t.sleep(1)
                    if result["status"] == "Complete":
                        for row in result.get("results", []):
                            fields = {f["field"]: f.get("value", "") for f in row}
                            logger.debug("Row fields: %s", list(fields.keys()))
                            if fields.get("trace_id") or fields.get("service_name"):
                                # Convert durationNano to ms
                                duration_nano = fields.get("duration_nano", "0") or "0"
                                try:
                                    latency_ms = float(duration_nano) / 1_000_000
                                except (ValueError, TypeError):
                                    latency_ms = 0.0
                                # Extract agent_id from service_name (format: agent_name.DEFAULT)
                                service_name = fields.get("service_name", "")
                                agent_id = service_name.split(".")[0] if service_name else None
                                traces.append(AgentTrace(
                                    trace_id=fields.get("trace_id", ""),
                                    span_id=fields.get("span_id", ""),
                                    operation_name=fields.get("operation_name", ""),
                                    agent_id=agent_id,
                                    endpoint_name=service_name,
                                    session_id=None,
                                    latency_ms=latency_ms,
                                    error_type=None,
                                    timestamp=fields.get("@timestamp", ""),
                                    request_id=None,
                                    resource_arn=mask_account_id(fields.get("resource_arn")),
                                ))
                        if traces:
                            break
                except (ClientError, BotoCoreError) as exc:
                    logger.warning("Exception querying %s: %s", lg, exc)
                    continue
            if not traces:
                return AgentTracesResponse(
                    traces=[], total_count=0, window_days=days, live=False, source="no-data",
                    note="No AgentCore traces found in CloudWatch Logs.",
                )
            return AgentTracesResponse(
                traces=traces[:limit], total_count=len(traces), window_days=days,
                live=True, source="cloudwatch-logs-insights",
                note=f"{len(traces)} trace(s) found.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AgentCore traces unavailable: %s", e)
            return AgentTracesResponse(
                traces=[], total_count=0, window_days=days, live=False, source="unavailable-fallback",
                note="CloudWatch Logs Insights unreachable.",
            )

    # ─────────────────── Model Invocation Logs ───────────────────

    def get_model_invocations(self, hours: int = 24, limit: int = 50) -> dict:
        """Fetch Bedrock model invocation logs from CloudWatch (cached, read-through).

        Returns detailed LLM call data: model, tokens, latency, prompts, responses.
        `total_count` is the real window total (Logs Insights `stats count()`), while
        `invocations` stays capped at `limit`; `returned_count` is that capped size.
        """
        result, cached_at = get_or_load(
            f"agentcore:model-invocations:{self.region}:{hours}:{limit}", _METRICS_TTL,
            lambda: self._fetch_model_invocations(hours, limit),
            should_cache=lambda r: bool(r.get("live")),
        )
        if result.get("live") and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            note = result.get("note")
            # Copy — never mutate the cached dict, or the stamp compounds per hit.
            result = {**result, "note": f"{note} · {stamp}" if note else stamp}
        return result

    def _window_invocation_count(self, logs, start: datetime, end: datetime) -> int | None:
        """Real number of invocation records in the window, via Logs Insights.

        The detail list is fetched with an API `limit`, so its length is a fetch cap —
        not a window total. This runs `stats count(*)` over the same window/group to get
        the honest total. Returns None when the count can't be established (query failed,
        cancelled, or still running after the poll budget) so the caller degrades
        honestly instead of passing the fetch cap off as the window total.
        """
        try:
            resp = logs.start_query(
                logGroupName=_INVOCATION_LOG_GROUP,
                startTime=int(start.timestamp()),
                endTime=int(end.timestamp()),
                queryString="stats count(*) as invocation_count",
            )
            query_id = resp["queryId"]
            result = None
            for _ in range(_INSIGHTS_MAX_POLLS):
                result = logs.get_query_results(queryId=query_id)
                if result["status"] in ("Complete", "Failed", "Cancelled", "Timeout"):
                    break
                time.sleep(1)
            if not result or result.get("status") != "Complete":
                return None
            for row in result.get("results", []):
                fields = {f["field"]: f.get("value", "") for f in row}
                if "invocation_count" in fields:
                    return int(float(fields["invocation_count"] or 0))
            # Complete with no rows = no records matched in the window.
            return 0
        except (ClientError, BotoCoreError, KeyError, ValueError, TypeError) as exc:
            logger.warning("Invocation window count unavailable: %s", exc)
            return None

    def _fetch_model_invocations(self, hours: int = 24, limit: int = 50) -> dict:
        """Uncached fetch: capped detail list (filter_log_events) + real window count."""
        try:
            logs = boto3.client("logs", region_name=self.region)
            end = datetime.now(timezone.utc)
            start = end - timedelta(hours=hours)

            # Query bedrock-invocation-logging log group
            invocations = []
            try:
                resp = logs.filter_log_events(
                    logGroupName=_INVOCATION_LOG_GROUP,
                    startTime=int(start.timestamp() * 1000),
                    endTime=int(end.timestamp() * 1000),
                    limit=limit,
                )
                for event in resp.get("events", []):
                    try:
                        msg = __import__("json").loads(event.get("message", "{}"))

                        # Extract key fields
                        input_body = msg.get("input", {}).get("inputBodyJson", {})
                        output_body = msg.get("output", {}).get("outputBodyJson", {})

                        # Get prompt text (first message content)
                        prompt = ""
                        messages = input_body.get("messages", [])
                        if messages and messages[0].get("content"):
                            content = messages[0]["content"]
                            if isinstance(content, list) and content:
                                prompt = content[0].get("text", "")[:500]
                            elif isinstance(content, str):
                                prompt = content[:500]

                        # Get response text
                        response = ""
                        output_msg = output_body.get("output", {}).get("message", {})
                        if output_msg.get("content"):
                            content = output_msg["content"]
                            if isinstance(content, list) and content:
                                response = content[0].get("text", "")[:500]

                        # Get usage/metrics
                        usage = output_body.get("usage", {})
                        metrics = output_body.get("metrics", {})

                        invocations.append({
                            "timestamp": msg.get("timestamp"),
                            "request_id": msg.get("requestId"),
                            "model_id": msg.get("modelId"),
                            "operation": msg.get("operation"),
                            "input_tokens": usage.get("inputTokens", 0),
                            "output_tokens": usage.get("outputTokens", 0),
                            "total_tokens": usage.get("totalTokens", 0),
                            "latency_ms": metrics.get("latencyMs", 0),
                            "stop_reason": output_body.get("stopReason"),
                            "prompt_preview": mask_account_id(prompt),
                            "response_preview": mask_account_id(response),
                            "caller_arn": mask_account_id(msg.get("identity", {}).get("arn", "")),
                            "guardrail_intervened": output_body.get("stopReason") == "guardrail_intervened",
                        })
                    except (KeyError, TypeError, __import__("json").JSONDecodeError):
                        continue
            except ClientError as e:
                if "ResourceNotFoundException" in str(e):
                    return {
                        "invocations": [],
                        "total_count": 0,
                        "returned_count": 0,
                        "total_count_is_window": False,
                        "hours": hours,
                        "live": False,
                        "source": "not-configured",
                        "note": "Bedrock model invocation logging not enabled. Enable in Bedrock console → Settings → Model invocation logging.",
                    }
                raise

            # len(invocations) is capped by `limit`, so it is NOT the window total —
            # get the real total from Logs Insights, and stay honest when we can't.
            returned = len(invocations)
            window_count = self._window_invocation_count(logs, start, end)
            if window_count is None:
                note = (
                    f"{returned} invocation(s) fetched (detail list capped at {limit}); "
                    f"window total for the last {hours}h unavailable — Logs Insights count query did not complete."
                )
            else:
                note = f"{window_count} model invocation(s) in last {hours}h; detail list capped at {limit}."
            return {
                "invocations": invocations,
                "total_count": window_count if window_count is not None else returned,
                "returned_count": returned,
                "total_count_is_window": window_count is not None,
                "hours": hours,
                "live": True,
                "source": "bedrock-invocation-logging",
                "note": note,
            }
        except (ClientError, BotoCoreError) as e:
            logger.warning("Model invocation logs unavailable: %s", e)
            return {
                "invocations": [],
                "total_count": 0,
                "returned_count": 0,
                "total_count_is_window": False,
                "hours": hours,
                "live": False,
                "source": "unavailable",
                "note": f"Failed to fetch invocation logs: {str(e)[:100]}",
            }

    # ─────────────────── Enable Tracing ───────────────────

    def enable_transaction_search(self) -> dict:
        """Enable CloudWatch Transaction Search (one-time account setup).

        This configures X-Ray to send trace segments to CloudWatch Logs.
        """
        try:
            xray = boto3.client("xray", region_name=self.region)
            # Update trace segment destination to CloudWatch Logs
            xray.update_trace_segment_destination(Destination="CloudWatchLogs")
            return {
                "success": True,
                "message": "CloudWatch Transaction Search enabled. Trace segments will now be sent to CloudWatch Logs.",
            }
        except ClientError as e:
            if "already set to CloudWatchLogs" in str(e):
                logger.info("Transaction Search already enabled")
                return {
                    "success": True,
                    "message": "CloudWatch Transaction Search is already enabled.",
                }
            logger.warning("Failed to enable Transaction Search: %s", e)
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to enable Transaction Search. Check IAM permissions for xray:UpdateTraceSegmentDestination.",
            }
        except BotoCoreError as e:
            logger.warning("Failed to enable Transaction Search: %s", e)
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to enable Transaction Search. Check IAM permissions for xray:UpdateTraceSegmentDestination.",
            }

    def enable_tracing(self, agent_id: str) -> dict:
        """Enable observability tracing for an AgentCore agent runtime.

        Creates CloudWatch delivery sources and destinations for logs and traces.
        """
        try:
            logs = boto3.client("logs", region_name=self.region)
            sts = boto3.client("sts", region_name=self.region)
            account_id = sts.get_caller_identity()["Account"]

            # Build resource ARN - try to find the agent first
            agents_resp = self.get_agents()
            agent = next((a for a in agents_resp.agents if a.id == agent_id or a.name == agent_id), None)
            if not agent:
                return {
                    "success": False,
                    "error": f"Agent '{agent_id}' not found",
                    "message": f"Could not find agent with ID or name '{agent_id}'",
                }

            # Determine ARN based on platform
            if agent.platform == "agentcore-runtime":
                resource_arn = f"arn:aws:bedrock-agentcore:{self.region}:{account_id}:runtime/{agent.id}"
            else:
                resource_arn = f"arn:aws:bedrock-agent:{self.region}:{account_id}:agent/{agent.id}"

            log_group_name = f"/aws/vendedlogs/bedrock-agentcore/{agent.id}"

            # Step 1: Create log group if it doesn't exist
            try:
                logs.create_log_group(logGroupName=log_group_name)
                logger.info("Created log group: %s", log_group_name)
            except logs.exceptions.ResourceAlreadyExistsException:
                logger.info("Log group already exists: %s", log_group_name)

            log_group_arn = f"arn:aws:logs:{self.region}:{account_id}:log-group:{log_group_name}"

            # Step 2: Create delivery source for logs
            try:
                logs.put_delivery_source(
                    name=f"{agent.id}-logs-source",
                    logType="APPLICATION_LOGS",
                    resourceArn=resource_arn,
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            # Step 3: Create delivery source for traces
            try:
                logs.put_delivery_source(
                    name=f"{agent.id}-traces-source",
                    logType="TRACES",
                    resourceArn=resource_arn,
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            # Step 4: Create delivery destination for logs
            try:
                logs.put_delivery_destination(
                    name=f"{agent.id}-logs-destination",
                    deliveryDestinationType="CWL",
                    deliveryDestinationConfiguration={"destinationResourceArn": log_group_arn},
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            # Step 5: Create delivery destination for traces (X-Ray)
            try:
                logs.put_delivery_destination(
                    name=f"{agent.id}-traces-destination",
                    deliveryDestinationType="XRAY",
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            # Step 6: Create deliveries (connect sources to destinations)
            logs_dest_arn = f"arn:aws:logs:{self.region}:{account_id}:delivery-destination:{agent.id}-logs-destination"
            traces_dest_arn = f"arn:aws:logs:{self.region}:{account_id}:delivery-destination:{agent.id}-traces-destination"

            try:
                logs.create_delivery(
                    deliverySourceName=f"{agent.id}-logs-source",
                    deliveryDestinationArn=logs_dest_arn,
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            try:
                logs.create_delivery(
                    deliverySourceName=f"{agent.id}-traces-source",
                    deliveryDestinationArn=traces_dest_arn,
                )
            except ClientError as e:
                if "ResourceAlreadyExistsException" not in str(e):
                    raise

            return {
                "success": True,
                "agent_id": agent.id,
                "agent_name": agent.name,
                "log_group": log_group_name,
                "message": f"Tracing enabled for agent '{agent.name}'. Logs will appear in {log_group_name}, traces in aws/spans.",
            }
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to enable tracing for agent %s: %s", agent_id, e)
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to enable tracing. Check IAM permissions for logs:PutDeliverySource, logs:PutDeliveryDestination, logs:CreateDelivery.",
            }

    # ─────────────────── Detailed AgentCore Resource Lists ───────────────────

    def list_gateways(self) -> GatewaysListResponse:
        """List all AgentCore gateways with full details."""
        result, cached_at = get_or_load(
            f"agentcore:gateways-list:{self.region}", _TTL,
            self._fetch_gateways_list, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_gateways_list(self) -> GatewaysListResponse:
        try:
            ac = self._agentcore()
            # The two branches this replaces were a paginated path guarded by
            # `hasattr(ac, "get_paginator")` and an unpaginated `maxResults=100` fallback.
            # The guard is always true - every boto3 client has get_paginator, it just
            # raises for a non-pageable operation - so the fallback was unreachable, and
            # the two branches disagreed about how many gateways they would return.
            # paginate_bounded tests can_paginate(), which is the question the guard was
            # reaching for.
            page = paginate_bounded(ac, "list_gateways", "items", page_size=50)
            gateways: list[Gateway] = [
                Gateway(
                    gateway_id=g.get("gatewayId", ""),
                    name=g.get("name", g.get("gatewayId", "")),
                    status=g.get("status", "UNKNOWN"),
                    description=g.get("description"),
                    protocol_type=g.get("protocolType"),
                    authorization_type=g.get("authorizationType"),
                    created_at=_iso(g.get("createdAt")),
                    updated_at=_iso(g.get("updatedAt")),
                )
                for g in page.items
            ]
            if page.failed:
                return GatewaysListResponse(
                    gateways=gateways, total=len(gateways), live=False,
                    source="unavailable", note=page.note,
                )
            # "N discovered" is only true of a complete walk. When the walk was bounded,
            # page.note says the count is a floor and replaces the flat claim.
            note = page.note or f"{len(gateways)} gateway(s) discovered."
            return GatewaysListResponse(
                gateways=gateways, total=len(gateways),
                live=True, source="bedrock-agentcore-control", note=note,
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("list_gateways unavailable: %s", e)
            return GatewaysListResponse(
                gateways=[], total=0, live=False, source="unavailable",
                note="AgentCore gateways unavailable or not permitted.",
            )

    def list_gateway_targets(self, gateway_id: str | None = None) -> GatewayTargetsListResponse:
        """List gateway targets. If gateway_id provided, targets for that gateway only."""
        cache_key = f"agentcore:gateway-targets:{self.region}:{gateway_id or 'all'}"
        result, cached_at = get_or_load(
            cache_key, _TTL,
            lambda: self._fetch_gateway_targets(gateway_id), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_gateway_targets(self, gateway_id: str | None = None) -> GatewayTargetsListResponse:
        try:
            ac = self._agentcore()
            targets: list[GatewayTarget] = []

            # Both legs used to read a single page: the gateway list capped at 100, and each
            # gateway's target list capped at 100. The published total was the product of
            # two silent ceilings, and the note claimed it was "discovered across N
            # gateway(s)" as though both were complete.
            caveats: list[str] = []
            if gateway_id:
                gateways_to_scan = [{"gatewayId": gateway_id}]
            else:
                gw_page = paginate_bounded(ac, "list_gateways", "items", page_size=100)
                if gw_page.failed and not gw_page.items:
                    # The helper converts AWS errors into a flag instead of raising, so
                    # without this the method would publish "0 targets across 0 gateways"
                    # under live=True - a fabricated zero from an inventory we never read.
                    # A failure PARTWAY through still yields real gateways, so that case
                    # falls through and is disclosed as a floor rather than discarded.
                    raise ClientError(
                        {"Error": {"Code": "PagedListFailed", "Message": gw_page.error or ""}},
                        "ListGateways",
                    )
                gateways_to_scan = gw_page.items
                if gw_page.note:
                    caveats.append(gw_page.note)

            failed_gateways = 0
            for gw in gateways_to_scan:
                gid = gw.get("gatewayId")
                if not gid:
                    continue
                t_page = paginate_bounded(
                    ac, "list_gateway_targets", "items", page_size=100, gatewayIdentifier=gid
                )
                if t_page.failed:
                    # Already logged by the helper. Counted rather than silently skipped:
                    # a target list that failed makes the total short for a reason the
                    # reader has to be told about.
                    failed_gateways += 1
                elif t_page.note:
                    caveats.append(t_page.note)
                for t in t_page.items:
                    targets.append(GatewayTarget(
                        target_id=t.get("targetId", ""),
                        gateway_id=gid,
                        name=t.get("name", t.get("targetId", "")),
                        status=t.get("status", "UNKNOWN"),
                        target_type=t.get("targetType"),
                        description=t.get("description"),
                        endpoint_url=t.get("endpointUrl"),
                        created_at=_iso(t.get("createdAt")),
                        updated_at=_iso(t.get("updatedAt")),
                    ))

            if failed_gateways:
                caveats.append(
                    f"Targets could not be listed for {failed_gateways} of "
                    f"{len(gateways_to_scan)} gateway(s); the total is a floor."
                )
            summary = (
                f"{len(targets)} gateway target(s) discovered across "
                f"{len(gateways_to_scan)} gateway(s)."
            )
            return GatewayTargetsListResponse(
                targets=targets, total=len(targets),
                live=True, source="bedrock-agentcore-control",
                note=" ".join([summary] + caveats) if caveats else summary,
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("list_gateway_targets unavailable: %s", e)
            return GatewayTargetsListResponse(
                targets=[], total=0, live=False, source="unavailable",
                note="Gateway targets unavailable or not permitted.",
            )

    def list_policy_engines(self) -> PolicyEnginesListResponse:
        """List all AgentCore policy engines with full details."""
        result, cached_at = get_or_load(
            f"agentcore:policy-engines-list:{self.region}", _TTL,
            self._fetch_policy_engines_list, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_policy_engines_list(self) -> PolicyEnginesListResponse:
        try:
            ac = self._agentcore()
            engines: list[PolicyEngine] = []
            page = paginate_bounded(ac, "list_policy_engines", "policyEngines", page_size=100)
            if page.failed:
                # The helper turned the AWS error into a flag rather than raising, but this
                # method's contract is to degrade to live=False on an unreadable inventory,
                # so re-raise into the handler below instead of publishing a partial count.
                raise ClientError(
                    {"Error": {"Code": "PagedListFailed", "Message": page.error or ""}},
                    "ListPolicyEngines",
                )
            for pe in page.items:
                engines.append(PolicyEngine(
                    policy_engine_id=pe.get("policyEngineId", ""),
                    name=pe.get("name", pe.get("policyEngineId", "")),
                    status=pe.get("status", "UNKNOWN"),
                    description=pe.get("description"),
                    policy_store_id=pe.get("policyStoreId"),
                    created_at=_iso(pe.get("createdAt")),
                    updated_at=_iso(pe.get("updatedAt")),
                ))
            summary = f"{len(engines)} policy engine(s) discovered."
            return PolicyEnginesListResponse(
                policy_engines=engines, total=len(engines),
                live=True, source="bedrock-agentcore-control",
                note=f"{summary} {page.note}" if page.note else summary,
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("list_policy_engines unavailable: %s", e)
            return PolicyEnginesListResponse(
                policy_engines=[], total=0, live=False, source="unavailable",
                note="Policy engines unavailable or not permitted.",
            )

    def list_workload_identities(self) -> WorkloadIdentitiesListResponse:
        """List all AgentCore workload identities with full details."""
        result, cached_at = get_or_load(
            f"agentcore:workload-identities-list:{self.region}", _TTL,
            self._fetch_workload_identities_list, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    # ListWorkloadIdentities returns only {name, workloadIdentityArn} per item.
    # Enrich each with GetWorkloadIdentity to surface createdTime and the OAuth2
    # return-URL allow-list, but cap the fan-out of detail calls so a large fleet
    # never issues an unbounded number of API calls per (cached) refresh.
    _WI_ENRICH_CAP = 60

    def _fetch_workload_identities_list(self) -> WorkloadIdentitiesListResponse:
        try:
            ac = self._agentcore()
            identities: list[WorkloadIdentity] = []
            resp = ac.list_workload_identities()
            for idx, wi in enumerate(resp.get("workloadIdentities", [])):
                name = wi.get("name", "")
                workload_identity_id = wi.get("workloadIdentityId")
                created_at: str | None = None
                oauth2_return_urls: list[str] = []
                # ListWorkloadIdentities gives no createdTime / OAuth allow-list —
                # only GetWorkloadIdentity does. Bound the enrichment fan-out and
                # guard each call so one failure never breaks the whole list.
                if name and idx < self._WI_ENRICH_CAP:
                    try:
                        detail = ac.get_workload_identity(name=name)
                        created_at = _iso(detail.get("createdTime"))
                        oauth2_return_urls = detail.get("allowedResourceOauth2ReturnUrls") or []
                        workload_identity_id = detail.get("workloadIdentityId", workload_identity_id)
                    except Exception as e:  # noqa: BLE001 - one bad detail must not break the list
                        logger.warning("get_workload_identity for %s failed: %s", name, e)
                identities.append(WorkloadIdentity(
                    name=name,
                    workload_identity_id=workload_identity_id,
                    description=wi.get("description"),
                    created_at=created_at,
                    oauth2_return_urls=oauth2_return_urls,
                ))
            return WorkloadIdentitiesListResponse(
                workload_identities=identities, total=len(identities),
                live=True, source="bedrock-agentcore-control",
                note=f"{len(identities)} workload identity(ies) discovered.",
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("list_workload_identities unavailable: %s", e)
            return WorkloadIdentitiesListResponse(
                workload_identities=[], total=0, live=False, source="unavailable",
                note="Workload identities unavailable or not permitted.",
            )
