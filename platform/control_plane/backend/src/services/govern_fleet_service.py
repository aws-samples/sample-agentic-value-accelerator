"""Govern Fleet service — server-side aggregation for 10k+ scale.

Aggregates agent data from multiple sources into pre-computed rollups:
  - Bedrock Agents (classic)
  - Bedrock AgentCore runtimes
  - AVA deployments
  - Multi-cloud connector metadata (when available)

The aggregation mirrors the frontend fleetScaleData.ts functions but runs
server-side with caching, so the client never fetches raw agent lists.

Each source is independently graceful — one unavailable API never breaks the rest.
TTL-cached results with honest live/source/note flags.

Aggregated across the governed-region set (core.region_config), not a single region:
Bedrock Agents and AgentCore runtimes are governed resources, so a fleet read from
one region under-reports a fleet spread over several. Every response carries a
RegionProvenance block naming the regions queried and any that were unreachable, so
a smaller total can be told apart from a smaller fleet.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.multiregion import provenance, run_over_regions
from core.region_config import get_governed_regions
from core.ttl_cache import get_or_load
from models.govern_region_provenance import RegionProvenance
from models.govern_fleet import (
    ExceptionAgent,
    FleetExceptionsResponse,
    FleetInventoryResponse,
    FleetSegmentsResponse,
    FleetSummary,
    FleetSummaryResponse,
    GovernanceDistribution,
    InventoryRow,
    RiskDistribution,
    ScopeDistribution,
    SegmentRow,
)

logger = logging.getLogger(__name__)

_TTL = 120  # 2 min — fleet data changes less frequently than real-time metrics
_RISK_THRESHOLDS = {"critical": 75, "high": 50, "medium": 25}


def _iso(v) -> str | None:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


def _risk_tier(score: int) -> str:
    if score >= _RISK_THRESHOLDS["critical"]:
        return "critical"
    if score >= _RISK_THRESHOLDS["high"]:
        return "high"
    if score >= _RISK_THRESHOLDS["medium"]:
        return "medium"
    return "low"


def _attention_score(agent: dict) -> int:
    """Composite score driving exception queue order (higher = more urgent)."""
    gov_status = agent.get("governance_status", "unknown")
    gov = 100 if gov_status == "blocked" else (50 if gov_status == "review_needed" else (20 if gov_status == "unknown" else 0))
    env = 30 if agent.get("environment") == "prod" else (10 if agent.get("environment") == "pilot" else 0)
    scope = (agent.get("scope_level", 1) - 1) * 15
    incidents = agent.get("open_incidents", 0) * 25
    policy = 0 if agent.get("has_policy") else 20
    return gov + agent.get("risk_score", 0) + scope + incidents + env + policy


def _needs_attention(agent: dict) -> bool:
    """Does this agent need human attention?"""
    return (
        agent.get("governance_status") != "compliant"
        or agent.get("open_incidents", 0) > 0
        or (agent.get("scope_level") == 4 and agent.get("environment") == "prod")
    )


def _derive_governance_status(agent: dict) -> str:
    """Derive governance status from agent attributes."""
    status = agent.get("status", "")
    has_policy = agent.get("has_policy", False)
    scope = agent.get("scope_level", 1)
    env = agent.get("environment", "dev")
    incidents = agent.get("open_incidents", 0)

    if status in ("FAILED", "INACTIVE", "STOPPED"):
        return "blocked"
    if not has_policy and (scope >= 3 or env == "prod"):
        return "review_needed"
    if incidents > 0:
        return "review_needed"
    if status in ("PREPARED", "READY", "ACTIVE", "AVAILABLE"):
        return "compliant"
    return "unknown"


def _derive_risk_score(agent: dict) -> int:
    """Derive risk score from agent attributes (0-100)."""
    score = 0
    score += (agent.get("scope_level", 1) - 1) * 16
    env = agent.get("environment", "dev")
    score += 18 if env == "prod" else (8 if env == "pilot" else 0)
    score += agent.get("open_incidents", 0) * 14
    score += 0 if agent.get("has_policy") else 16
    return min(100, score)


class GovernFleetService:
    def __init__(self, region: str = "us-east-1"):
        #: Fallback region, used only when the governed-region set is empty. The
        #: fleet is read per governed region (see _fetch_all_agents), so this is
        #: NOT the region the data comes from.
        self.region = region

    def _bedrock_agent(self, region: str):
        return boto3.client("bedrock-agent", region_name=region)

    def _agentcore(self, region: str):
        return boto3.client("bedrock-agentcore-control", region_name=region)

    def _bedrock(self, region: str):
        return boto3.client("bedrock", region_name=region)

    def _scope_key(self) -> str:
        """Cache-key component covering the whole governed set, not one region.

        Keying on self.region would serve a single-region aggregate after a region
        is pulled into governance, until the TTL happened to expire.
        """
        return ",".join(get_governed_regions() or [self.region])

    # ─────────────────── Data fetching (raw agent lists) ───────────────────

    def _fetch_region_agents(self, region: str) -> tuple[List[dict], bool, List[str]]:
        """Agents in one region, normalized. Returns (agents, live, source_parts)."""
        agents: List[dict] = []
        sources: List[str] = []
        live = False

        # 1) Bedrock Agents (classic)
        try:
            client = self._bedrock_agent(region)
            paginator = client.get_paginator("list_agents")
            for page in paginator.paginate():
                for a in page.get("agentSummaries", []):
                    agents.append({
                        "id": f"bedrock-{a['agentId']}",
                        "name": a.get("agentName", a["agentId"]),
                        "platform": "bedrock-agent",
                        "status": a.get("agentStatus", "UNKNOWN"),
                        "scope_level": 3,  # Default supervised for classic agents
                        "environment": "prod",  # Assume production
                        "provider": "aws",
                        "business_unit": "Bedrock Agents",
                        "has_policy": False,  # Would need guardrail check
                        "open_incidents": 0,
                        "model": "Unknown",
                        "region": region,
                    })
            sources.append(f"{len([a for a in agents if a['platform'] == 'bedrock-agent'])} Bedrock")
            live = True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Bedrock Agents unavailable in {region}: {e}")
            sources.append(f"Bedrock unavailable ({region})")

        # 2) AgentCore runtimes
        try:
            client = self._agentcore(region)
            paginator = client.get_paginator("list_agent_runtimes")
            for page in paginator.paginate():
                for r in page.get("agentRuntimes", []):
                    agents.append({
                        "id": f"agentcore-{r['agentRuntimeId']}",
                        "name": r.get("agentRuntimeName", r["agentRuntimeId"]),
                        "platform": "agentcore-runtime",
                        "status": r.get("status", "UNKNOWN"),
                        "scope_level": 3,  # Default supervised
                        "environment": "prod",
                        "provider": "aws",
                        "business_unit": "AgentCore",
                        "has_policy": True,  # AgentCore has policy engine
                        "open_incidents": 0,
                        "model": "Unknown",
                        "region": region,
                    })
            ac_count = len([a for a in agents if a["platform"] == "agentcore-runtime"])
            sources.append(f"{ac_count} AgentCore")
            live = True
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"AgentCore unavailable in {region}: {e}")
            sources.append(f"AgentCore unavailable ({region})")

        return agents, live, sources

    def _fetch_all_agents(self) -> tuple[List[dict], bool, str, RegionProvenance]:
        """Fetch agents across every governed region, normalized to a common shape.

        The fan-out happens here rather than at the four endpoints because all four
        aggregate the same raw list. Merging four already-aggregated responses would
        mean averaging percentages and re-bucketing distributions per region; fanning
        out at the source means the aggregation code is untouched and correct by
        construction. Every agent carries the region it was read from.

        Returns (agents, live, source_note, region_provenance).
        """
        results = run_over_regions(self._fetch_region_agents)
        # _fetch_region_agents returns (agents, live, sources), not a response model, so
        # liveness has to be read out of the tuple. Without live_of the default reads a
        # `live` field off the result, finds none, and marks EVERY region degraded — the
        # fleet reported "no live data from us-east-1" while serving 36 live agents.
        prov = provenance(results, live_of=lambda res: bool(res[1]))

        agents: List[dict] = []
        source_parts: List[str] = []
        live = False
        for region, res in results:
            if res is None:
                source_parts.append(f"{region} unreachable")
                continue
            region_agents, region_live, region_sources = res
            agents.extend(region_agents)
            live = live or region_live
            if region_sources:
                source_parts.append(f"{region}: {' · '.join(region_sources)}")

        # Enrich with derived fields
        for agent in agents:
            if "governance_status" not in agent:
                agent["governance_status"] = _derive_governance_status(agent)
            if "risk_score" not in agent:
                agent["risk_score"] = _derive_risk_score(agent)

        source_note = " | ".join(source_parts) if source_parts else "No sources available"
        return agents, live, source_note, prov

    # ─────────────────── Summary aggregation ───────────────────

    def get_summary(self) -> FleetSummaryResponse:
        result, cached_at = get_or_load(
            f"fleet:summary:{self._scope_key()}", _TTL,
            self._fetch_summary, should_cache=lambda r: r.live,
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

    def _fetch_summary(self) -> FleetSummaryResponse:
        agents, live, source_note, prov = self._fetch_all_agents()

        summary = FleetSummary(
            total=len(agents),
            governance=GovernanceDistribution(),
            risk=RiskDistribution(),
            scope=ScopeDistribution(),
            live=live,
            source=source_note,
        )

        for agent in agents:
            # Governance
            gov = agent.get("governance_status", "unknown")
            if gov == "compliant":
                summary.governance.compliant += 1
            elif gov == "review_needed":
                summary.governance.review_needed += 1
            elif gov == "blocked":
                summary.governance.blocked += 1
            else:
                summary.governance.unknown += 1

            # Risk
            tier = _risk_tier(agent.get("risk_score", 0))
            if tier == "critical":
                summary.risk.critical += 1
            elif tier == "high":
                summary.risk.high += 1
            elif tier == "medium":
                summary.risk.medium += 1
            else:
                summary.risk.low += 1

            # Scope
            scope = agent.get("scope_level", 1)
            if scope == 1:
                summary.scope.l1_no_agency += 1
            elif scope == 2:
                summary.scope.l2_prescribed += 1
            elif scope == 3:
                summary.scope.l3_supervised += 1
            elif scope == 4:
                summary.scope.l4_full_agency += 1

            # Extras
            if agent.get("environment") == "prod" and agent.get("scope_level") == 4:
                summary.prod_full_agency += 1
            summary.open_incidents += agent.get("open_incidents", 0)
            if not agent.get("has_policy"):
                summary.unprotected += 1
            if _needs_attention(agent):
                summary.needs_attention += 1

        summary.pct_compliant = (
            round((summary.governance.compliant / summary.total) * 100) if summary.total else 0
        )

        return FleetSummaryResponse(
            summary=summary,
            live=live,
            source=source_note,
            note=prov.summary(),
            regions=prov,
        )

    # ─────────────────── Segments (grouped aggregation) ───────────────────

    def get_segments(self, group_by: str = "businessUnit") -> FleetSegmentsResponse:
        result, cached_at = get_or_load(
            f"fleet:segments:{self._scope_key()}:{group_by}", _TTL,
            lambda: self._fetch_segments(group_by), should_cache=lambda r: r.live,
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

    def _fetch_segments(self, group_by: str) -> FleetSegmentsResponse:
        agents, live, source_note, prov = self._fetch_all_agents()

        key_fn = {
            "businessUnit": lambda a: a.get("business_unit", "Unknown"),
            "provider": lambda a: a.get("provider", "unknown"),
            "environment": lambda a: a.get("environment", "dev"),
        }.get(group_by, lambda a: a.get("business_unit", "Unknown"))

        buckets: dict[str, dict] = defaultdict(lambda: {
            "total": 0, "compliant": 0, "review_needed": 0, "blocked": 0, "critical": 0, "high": 0
        })

        for agent in agents:
            key = key_fn(agent)
            b = buckets[key]
            b["total"] += 1

            gov = agent.get("governance_status")
            if gov == "compliant":
                b["compliant"] += 1
            elif gov == "review_needed":
                b["review_needed"] += 1
            elif gov == "blocked":
                b["blocked"] += 1

            tier = _risk_tier(agent.get("risk_score", 0))
            if tier == "critical":
                b["critical"] += 1
            elif tier == "high":
                b["high"] += 1

        segments = [
            SegmentRow(
                key=key,
                total=d["total"],
                compliant=d["compliant"],
                review_needed=d["review_needed"],
                blocked=d["blocked"],
                critical=d["critical"],
                high=d["high"],
                pct_compliant=round((d["compliant"] / d["total"]) * 100) if d["total"] else 0,
            )
            for key, d in buckets.items()
        ]
        segments.sort(key=lambda s: s.total, reverse=True)

        return FleetSegmentsResponse(
            group_by=group_by,
            segments=segments,
            live=live,
            source=source_note,
            note=prov.summary(),
            regions=prov,
        )

    # ─────────────────── Exception queue ───────────────────

    def get_exceptions(self, limit: int = 100, filter_key: Optional[str] = None) -> FleetExceptionsResponse:
        result, cached_at = get_or_load(
            f"fleet:exceptions:{self._scope_key()}:{limit}:{filter_key or 'all'}", _TTL,
            lambda: self._fetch_exceptions(limit, filter_key), should_cache=lambda r: r.live,
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

    def _fetch_exceptions(self, limit: int, filter_key: Optional[str]) -> FleetExceptionsResponse:
        agents, live, source_note, prov = self._fetch_all_agents()

        if filter_key:
            agents = [a for a in agents if a.get("business_unit") == filter_key]

        needing_attention = [a for a in agents if _needs_attention(a)]
        total_needing = len(needing_attention)

        # Sort by attention score descending, take top N
        needing_attention.sort(key=_attention_score, reverse=True)
        queue_agents = needing_attention[:limit]

        queue = []
        for a in queue_agents:
            reasons = []
            gov = a.get("governance_status")
            if gov == "blocked":
                reasons.append("blocked")
            elif gov == "review_needed":
                reasons.append("review needed")
            if not a.get("has_policy"):
                reasons.append("no policy")
            incidents = a.get("open_incidents", 0)
            if incidents > 0:
                reasons.append(f"{incidents} open incident{'s' if incidents > 1 else ''}")
            if a.get("scope_level") == 4 and a.get("environment") == "prod":
                reasons.append("prod full-agency")

            queue.append(ExceptionAgent(
                id=a["id"],
                name=a["name"],
                business_unit=a.get("business_unit", "Unknown"),
                environment=a.get("environment", "dev"),
                provider=a.get("provider", "unknown"),
                scope_level=a.get("scope_level", 1),
                governance_status=a.get("governance_status", "unknown"),
                risk_score=a.get("risk_score", 0),
                open_incidents=a.get("open_incidents", 0),
                has_policy=a.get("has_policy", False),
                attention_score=_attention_score(a),
                reasons=reasons,
                region=a.get("region"),
            ))

        return FleetExceptionsResponse(
            queue=queue,
            queue_size=len(queue),
            total_needing_attention=total_needing,
            limit=limit,
            filter_key=filter_key,
            live=live,
            source=source_note,
            note=prov.summary(),
            regions=prov,
        )

    # ─────────────────── Inventory breakdown ───────────────────

    def get_inventory(self) -> FleetInventoryResponse:
        result, cached_at = get_or_load(
            f"fleet:inventory:{self._scope_key()}", _TTL,
            self._fetch_inventory, should_cache=lambda r: r.live,
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

    def _fetch_inventory(self) -> FleetInventoryResponse:
        agents, live, source_note, prov = self._fetch_all_agents()
        total = len(agents) or 1

        # By model
        model_counts: dict[str, int] = defaultdict(int)
        for a in agents:
            model_counts[a.get("model", "Unknown")] += 1
        by_model = [
            InventoryRow(key=k, count=v, pct_of_fleet=round((v / total) * 100))
            for k, v in model_counts.items()
        ]
        by_model.sort(key=lambda r: r.count, reverse=True)

        # By provider
        provider_counts: dict[str, int] = defaultdict(int)
        for a in agents:
            provider_counts[a.get("provider", "unknown")] += 1
        by_provider = [
            InventoryRow(key=k, count=v, pct_of_fleet=round((v / total) * 100))
            for k, v in provider_counts.items()
        ]
        by_provider.sort(key=lambda r: r.count, reverse=True)

        return FleetInventoryResponse(
            by_model=by_model,
            by_provider=by_provider,
            live=live,
            source=source_note,
            note=prov.summary(),
            regions=prov,
        )
