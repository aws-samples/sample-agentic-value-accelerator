"""Govern Risk Posture — real Security Hub findings, read-through GET route.

Security Hub is a tier-2 governed read enabled per region, so this fans out over the
governed set — with one exception that has to be handled or the numbers are wrong.

If the account has cross-region finding aggregation enabled, GetFindings in the
aggregation region already returns findings from every linked region. Summing a
fan-out on top of that counts the same finding once per region and inflates every
severity total. So the route asks first, then either reads once from the aggregation
region or fans out and sums, and says in `note` which of the two it did.
"""

import logging
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.multiregion import as_dict, is_live, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from core.region_config import get_governed_regions
from models.govern_risk_posture import RiskPostureResponse, SecurityFinding, SeverityCount
from services.govern_risk_posture_service import GovernRiskPostureService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/risk-posture", tags=["govern-risk-posture"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_risk_posture", region_scope.MULTI_REGION, prefix="/govern/risk-posture")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernRiskPostureService] = {}

_SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]
_SEVERITY_RANK = {s: i for i, s in enumerate(_SEVERITY_ORDER)}

Results = List[Tuple[str, object]]


def _svc_for(region: str) -> GovernRiskPostureService:
    if region not in _svcs:
        _svcs[region] = GovernRiskPostureService(region=region)
    return _svcs[region]


def _aggregation_region(regions: List[str]) -> Optional[str]:
    """The account's Security Hub aggregation region, asking every governed region.

    Asking all of them rather than one: the probe is cheap and cached, and a single
    region that happens to be unreachable must not make an aggregating account look
    non-aggregating - that misread is what produces inflated counts.
    """
    if not regions:
        return None
    for _region, agg in run_over_regions(lambda r: _svc_for(r).get_aggregation_region(), regions=regions):
        if agg:
            return agg
    return None


def _merge_posture(results: Results, scan: int, base_note: Optional[str] = None) -> RiskPostureResponse:
    """Sum severity counts across regions; re-rank the merged top findings.

    Top findings are re-sorted from the pooled set rather than interleaved, so the
    10 shown are the 10 worst in the governed set and not the worst 10/N per region.
    Deduped by finding id: ids are full ARNs, so the same finding reached through two
    paths collapses to one row instead of being counted twice.
    """
    counts: Dict[str, int] = {}
    pooled: Dict[str, SecurityFinding] = {}
    total = scanned = 0
    truncated = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        for sc in d.get("by_severity") or []:
            sev = sc.get("severity") or "INFORMATIONAL"
            counts[sev] = counts.get(sev, 0) + int(sc.get("count") or 0)
        for f in d.get("top_findings") or []:
            fid = f.get("id") or ""
            if fid and fid not in pooled:
                pooled[fid] = SecurityFinding(**f)
        total += int(d.get("total") or 0)
        scanned += int(d.get("scanned") or 0)
        truncated = truncated or bool(d.get("truncated"))

    findings = list(pooled.values())
    findings.sort(key=lambda x: x.updated_at or "", reverse=True)          # recent first
    findings.sort(key=lambda x: _SEVERITY_RANK.get(x.severity, 99))        # severity primary
    ordered = [s for s in _SEVERITY_ORDER if counts.get(s)] + sorted(
        s for s in counts if s not in _SEVERITY_RANK and counts.get(s)
    )
    n_live = live_region_count(results)
    return RiskPostureResponse(
        by_severity=[SeverityCount(severity=s, count=counts[s]) for s in ordered],
        top_findings=findings[:10],
        total=total,
        critical=counts.get("CRITICAL", 0),
        high=counts.get("HIGH", 0),
        scanned=scanned,
        truncated=truncated,
        live=any(is_live(resp) for _r, resp in results),
        source=f"security-hub ({n_live} region(s))",
        note=merge_note(results, base=base_note),
        regions=provenance(results),
    )


@router.get("/security-hub", response_model=RiskPostureResponse)
async def get_security_hub_posture(scan: int = Query(default=200, ge=10, le=500), _=Depends(require_role(Role.VIEWER))):
    """Security Hub risk posture — severity roll-up + top open findings (securityhub:GetFindings).

    Aggregated across governed regions, unless the account aggregates findings itself
    (see module docstring) — in which case this is a single read of the aggregation
    region and `note` says so.
    """
    governed = get_governed_regions()
    agg = _aggregation_region(governed)
    if agg:
        others = [r for r in governed if r != agg]
        base = (
            f"Security Hub cross-region aggregation is enabled: read once from {agg}, "
            "which already includes its linked regions."
        )
        if others:
            base += f" Not queried separately (would double-count): {', '.join(others)}."
        results = run_over_regions(lambda r: _svc_for(r).get_posture(scan=scan), regions=[agg])
        return _merge_posture(results, scan, base_note=base)

    results = run_over_regions(lambda r: _svc_for(r).get_posture(scan=scan))
    return _merge_posture(results, scan)
