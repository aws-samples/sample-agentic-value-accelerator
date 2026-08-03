"""Govern Security service — unified AWS security posture, read-through + cached.

Pulls findings from GuardDuty, Macie, Inspector2, and IAM Access Analyzer — each
from its own API — and normalizes them into a per-source severity rollup. Follows
the govern_cost convention: honest live/source/note, graceful per-source fallback
(one dead service never breaks the others), short TTL cache.

Surfaces finding TYPE + severity + resource-type + counts only — never the raw
title/resource strings, which embed sensitive identifiers.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_security import (
    SecurityPostureResponse,
    SecuritySourceSummary,
    SeverityCount,
)

logger = logging.getLogger(__name__)

_SECURITY_TTL = 120  # 2 min
_MAX_PER_SOURCE = 200  # cap findings scanned per service

_SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
_SEV_RANK = {s: i for i, s in enumerate(_SEV_ORDER)}


def _guardduty_severity(score: float) -> str:
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def _summarize(source: str, label: str, dimension: str, sev_labels: list[str],
               types: list[str]) -> SecuritySourceSummary:
    counts = Counter(s for s in sev_labels if s in _SEV_RANK)
    by_sev = [SeverityCount(severity=s, count=counts[s]) for s in _SEV_ORDER if counts.get(s)]
    top_types = [t for t, _ in Counter(types).most_common(4)]
    return SecuritySourceSummary(
        source=source, label=label, dimension=dimension,
        total=len(sev_labels), critical=counts.get("CRITICAL", 0), high=counts.get("HIGH", 0),
        by_severity=by_sev, top_types=top_types, live=True,
    )


class GovernSecurityService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

    # ── Per-source fetchers (each returns a SecuritySourceSummary, never raises) ──

    def _guardduty(self) -> SecuritySourceSummary:
        try:
            gd = boto3.client("guardduty", region_name=self.region)
            detectors = gd.list_detectors().get("DetectorIds", [])
            if not detectors:
                return SecuritySourceSummary(source="guardduty", label="GuardDuty", dimension="Threats",
                                             live=False, note="GuardDuty not enabled (no detector).")
            did = detectors[0]
            ids = gd.list_findings(
                DetectorId=did,
                FindingCriteria={"Criterion": {"service.archived": {"Eq": ["false"]}}},
                MaxResults=50,
            ).get("FindingIds", [])[:_MAX_PER_SOURCE]
            sevs, types = [], []
            for i in range(0, len(ids), 50):
                for f in gd.get_findings(DetectorId=did, FindingIds=ids[i:i + 50]).get("Findings", []):
                    sevs.append(_guardduty_severity(float(f.get("Severity", 0) or 0)))
                    types.append((f.get("Type", "") or "").split(":")[0] or "Threat")
            return _summarize("guardduty", "GuardDuty", "Threats", sevs, types)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("GuardDuty unavailable: %s", e)
            return SecuritySourceSummary(source="guardduty", label="GuardDuty", dimension="Threats",
                                         live=False, note="GuardDuty unreachable or not permitted.")

    def _macie(self) -> SecuritySourceSummary:
        try:
            mc = boto3.client("macie2", region_name=self.region)
            ids = mc.list_findings(maxResults=50).get("findingIds", [])[:_MAX_PER_SOURCE]
            sevs, types = [], []
            for i in range(0, len(ids), 50):
                for f in mc.get_findings(findingIds=ids[i:i + 50]).get("findings", []):
                    sevs.append(((f.get("severity", {}) or {}).get("description", "") or "").upper())
                    types.append(f.get("category", "") or f.get("type", "") or "Finding")
            return _summarize("macie", "Macie", "Sensitive data", sevs, types)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Macie unavailable: %s", e)
            return SecuritySourceSummary(source="macie", label="Macie", dimension="Sensitive data",
                                         live=False, note="Macie not enabled or not permitted.")

    def _inspector(self) -> SecuritySourceSummary:
        try:
            ins = boto3.client("inspector2", region_name=self.region)
            paginator = ins.get_paginator("list_findings")
            sevs, types = [], []
            for page in paginator.paginate(
                filterCriteria={"findingStatus": [{"comparison": "EQUALS", "value": "ACTIVE"}]},
                PaginationConfig={"MaxItems": _MAX_PER_SOURCE, "PageSize": 100},
            ):
                for f in page.get("findings", []):
                    sevs.append((f.get("severity", "") or "").upper())
                    types.append(f.get("type", "") or "Vulnerability")
            return _summarize("inspector", "Inspector", "Vulnerabilities", sevs, types)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Inspector2 unavailable: %s", e)
            return SecuritySourceSummary(source="inspector", label="Inspector", dimension="Vulnerabilities",
                                         live=False, note="Inspector not enabled or not permitted.")

    def _access_analyzer(self) -> SecuritySourceSummary:
        try:
            aa = boto3.client("accessanalyzer", region_name=self.region)
            analyzers = aa.list_analyzers().get("analyzers", [])
            active = [a for a in analyzers if a.get("status") == "ACTIVE"]
            if not active:
                return SecuritySourceSummary(source="access-analyzer", label="Access Analyzer",
                                             dimension="External access", live=False,
                                             note="No active IAM Access Analyzer.")
            arn = active[0]["arn"]
            sevs, types = [], []
            paginator = aa.get_paginator("list_findings_v2") if aa.can_paginate("list_findings_v2") else None
            findings = []
            if paginator:
                for page in paginator.paginate(analyzerArn=arn, filter={"status": {"eq": ["ACTIVE"]}},
                                                PaginationConfig={"MaxItems": _MAX_PER_SOURCE, "PageSize": 100}):
                    findings.extend(page.get("findings", []))
            else:
                findings = aa.list_findings_v2(analyzerArn=arn, filter={"status": {"eq": ["ACTIVE"]}},
                                               maxResults=100).get("findings", [])
            for f in findings[:_MAX_PER_SOURCE]:
                # Access Analyzer has no native severity — derive: public > cross-account.
                is_public = bool(f.get("isPublic", False))
                sevs.append("HIGH" if is_public else "MEDIUM")
                types.append(f.get("resourceType", "") or "ExternalAccess")
            return _summarize("access-analyzer", "Access Analyzer", "External access", sevs, types)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Access Analyzer unavailable: %s", e)
            return SecuritySourceSummary(source="access-analyzer", label="Access Analyzer",
                                         dimension="External access", live=False,
                                         note="Access Analyzer unreachable or not permitted.")

    def get_posture(self) -> SecurityPostureResponse:
        """Cached wrapper around the multi-service security posture fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"security:posture:{self.region}", _SECURITY_TTL,
            self._fetch_posture, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_posture(self) -> SecurityPostureResponse:
        # Parallelize the 4 AWS security service calls — cuts cold-load from ~6s to ~2s.
        fetchers = [self._guardduty, self._macie, self._inspector, self._access_analyzer]
        sources: list[SecuritySourceSummary] = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fn): fn.__name__ for fn in fetchers}
            for fut in as_completed(futures):
                try:
                    sources.append(fut.result())
                except Exception as e:
                    logger.warning("Security source %s failed: %s", futures[fut], e)
        live_sources = [s for s in sources if s.live]
        total = sum(s.total for s in live_sources)
        crit = sum(s.critical for s in live_sources)
        high = sum(s.high for s in live_sources)
        return SecurityPostureResponse(
            sources=sources,
            total_findings=total, critical=crit, high=high,
            sources_live=len(live_sources), sources_total=len(sources),
            live=len(live_sources) > 0,
            source="aws-security-services",
            note=None if live_sources else "No security services returned findings — none enabled or access denied.",
        )
