"""Govern Risk Posture service — real Security Hub findings, read-through + cached.

Uses securityhub:GetFindings (paginated, active findings) to build a severity
roll-up and surface the top open findings as a risk signal. Follows the
govern_cost convention: honest live/source/note, graceful live=False fallback,
short TTL cache.

Region scope: one instance reads one region, and Security Hub is enabled per region,
so a governed region without Security Hub returns a live=False fallback rather than
zero findings. The route owns the fan-out - and owns the one case where fanning out
would be wrong, cross-region finding aggregation (see get_aggregation_region).
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_arn, sanitize_finding_title
from models.govern_risk_posture import RiskPostureResponse, SecurityFinding, SeverityCount

logger = logging.getLogger(__name__)

_RISK_TTL = 300  # 5 min
_AGGREGATOR_TTL = 1800  # 30 min — aggregation config is changed by hand, rarely

_SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]
_SEVERITY_RANK = {s: i for i, s in enumerate(_SEVERITY_ORDER)}


class GovernRiskPostureService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._sh = None

    def _client(self):
        if self._sh is None:
            self._sh = boto3.client("securityhub", region_name=self.region)
        return self._sh

    def get_posture(self, scan: int = 200) -> RiskPostureResponse:
        """Cached wrapper around the live Security Hub fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"risk:posture:{self.region}:{scan}", _RISK_TTL,
            lambda: self._fetch_posture(scan), should_cache=lambda r: r.live,
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

    def get_aggregation_region(self) -> Optional[str]:
        """The account's Security Hub finding-aggregation region, or None if off.

        This exists to stop a double count. With cross-region aggregation enabled,
        GetFindings in the aggregation region returns findings from every linked
        region as well - so a fan-out that summed each governed region would count the
        same finding once per region and inflate every severity total. Verified against
        the account: ListFindingAggregators is callable from any region and returns an
        empty list when aggregation is off, so this is a safe probe rather than a
        region-specific one.

        Returns None both when aggregation is off and when the call is not permitted;
        the caller's fallback (fan out and sum) is correct in the first case and no
        worse than today's behavior in the second.
        """
        result, _cached_at = get_or_load(
            f"risk:aggregator:{self.region}", _AGGREGATOR_TTL,
            self._fetch_aggregation_region,
            # Cache "aggregation is off" too: it is the common answer and re-probing it
            # on every page load buys nothing. The sentinel keeps None cacheable.
            should_cache=lambda r: r is not None,
        )
        return None if result == "" else result

    def _fetch_aggregation_region(self) -> Optional[str]:
        try:
            client = self._client()
            aggregators = client.list_finding_aggregators().get("FindingAggregators", []) or []
            if not aggregators:
                return ""  # sentinel: probed successfully, aggregation is off
            arn = aggregators[0].get("FindingAggregatorArn")
            if not arn:
                return ""
            detail = client.get_finding_aggregator(FindingAggregatorArn=arn)
            return detail.get("FindingAggregationRegion") or ""
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info(
                "Security Hub finding-aggregator probe unavailable in %s (%s); "
                "falling back to per-region fan-out",
                self.region, type(e).__name__,
            )
            return None

    def _fetch_posture(self, scan: int = 200) -> RiskPostureResponse:
        try:
            client = self._client()
            # Active, non-archived findings only — the current risk picture.
            filters = {
                "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}],
                "WorkflowStatus": [
                    {"Value": "NEW", "Comparison": "EQUALS"},
                    {"Value": "NOTIFIED", "Comparison": "EQUALS"},
                ],
            }
            findings: list[dict] = []
            token = None
            while len(findings) < scan:
                kwargs = {"Filters": filters, "MaxResults": 100}
                if token:
                    kwargs["NextToken"] = token
                resp = client.get_findings(**kwargs)
                findings.extend(resp.get("Findings", []))
                token = resp.get("NextToken")
                if not token:
                    break

            # More findings exist than we counted — either Security Hub handed back a
            # continuation token we stopped following, or the last page overshot the
            # limit and gets sliced off below. Either way every count that follows is
            # a floor, and saying so is the difference between "12 criticals" and
            # "at least 12 criticals, stopped counting at 200".
            truncated = bool(token) or len(findings) > scan

            counts: dict[str, int] = {s: 0 for s in _SEVERITY_ORDER}
            parsed: list[SecurityFinding] = []
            for f in findings[:scan]:
                sev = (f.get("Severity", {}) or {}).get("Label", "INFORMATIONAL")
                if sev not in counts:
                    counts[sev] = 0
                counts[sev] += 1
                resources = f.get("Resources", []) or []
                # Mask finding ID (contains full ARN with account ID) and sanitize title
                # (may contain CVEs, IPs, resource names, ARNs).
                raw_id = f.get("Id", "")
                raw_title = f.get("Title", "")
                parsed.append(SecurityFinding(
                    id=mask_arn(raw_id) or raw_id[-40:] if raw_id else "",
                    title=sanitize_finding_title(raw_title) or "",
                    severity=sev,
                    product=f.get("ProductName", ""),
                    compliance_status=(f.get("Compliance", {}) or {}).get("Status"),
                    resource_type=resources[0].get("Type") if resources else None,
                    updated_at=f.get("UpdatedAt"),
                    # From the finding itself when present (cross-region aggregation
                    # surfaces findings from linked regions), else the region we read.
                    region=f.get("Region") or self.region,
                ))

            # Top findings: worst severity first, then most recent.
            parsed.sort(key=lambda x: x.updated_at or "", reverse=True)  # recent first
            parsed.sort(key=lambda x: _SEVERITY_RANK.get(x.severity, 99))  # stable: severity primary
            by_severity = [SeverityCount(severity=s, count=counts[s]) for s in _SEVERITY_ORDER if counts.get(s)]
            total = sum(counts.values())
            if truncated:
                note = (
                    f"Counted the first {total} active findings (scan limit {scan}); "
                    "Security Hub has more, so these counts are floors."
                )
            elif total:
                note = None
            else:
                note = "Security Hub has no active findings."
            return RiskPostureResponse(
                by_severity=by_severity,
                top_findings=parsed[:10],
                total=total,
                critical=counts.get("CRITICAL", 0),
                high=counts.get("HIGH", 0),
                scanned=total,
                truncated=truncated,
                live=True,
                source="security-hub",
                note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            # Honest degrade: never a 500, and never silently reported as "no findings".
            # The note must let a viewer tell "I lack permission" apart from both
            # "Security Hub is off" and "there are genuinely zero findings" (the
            # latter is live=True with a total of 0, handled above).
            code = e.response.get("Error", {}).get("Code", "") if isinstance(e, ClientError) else ""
            if code in ("AccessDeniedException", "AccessDenied", "UnauthorizedOperation"):
                note = (
                    "Permission denied: this role is missing securityhub:GetFindings. "
                    "Findings could not be read, so this is a permissions gap, not zero findings."
                )
            elif code in ("InvalidAccessException", "SubscriptionRequiredException", "ResourceNotFoundException"):
                note = (
                    "Security Hub is not enabled in this account and Region, so there is no "
                    "findings data to read. This is not a permissions problem."
                )
            else:
                note = (
                    f"Security Hub could not be reached ({code or type(e).__name__}). "
                    "Findings are unknown, not zero."
                )
            logger.warning(
                "Security Hub unavailable (%s), returning fallback: %s", code or type(e).__name__, e
            )
            return RiskPostureResponse(
                by_severity=[], top_findings=[], live=False, source="unavailable-fallback",
                note=note,
            )
