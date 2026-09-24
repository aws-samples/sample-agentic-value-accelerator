"""Govern Security service — unified AWS security posture, read-through + cached.

Pulls findings from GuardDuty, Macie, Inspector2, IAM Access Analyzer, and
Detective — each from its own API — and normalizes them into a per-source
severity rollup. Follows the govern_cost convention: honest live/source/note,
graceful per-source fallback (one dead service never breaks the others), short
TTL cache.

Surfaces finding TYPE + severity + resource-type + counts only — never the raw
title/resource strings, which embed sensitive identifiers.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

from core.aws_paging import PageResult, paginate_bounded
from core.security_utils import mask_account_id, mask_arn, mask_arn_in_text
from core.ttl_cache import get_or_load
from models.govern_security import (
    SecurityPostureResponse,
    SecuritySourceSummary,
    SeverityCount,
    VulnerabilitiesResponse,
    VulnerabilityFinding,
)

logger = logging.getLogger(__name__)

_SECURITY_TTL = 120  # 2 min
_VULN_TTL = 120  # 2 min — Inspector2 vulnerability detail
_MAX_PER_SOURCE = 200  # cap findings scanned per service
_MAX_VULN_FINDINGS = 500  # hard ceiling on the vuln detail list
_MAX_COVERAGE = 5000  # bound on the Inspector2 coverage walk; reaching it is disclosed
_COVERAGE_PAGE = 200  # inspector2:ListCoverage maxResults max (the model says 200, not 100)
_VULN_PAGE = 100      # inspector2:ListFindings maxResults max

# Per-request page sizes at each API's real maximum. GuardDuty's ListFindings maximum is 50,
# which is exactly why its old single call looked correct: the value ON the ceiling reads as
# deliberate, so nobody noticed that _MAX_PER_SOURCE=200 could never be reached from one page.
_GUARDDUTY_PAGE = 50      # guardduty:ListFindings MaxResults max (declared in the model)
_MACIE_PAGE = 50          # macie2:ListFindings maxResults; the value already in production here
_ACCESS_ANALYZER_PAGE = 100  # accessanalyzer:ListFindings maxResults; the value already in use

# GuardDuty and Macie GetFindings take finding ids in batches of at most 50.
_DETAIL_BATCH = 50

# Bound on a single per-source walk. Reaching it is disclosed on that source's note.
_SOURCE_BUDGET_S = 10.0

_SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
_SEV_RANK = {s: i for i, s in enumerate(_SEV_ORDER)}


def _iso(val) -> str | None:
    """Normalize an AWS timestamp (datetime or already-serialized str) to ISO 8601."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _mask_resource_id(raw_id: str | None) -> str | None:
    """Shorten a finding's resource id: reduce ARNs to their tail, mask account IDs, cap length."""
    if not raw_id:
        return None
    short = mask_arn(raw_id) or raw_id  # ARN → resource tail; plain ids pass through
    short = mask_account_id(short) or short  # catch bare account IDs (e.g. Lambda ids)
    return short[:80]


def _sanitize_vuln_title(title: str | None) -> str | None:
    """Sanitize a vuln title for display: strip ARNs + account IDs, keep the CVE.

    Unlike the posture rollup, this detail view intentionally surfaces the CVE
    (it is also exposed as its own field), so the CVE is deliberately NOT redacted.
    """
    if not title:
        return title
    out = mask_arn_in_text(title) or title
    out = mask_account_id(out) or out
    return out[:160]


def _guardduty_severity(score: float) -> str:
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def _floor_note(read: PageResult, label: str) -> str | None:
    """Say the counts are a floor when the finding list was cut short, and nothing otherwise.

    None is the important return value. It is the only signal that this source's `total` is
    an exact count rather than "the first N we managed to read", and a caveat attached to an
    exact count is unfalsifiable - a reader cannot tell it from a real one.
    """
    if read.failed:
        # Named as a failed read, not as an incomplete one. "counts are incomplete" reads as
        # truncation - some findings, not all - when the usual cause is an AccessDenied that
        # returned NONE of them. The source is reported live=False in this case (see
        # _summarize), so this note explains a "—", not a number.
        return (
            f"{label} could not be read ({read.error or 'AWS list call failed'}); "
            "this is a permissions or enablement failure, not a count of zero."
        )
    if read.timed_out:
        return f"{label} finding list stopped at its time budget; counts are a floor, not a total."
    if read.truncated:
        return (
            f"{label} has more than the {_MAX_PER_SOURCE} findings scanned here; "
            "counts are a floor, not a total."
        )
    return None


def _summarize(source: str, label: str, dimension: str, sev_labels: list[str],
               types: list[str], read: PageResult) -> SecuritySourceSummary:
    """Build a source summary, taking liveness from the paged read that produced it.

    `live` used to be the literal `True`, and that was unreachable-by-design wrong rather
    than merely optimistic. paginate_bounded does NOT re-raise: it catches
    (ClientError, BotoCoreError) internally and returns PageResult(failed=True, items=[]).
    So the `except (ClientError, BotoCoreError, ...)` arm each caller wraps around this -
    the arm that returns live=False with "not enabled or not permitted" - could never fire
    for a denied list call. An account without inspector2:ListFindings got
    `total=0, critical=0, high=0, live=True` for Inspector, and the same for GuardDuty,
    Macie, Access Analyzer and Detective: five sources reporting a clean bill of health for
    a scan that never happened, each one incrementing sources_live.

    It surfaced on the executive view. GovernanceCommandCenter renders Security Findings
    from this response, so a denied account showed "0 Critical / 0 High" under a Live badge -
    a reassuring wrong answer, which is the kind that gets believed instead of investigated.

    `read` is required, not defaulted. Every call site already had a PageResult in hand and
    was passing `note=_floor_note(read, label)` from it; taking the PageResult itself means
    liveness and the note cannot drift apart, and a new source cannot be added without
    saying which read backs it.
    """
    counts = Counter(s for s in sev_labels if s in _SEV_RANK)
    by_sev = [SeverityCount(severity=s, count=counts[s]) for s in _SEV_ORDER if counts.get(s)]
    top_types = [t for t, _ in Counter(types).most_common(4)]
    return SecuritySourceSummary(
        source=source, label=label, dimension=dimension,
        total=len(sev_labels), critical=counts.get("CRITICAL", 0), high=counts.get("HIGH", 0),
        by_severity=by_sev, top_types=top_types,
        live=not read.failed, note=_floor_note(read, label),
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
            # 50 IS guardduty:ListFindings' declared maximum, which is what made the old
            # single call look intentional. It was not enough: the `[:_MAX_PER_SOURCE]` slice
            # right after it asks for up to 200 ids, so without paging the source's `total`
            # was hard-capped at 50 and every account above that under-reported by exactly
            # the amount it exceeded 50 - silently, since 50 findings is a plausible number.
            id_read = paginate_bounded(
                gd, "list_findings", "FindingIds",
                page_size=_GUARDDUTY_PAGE, max_items=_MAX_PER_SOURCE,
                budget_s=_SOURCE_BUDGET_S,
                DetectorId=did,
                FindingCriteria={"Criterion": {"service.archived": {"Eq": ["false"]}}},
            )
            ids = id_read.items
            sevs, types = [], []
            for i in range(0, len(ids), _DETAIL_BATCH):
                batch = ids[i:i + _DETAIL_BATCH]
                for f in gd.get_findings(DetectorId=did, FindingIds=batch).get("Findings", []):
                    sevs.append(_guardduty_severity(float(f.get("Severity", 0) or 0)))
                    types.append((f.get("Type", "") or "").split(":")[0] or "Threat")
            return _summarize("guardduty", "GuardDuty", "Threats", sevs, types, id_read)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("GuardDuty unavailable: %s", e)
            return SecuritySourceSummary(source="guardduty", label="GuardDuty", dimension="Threats",
                                         live=False, note="GuardDuty unreachable or not permitted.")

    def _macie(self) -> SecuritySourceSummary:
        try:
            mc = boto3.client("macie2", region_name=self.region)
            # Same defect as GuardDuty above, same fix. Not in the original brief for this
            # sweep, but it is the identical shape in the same file: one capped page, sliced
            # to 200, counted as a total.
            id_read = paginate_bounded(
                mc, "list_findings", "findingIds",
                page_size=_MACIE_PAGE, max_items=_MAX_PER_SOURCE,
                budget_s=_SOURCE_BUDGET_S,
            )
            ids = id_read.items
            sevs, types = [], []
            for i in range(0, len(ids), _DETAIL_BATCH):
                batch = ids[i:i + _DETAIL_BATCH]
                for f in mc.get_findings(findingIds=batch).get("findings", []):
                    sevs.append(((f.get("severity", {}) or {}).get("description", "") or "").upper())
                    types.append(f.get("category", "") or f.get("type", "") or "Finding")
            return _summarize("macie", "Macie", "Sensitive data", sevs, types, id_read)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Macie unavailable: %s", e)
            return SecuritySourceSummary(source="macie", label="Macie", dimension="Sensitive data",
                                         live=False, note="Macie not enabled or not permitted.")

    def _inspector(self) -> SecuritySourceSummary:
        try:
            ins = boto3.client("inspector2", region_name=self.region)
            # Already paged; the change is that hitting _MAX_PER_SOURCE is now disclosed. On a
            # busy account Inspector2 is the source most likely to exceed 200 findings, so
            # this is the total most likely to have been a floor presented as a count.
            sevs, types = [], []
            finding_read = paginate_bounded(
                ins, "list_findings", "findings",
                page_size=100, max_items=_MAX_PER_SOURCE, budget_s=_SOURCE_BUDGET_S,
                filterCriteria={"findingStatus": [{"comparison": "EQUALS", "value": "ACTIVE"}]},
            )
            for f in finding_read.items:
                sevs.append((f.get("severity", "") or "").upper())
                types.append(f.get("type", "") or "Vulnerability")
            return _summarize("inspector", "Inspector", "Vulnerabilities", sevs, types, finding_read)
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
            # Use v1 list_findings (NOT list_findings_v2): its FindingSummary includes
            # isPublic + resourceType. FindingSummaryV2 omits isPublic entirely, so the
            # public→HIGH / cross-account→MEDIUM derivation below silently collapsed to
            # MEDIUM for every external-access finding. v1 restores the HIGH classification.
            # This one was ALREADY paged correctly, so the fix here is only that truncation is
            # now disclosed rather than silent. The `maxResults=100` single-call fallback that
            # used to sit here was unreachable: accessanalyzer:ListFindings answers
            # can_paginate() True on botocore 1.43.10, so the paginator branch always won.
            # Removed rather than left in place - a dead branch containing the exact defect
            # being swept out of this repo is a trap for the next reader.
            finding_read = paginate_bounded(
                aa, "list_findings", "findings",
                page_size=_ACCESS_ANALYZER_PAGE, max_items=_MAX_PER_SOURCE,
                budget_s=_SOURCE_BUDGET_S,
                analyzerArn=arn, filter={"status": {"eq": ["ACTIVE"]}},
            )
            for f in finding_read.items:
                # Access Analyzer has no native severity — derive: public > cross-account.
                is_public = bool(f.get("isPublic", False))
                sevs.append("HIGH" if is_public else "MEDIUM")
                types.append(f.get("resourceType", "") or "ExternalAccess")
            return _summarize("access-analyzer", "Access Analyzer", "External access", sevs, types, finding_read)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Access Analyzer unavailable: %s", e)
            return SecuritySourceSummary(source="access-analyzer", label="Access Analyzer",
                                         dimension="External access", live=False,
                                         note="Access Analyzer unreachable or not permitted.")

    def _detective(self) -> SecuritySourceSummary:
        """Fetch Amazon Detective investigations (requires behavior graph)."""
        try:
            det = boto3.client("detective", region_name=self.region)
            graphs = det.list_graphs().get("GraphList", [])
            if not graphs:
                return SecuritySourceSummary(source="detective", label="Detective",
                                             dimension="Investigations", live=False,
                                             note="No Detective behavior graph found.")
            graph_arn = graphs[0]["Arn"]
            sevs, types = [], []
            # Already paged; the change is that hitting _MAX_PER_SOURCE is now disclosed.
            inv_read = paginate_bounded(
                det, "list_investigations", "InvestigationDetails",
                page_size=50, max_items=_MAX_PER_SOURCE, budget_s=_SOURCE_BUDGET_S,
                GraphArn=graph_arn,
                FilterCriteria={"State": {"Value": "ACTIVE"}},
            )
            for inv in inv_read.items:
                sev = (inv.get("Severity", "") or "").upper()
                if sev in _SEV_RANK:
                    sevs.append(sev)
                else:
                    sevs.append("MEDIUM")
                types.append(inv.get("EntityType", "") or "Investigation")
            return _summarize("detective", "Detective", "Investigations", sevs, types, inv_read)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Detective unavailable: %s", e)
            return SecuritySourceSummary(source="detective", label="Detective",
                                         dimension="Investigations", live=False,
                                         note="Detective not enabled or not permitted.")

    def get_posture(self) -> SecurityPostureResponse:
        """Cached wrapper around the multi-service security posture fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"security:posture:{self.region}", _SECURITY_TTL,
            self._fetch_posture, should_cache=lambda r: r.live,
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

    def _fetch_posture(self) -> SecurityPostureResponse:
        # Parallelize the 5 AWS security service calls — cuts cold-load from ~6s to ~2s.
        fetchers = [self._guardduty, self._macie, self._inspector, self._access_analyzer, self._detective]
        sources: list[SecuritySourceSummary] = []
        with ThreadPoolExecutor(max_workers=5) as pool:
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

        # A sum over sources is only a total when every term is. One source whose walk hit its
        # bound makes total_findings a floor, so the aggregate note has to say so - a floor
        # disclosed on a nested per-source note but not on the headline number is a caveat the
        # reader of the headline never sees.
        floored = sorted(s.label for s in live_sources if s.note and "floor" in s.note)
        if not live_sources:
            note = "No security services returned findings — none enabled or access denied."
        elif floored:
            note = (
                f"{', '.join(floored)} scanned only the first {_MAX_PER_SOURCE} findings, so "
                "total_findings is a floor, not a total."
            )
        else:
            note = None

        return SecurityPostureResponse(
            sources=sources,
            total_findings=total, critical=crit, high=high,
            sources_live=len(live_sources), sources_total=len(sources),
            live=len(live_sources) > 0,
            source="aws-security-services",
            note=note,
        )

    # ── Inspector2 vulnerability detail (CVEs on EC2/ECR/Lambda) ──

    def get_vulnerabilities(self, max_findings: int = 100) -> VulnerabilitiesResponse:
        """Cached wrapper around the live Inspector2 vulnerability fetch (2 min TTL)."""
        max_findings = max(1, min(int(max_findings or 100), _MAX_VULN_FINDINGS))
        result, cached_at = get_or_load(
            f"security:vulns:{self.region}:{max_findings}", _VULN_TTL,
            lambda: self._fetch_vulnerabilities(max_findings), should_cache=lambda r: r.live,
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

    def _coverage_read(self, ins) -> PageResult:
        """Read Inspector2 scan coverage, keeping a FAILED read distinguishable from a zero.

        This used to return a bare `int` and swallow every error as `return 0`. The caller
        reads `total == 0 and covered == 0` as "Inspector2 not enabled", so an account with
        Inspector2 fully enabled, no active findings, and no `inspector2:ListCoverage`
        permission was reported as not enabled at all. A call that failed is not a fact about
        the account.

        The bound matters less here than elsewhere: the enablement verdict only asks whether
        coverage is non-zero, and the first page settles that regardless of what follows. It
        is the DISPLAYED count that can be a floor, so that is what gets disclosed.
        """
        try:
            return paginate_bounded(
                ins, "list_coverage", "coveredResources",
                page_size=_COVERAGE_PAGE, max_items=_MAX_COVERAGE, budget_s=_SOURCE_BUDGET_S,
            )
        except (KeyError, ValueError) as e:
            # Not paginable / unexpected model shape. Still a failed read, not a zero.
            logger.info("Inspector2 coverage unavailable: %s", e)
            return PageResult(items=[], failed=True, error=str(e), op="list_coverage")

    def _fetch_vulnerabilities(self, max_findings: int) -> VulnerabilitiesResponse:
        try:
            ins = boto3.client("inspector2", region_name=self.region)
            # `max_findings` is the caller's display ceiling, so stopping on it is expected
            # rather than a defect. But `total` below is rendered as a total, so a walk that
            # stopped on the ceiling still has to say the number is a floor.
            read = paginate_bounded(
                ins, "list_findings", "findings",
                page_size=_VULN_PAGE, max_items=max_findings, budget_s=_SOURCE_BUDGET_S,
                filterCriteria={"findingStatus": [{"comparison": "EQUALS", "value": "ACTIVE"}]},
            )
            if read.failed:
                logger.info("Inspector2 vulnerabilities unavailable: %s", read.error)
                return VulnerabilitiesResponse(
                    live=False, source="unavailable-fallback",
                    note="Inspector2 unreachable, not enabled, or inspector2:ListFindings not permitted.",
                )
            raw = read.items

            findings: list[VulnerabilityFinding] = []
            sev_counts: Counter = Counter()
            type_counts: Counter = Counter()
            for f in raw[:max_findings]:
                sev = (f.get("severity", "") or "").upper() or "UNTRIAGED"
                ftype = f.get("type", "") or "PACKAGE_VULNERABILITY"
                sev_counts[sev] += 1
                type_counts[ftype] += 1
                resources = f.get("resources", []) or []
                res0 = resources[0] if resources else {}
                pvd = f.get("packageVulnerabilityDetails", {}) or {}
                findings.append(VulnerabilityFinding(
                    finding_arn=mask_account_id(f.get("findingArn")),
                    title=_sanitize_vuln_title(f.get("title")) or "",
                    severity=sev,
                    type=ftype,
                    status=(f.get("status", "") or "ACTIVE"),
                    resource_type=res0.get("type"),
                    resource_id=_mask_resource_id(res0.get("id")),
                    cve=pvd.get("vulnerabilityId"),
                    fix_available=f.get("fixAvailable"),
                    first_observed=_iso(f.get("firstObservedAt")),
                ))

            # Worst severity first for a useful default table order.
            findings.sort(key=lambda x: _SEV_RANK.get(x.severity, 99))
            cov_read = self._coverage_read(ins)
            covered = len(cov_read.items)

            ordered = [s for s in _SEV_ORDER if sev_counts.get(s)]
            ordered += [s for s in sev_counts if s not in _SEV_ORDER and sev_counts.get(s)]
            by_severity = [SeverityCount(severity=s, count=sev_counts[s]) for s in ordered]
            total = len(findings)

            # No findings AND no coverage → Inspector2 is (honestly) not on here. The
            # `cov_read.complete` term is what makes that inference valid: a coverage read
            # that failed or timed out also yields zero items, and concluding "not enabled"
            # from it would turn a missing permission into a claim about the account.
            if total == 0 and covered == 0 and cov_read.complete:
                return VulnerabilitiesResponse(
                    live=False, source="inspector2",
                    note="Inspector2 not enabled or has no scan coverage in this region.",
                )

            caveats: list[str] = []
            if not total:
                # Coverage is the only evidence of enablement, and ListFindings answers empty
                # for a disabled account too. Reaching here with covered == 0 means the
                # coverage read did not complete (the complete case returned above), so
                # `covered` is exactly the right discriminator for whether "enabled" is earned.
                caveats.append(
                    "Inspector2 enabled — no active vulnerability findings." if covered
                    else "No active vulnerability findings; Inspector2 enablement could not "
                         "be confirmed because scan coverage was unreadable."
                )
            if read.note:
                caveats.append(read.note)
            if cov_read.failed:
                caveats.append(
                    "Scan coverage could not be read (inspector2:ListCoverage), so covered "
                    "resources shows 0 rather than a measurement."
                )
            elif cov_read.note:
                caveats.append(f"Covered resources is a floor: {cov_read.note}")
            return VulnerabilitiesResponse(
                findings=findings,
                total=total,
                by_severity=by_severity,
                critical=sev_counts.get("CRITICAL", 0),
                high=sev_counts.get("HIGH", 0),
                medium=sev_counts.get("MEDIUM", 0),
                low=sev_counts.get("LOW", 0),
                by_type=dict(type_counts),
                covered_resources=covered,
                live=True,
                source="inspector2",
                note=" ".join(caveats) if caveats else None,
            )
        except ParamValidationError:
            # Subclasses BotoCoreError, so the handler below would report a PROGRAMMING error
            # (a bad filterCriteria shape, a mistyped kwarg) as "Inspector2 unreachable" and
            # hide it behind a plausible degrade message. Let it surface.
            raise
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Inspector2 vulnerabilities unavailable: %s", e)
            return VulnerabilitiesResponse(
                live=False, source="unavailable-fallback",
                note="Inspector2 unreachable, not enabled, or inspector2:ListFindings not permitted.",
            )
