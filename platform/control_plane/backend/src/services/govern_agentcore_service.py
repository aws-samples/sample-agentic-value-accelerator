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

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_agentcore import (
    AgentCorePostureResponse,
    AgentRuntimeMetric,
    AgentRuntimeMetricsResponse,
    DiscoveredAgent,
    DiscoveredAgentsResponse,
    PostureCategory,
    PostureResource,
)

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min
_METRICS_TTL = 300
_READY = {"READY", "ACTIVE", "PREPARED", "AVAILABLE"}
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
            result.note = f"{result.note} · {stamp}" if result.note else stamp
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

    # ─────────────────── Discovered agents (for the registry) ───────────────────

    def get_agents(self) -> DiscoveredAgentsResponse:
        result, cached_at = get_or_load(
            f"agentcore:agents:{self.region}", _TTL, self._fetch_agents,
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_agents(self) -> DiscoveredAgentsResponse:
        agents: list[DiscoveredAgent] = []
        bedrock_n = 0
        core_n = 0
        errors: list[str] = []

        # Classic Bedrock Agents
        try:
            resp = self._bedrock_agent().list_agents(maxResults=100)
            for a in resp.get("agentSummaries", []):
                agents.append(DiscoveredAgent(
                    id=a.get("agentId", ""), name=a.get("agentName", a.get("agentId", "")),
                    status=a.get("agentStatus", ""), platform="bedrock-agent",
                    version=str(a["latestAgentVersion"]) if a.get("latestAgentVersion") is not None else None,
                    updated_at=_iso(a.get("updatedAt")),
                ))
                bedrock_n += 1
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("list_agents unavailable: %s", e)
            errors.append("Bedrock Agents")

        # AgentCore runtimes
        try:
            resp = self._agentcore().list_agent_runtimes(maxResults=100)
            for r in resp.get("agentRuntimes", []):
                agents.append(DiscoveredAgent(
                    id=r.get("agentRuntimeId", ""), name=r.get("agentRuntimeName", r.get("agentRuntimeId", "")),
                    status=r.get("status", ""), platform="agentcore-runtime",
                    version=str(r["agentRuntimeVersion"]) if r.get("agentRuntimeVersion") is not None else None,
                    updated_at=_iso(r.get("lastUpdatedAt")),
                ))
                core_n += 1
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("list_agent_runtimes unavailable: %s", e)
            errors.append("AgentCore runtimes")

        live = len(agents) > 0
        note = None
        if errors and live:
            note = f"Partial — {', '.join(errors)} unavailable."
        elif not live:
            note = "No Bedrock Agents or AgentCore runtimes found (none deployed or access denied)."
        return DiscoveredAgentsResponse(
            agents=sorted(agents, key=lambda x: x.name.lower()),
            total=len(agents), bedrock_agents=bedrock_n, agentcore_runtimes=core_n,
            live=live, source="bedrock+agentcore", note=note,
        )

    # ─────────────────── AgentCore posture (gateways/memories/etc) ───────────────────

    def get_posture(self) -> AgentCorePostureResponse:
        result, cached_at = get_or_load(
            f"agentcore:posture:{self.region}", _TTL, self._fetch_posture,
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _category(self, key: str, label: str, fetch) -> PostureCategory:
        """Run one list call, normalize to a PostureCategory; never raises."""
        try:
            items = fetch()  # returns list[PostureResource]
            ready = sum(1 for i in items if (i.status or "").upper() in _READY)
            return PostureCategory(
                key=key, label=label, total=len(items), ready=ready,
                items=items[:6], live=True,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("AgentCore %s unavailable: %s", key, e)
            return PostureCategory(key=key, label=label, live=False, note="Unavailable or not permitted.")

    def _fetch_posture(self) -> AgentCorePostureResponse:
        ac = self._agentcore()
        ba = self._bedrock_agent()

        def gateways():
            out = []
            gws = ac.list_gateways(maxResults=50).get("items", [])
            for g in gws:
                out.append(PostureResource(name=g.get("name", g.get("gatewayId", "")), status=g.get("status"), updated_at=_iso(g.get("updatedAt"))))
            return out

        def gateway_targets():
            # Targets belong to a gateway — enumerate across gateways (small N).
            out = []
            for g in ac.list_gateways(maxResults=50).get("items", []):
                gid = g.get("gatewayId")
                if not gid:
                    continue
                for t in ac.list_gateway_targets(gatewayIdentifier=gid, maxResults=50).get("items", []):
                    out.append(PostureResource(name=t.get("name", t.get("targetId", "")), status=t.get("status"), updated_at=_iso(t.get("updatedAt"))))
            return out

        def memories():
            out = []
            for m in ac.list_memories(maxResults=100).get("memories", []):
                out.append(PostureResource(name=m.get("id", ""), status=m.get("status"), updated_at=_iso(m.get("updatedAt"))))
            return out

        def identities():
            out = []
            for w in ac.list_workload_identities().get("workloadIdentities", []):
                out.append(PostureResource(name=w.get("name", "")))
            return out

        def policy_engines():
            out = []
            for pe in ac.list_policy_engines(maxResults=50).get("policyEngines", []):
                out.append(PostureResource(name=pe.get("name", pe.get("policyEngineId", "")), status=pe.get("status"), updated_at=_iso(pe.get("updatedAt"))))
            return out

        def knowledge_bases():
            out = []
            for kb in ba.list_knowledge_bases(maxResults=100).get("knowledgeBaseSummaries", []):
                out.append(PostureResource(name=kb.get("name", ""), status=kb.get("status"), updated_at=_iso(kb.get("updatedAt"))))
            return out

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
