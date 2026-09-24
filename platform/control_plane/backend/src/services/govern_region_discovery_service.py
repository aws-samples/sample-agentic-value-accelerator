"""Govern Region Discovery — scan enabled AWS regions for governed-AI resources.

Probes each enabled region IN PARALLEL (bounded pool, fast-fail timeouts) for
Bedrock guardrails, AgentCore runtimes/identities/gateways, Bedrock knowledge bases,
and Bedrock invocation activity, so the UI can surface active-but-ungoverned regions
and prompt the operator to bring them under governance.

Serial cross-region scanning is too slow (services like bedrock-agentcore-control do
not exist in every region and block), so every probe uses a short connect/read timeout
with no retries, and regions are probed concurrently. Result is TTL-cached.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

from core.region_config import get_governed_regions
from core.config import settings
from core.ttl_cache import get_or_load
from models.govern_regions import RegionDiscoveryResponse, RegionSignal

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min — discovery is expensive; regions change rarely
_MAX_WORKERS = 10

# Fallback when ec2:DescribeRegions is unavailable — the Bedrock-capable regions.
_FALLBACK_REGIONS = [
    "us-east-1", "us-east-2", "us-west-2", "us-west-1",
    "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
    "ap-south-1", "ap-southeast-1", "ap-southeast-2",
    "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
    "ca-central-1", "sa-east-1",
]


class GovernRegionDiscoveryService:
    def __init__(self, control_region: str | None = None):
        self.control_region = control_region or settings.AWS_REGION
        # Fast-fail so probing a region that lacks a service doesn't block the scan.
        self._cfg = Config(connect_timeout=3, read_timeout=6, retries={"max_attempts": 1})

    def _enabled_regions(self) -> list[str]:
        try:
            ec2 = boto3.client("ec2", region_name=self.control_region, config=self._cfg)
            resp = ec2.describe_regions()
            regions = [
                r["RegionName"]
                for r in resp.get("Regions", [])
                if r.get("OptInStatus") in ("opt-in-not-required", "opted-in")
            ]
            return regions or _FALLBACK_REGIONS
        except Exception as e:
            logger.info("describe_regions unavailable (%s); using fallback region list", e)
            return _FALLBACK_REGIONS

    def _count(self, fn, *keys) -> int:
        """Run a list call and return the length of the first present list key."""
        resp = fn()
        for k in keys:
            v = resp.get(k)
            if isinstance(v, list):
                return len(v)
        return 0

    def _probe(self, region: str) -> RegionSignal:
        sig = RegionSignal(region=region)
        probed_ok = False

        # Bedrock guardrails
        try:
            bedrock = boto3.client("bedrock", region_name=region, config=self._cfg)
            sig.guardrails = self._count(bedrock.list_guardrails, "guardrails")
            probed_ok = True
        except Exception:
            pass

        # AgentCore runtimes / identities / gateways
        try:
            ac = boto3.client("bedrock-agentcore-control", region_name=region, config=self._cfg)
            sig.agent_runtimes = self._count(ac.list_agent_runtimes, "agentRuntimes")
            sig.workload_identities = self._count(ac.list_workload_identities, "workloadIdentities")
            sig.gateways = self._count(ac.list_gateways, "items", "gateways")
            probed_ok = True
        except Exception:
            pass

        # Bedrock knowledge bases
        try:
            agent = boto3.client("bedrock-agent", region_name=region, config=self._cfg)
            sig.knowledge_bases = self._count(agent.list_knowledge_bases, "knowledgeBaseSummaries")
            probed_ok = True
        except Exception:
            pass

        # Bedrock invocation activity (cheap presence check)
        try:
            cw = boto3.client("cloudwatch", region_name=region, config=self._cfg)
            metrics = cw.list_metrics(Namespace="AWS/Bedrock", MetricName="Invocations")
            sig.has_bedrock_activity = len(metrics.get("Metrics", [])) > 0
            probed_ok = True
        except Exception:
            pass

        sig.resource_total = (
            sig.guardrails + sig.agent_runtimes + sig.workload_identities
            + sig.gateways + sig.knowledge_bases
        )
        sig.reachable = probed_ok
        if not probed_ok:
            sig.note = "No governed-AI services reachable in this region."
        return sig

    def discover(self) -> RegionDiscoveryResponse:
        # Cache only the expensive region probes; overlay the governed set FRESH so a
        # "pull region into governance" action reflects immediately (no TTL wait).
        signals, _ = get_or_load(
            "region:scan", _TTL, self._scan_signals,
            should_cache=lambda sigs: any(s.reachable for s in sigs),
        )
        governed = set(get_governed_regions())

        overlaid = [s.model_copy(update={"governed": s.region in governed}) for s in signals]
        # Sort: most resources first, then name — the interesting regions float up.
        overlaid.sort(key=lambda s: (-s.resource_total, s.region))

        # A region is a "pull-in" candidate when it has real signals but isn't governed.
        discovered_ungoverned = [
            s.region for s in overlaid
            if not s.governed and (s.resource_total > 0 or s.has_bedrock_activity)
        ]

        return RegionDiscoveryResponse(
            regions=overlaid,
            governed_regions=sorted(governed),
            discovered_ungoverned=discovered_ungoverned,
            regions_scanned=len(overlaid),
            live=True,
            source="region-discovery",
            note=(
                f"{len(discovered_ungoverned)} region(s) with governed-AI activity are not yet under governance."
                if discovered_ungoverned else "All regions with governed-AI activity are under governance."
            ),
        )

    def _scan_signals(self) -> list[RegionSignal]:
        """Probe every enabled region in parallel (cached; governed flags applied later)."""
        regions = self._enabled_regions()
        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
            return list(pool.map(self._probe, regions))
