"""Govern Security — unified AWS security posture, aggregated across governed regions."""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends

from core import region_scope
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from models.govern_security import (
    SecurityPostureResponse,
    SecuritySourceSummary,
    SeverityCount,
    VulnerabilitiesResponse,
    VulnerabilityFinding,
)
from services.govern_security_service import GovernSecurityService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/security", tags=["govern-security"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_security", region_scope.MULTI_REGION, prefix="/govern/security")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernSecurityService] = {}


def _svc_for(region: str) -> GovernSecurityService:
    if region not in _svcs:
        _svcs[region] = GovernSecurityService(region=region)
    return _svcs[region]


# Canonical severity display order — mirrors the service so merged by_severity
# stays consistent (and identical to the single-region output).
_SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
_SEV_RANK = {s: i for i, s in enumerate(_SEV_ORDER)}


def _merge_source(source_key: str, per_region: List[dict]) -> SecuritySourceSummary:
    """Combine one security source's summary across regions.

    Sums total/critical/high, merges by_severity by severity (summing count),
    unions top_types (first-seen order, de-duplicated), and is live if the source
    was live in ANY region.
    """
    label = ""
    dimension = ""
    total = crit = high = 0
    sev_counts: Dict[str, int] = {}
    top_types: List[str] = []
    notes: List[str] = []
    live = False
    for d in per_region:
        label = label or d.get("label", "")
        dimension = dimension or d.get("dimension", "")
        total += d.get("total", 0)
        crit += d.get("critical", 0)
        high += d.get("high", 0)
        for sc in d.get("by_severity", []) or []:
            sev = sc.get("severity")
            if sev is not None:
                sev_counts[sev] = sev_counts.get(sev, 0) + sc.get("count", 0)
        for t in d.get("top_types", []) or []:
            if t not in top_types:
                top_types.append(t)
        note = d.get("note")
        if note and note not in notes:
            notes.append(note)
        live = live or bool(d.get("live"))

    # Emit severities in canonical order (then any non-canonical extras), non-zero only.
    ordered = [s for s in _SEV_ORDER if sev_counts.get(s)]
    ordered += [s for s in sev_counts if s not in _SEV_ORDER and sev_counts.get(s)]
    by_severity = [SeverityCount(severity=s, count=sev_counts[s]) for s in ordered]

    return SecuritySourceSummary(
        source=source_key,
        label=label,
        dimension=dimension,
        total=total,
        critical=crit,
        high=high,
        by_severity=by_severity,
        top_types=top_types,
        live=live,
        note="; ".join(notes) or None,
    )


def _merge(results: List[Tuple[str, object]]) -> SecurityPostureResponse:
    """Aggregate per-region security postures into one fleet-wide posture."""
    # Group each region's per-source summaries by source key (first-seen order).
    grouped: Dict[str, List[dict]] = {}
    total_findings = critical = high = 0
    sources_live = sources_total = 0
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for s in d.get("sources", []) or []:
            key = s.get("source")
            if key is None:
                continue
            grouped.setdefault(key, []).append(s)
        total_findings += d.get("total_findings", 0)
        critical += d.get("critical", 0)
        high += d.get("high", 0)
        # sources_live / sources_total count per (region, service) instance across the
        # fleet, so both are summed — keeping sources_live <= sources_total. (max would
        # break that invariant: e.g. 3 regions x 5 live would give live=15 > total=5.)
        sources_live += d.get("sources_live", 0)
        sources_total += d.get("sources_total", 0)
        live = live or bool(d.get("live"))

    sources = [_merge_source(key, per_region) for key, per_region in grouped.items()]
    n_live = live_region_count(results)
    return SecurityPostureResponse(
        sources=sources,
        total_findings=total_findings,
        critical=critical,
        high=high,
        sources_live=sources_live,
        sources_total=sources_total,
        live=live,
        source=f"aws-security-services ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


def _merge_vulns(results: List[Tuple[str, object]], max_findings: int) -> VulnerabilitiesResponse:
    """Aggregate per-region Inspector2 vulnerability findings into one fleet-wide view.

    Concatenates findings (worst-severity first, capped at max_findings), sums the
    severity/type/coverage counts, and is live if Inspector2 was live in ANY region.
    """
    findings: List[VulnerabilityFinding] = []
    total = crit = high = med = low = covered = 0
    sev_counts: Dict[str, int] = {}
    type_counts: Dict[str, int] = {}
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for f in d.get("findings", []) or []:
            findings.append(VulnerabilityFinding(**f))
        total += d.get("total", 0)
        crit += d.get("critical", 0)
        high += d.get("high", 0)
        med += d.get("medium", 0)
        low += d.get("low", 0)
        covered += d.get("covered_resources", 0)
        for sc in d.get("by_severity", []) or []:
            sev = sc.get("severity")
            if sev is not None:
                sev_counts[sev] = sev_counts.get(sev, 0) + sc.get("count", 0)
        for t, c in (d.get("by_type", {}) or {}).items():
            type_counts[t] = type_counts.get(t, 0) + c
        live = live or bool(d.get("live"))

    findings.sort(key=lambda x: _SEV_RANK.get(x.severity, 99))
    findings = findings[:max_findings]

    ordered = [s for s in _SEV_ORDER if sev_counts.get(s)]
    ordered += [s for s in sev_counts if s not in _SEV_ORDER and sev_counts.get(s)]
    by_severity = [SeverityCount(severity=s, count=sev_counts[s]) for s in ordered]

    n_live = live_region_count(results)
    return VulnerabilitiesResponse(
        findings=findings,
        total=total,
        by_severity=by_severity,
        critical=crit,
        high=high,
        medium=med,
        low=low,
        by_type=type_counts,
        covered_resources=covered,
        live=live,
        source=f"inspector2 ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


@router.get("/posture", response_model=SecurityPostureResponse)
def get_security_posture(_=Depends(require_role(Role.VIEWER))):
    """Unified security posture from GuardDuty, Macie, Inspector, Access Analyzer &
    Detective, aggregated across all governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_posture())
    return _merge(results)


@router.get("/vulnerabilities", response_model=VulnerabilitiesResponse)
def get_vulnerabilities(max_findings: int = 100, _=Depends(require_role(Role.VIEWER))):
    """Detailed Inspector2 vulnerability findings (real CVEs on EC2/ECR/Lambda) with a
    severity + type + coverage rollup, aggregated across all governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_vulnerabilities(max_findings))
    return _merge_vulns(results, max_findings)
