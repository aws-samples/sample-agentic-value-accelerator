"""Govern Risk Posture service — real Security Hub findings, read-through + cached.

Uses securityhub:GetFindings (paginated, active findings) to build a severity
roll-up and surface the top open findings as a risk signal. Follows the
govern_cost convention: honest live/source/note, graceful live=False fallback,
short TTL cache.
"""

from __future__ import annotations

import logging
import time

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_arn, sanitize_finding_title
from models.govern_risk_posture import RiskPostureResponse, SecurityFinding, SeverityCount

logger = logging.getLogger(__name__)

_RISK_TTL = 300  # 5 min

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
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

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
                ))

            # Top findings: worst severity first, then most recent.
            parsed.sort(key=lambda x: x.updated_at or "", reverse=True)  # recent first
            parsed.sort(key=lambda x: _SEVERITY_RANK.get(x.severity, 99))  # stable: severity primary
            by_severity = [SeverityCount(severity=s, count=counts[s]) for s in _SEVERITY_ORDER if counts.get(s)]
            total = sum(counts.values())
            return RiskPostureResponse(
                by_severity=by_severity,
                top_findings=parsed[:10],
                total=total,
                critical=counts.get("CRITICAL", 0),
                high=counts.get("HIGH", 0),
                live=True,
                source="security-hub",
                note=None if total else "Security Hub has no active findings.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Security Hub unavailable, returning fallback: %s", e)
            return RiskPostureResponse(
                by_severity=[], top_findings=[], live=False, source="unavailable-fallback",
                note="Security Hub unreachable, not enabled, or securityhub:GetFindings not granted.",
            )
