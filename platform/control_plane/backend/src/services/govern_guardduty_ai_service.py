"""Govern GuardDuty AI service — real GuardDuty findings filtered for AI services.

Uses guardduty:ListFindings + GetFindings to fetch findings related to AI/ML services
(Bedrock, SageMaker, etc.). Maps finding types to AI-specific categories.

Honest live/source/note flags, graceful live=False fallback, short TTL cache.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_arn
from models.govern_guardduty_ai import (
    GuardDutyAIFinding,
    GuardDutyAIFindingsResponse,
    SeverityCount,
    CategoryCount,
)

logger = logging.getLogger(__name__)

_GUARDDUTY_TTL = 300  # 5 min cache

# AI/ML service prefixes to filter findings
_AI_SERVICES = {
    "bedrock",
    "bedrock-runtime",
    "bedrock-agent",
    "bedrock-agent-runtime",
    "sagemaker",
    "sagemaker-runtime",
    "comprehend",
    "rekognition",
    "textract",
    "transcribe",
    "translate",
    "polly",
    "lex",
    "kendra",
}

# Resource type patterns for AI services (pre-compiled for performance)
_AI_RESOURCE_PATTERNS = [
    re.compile(r"AWS::Bedrock::"),
    re.compile(r"AWS::SageMaker::"),
    re.compile(r"AWS::Comprehend::"),
    re.compile(r"AWS::Rekognition::"),
    re.compile(r"AWS::Lex::"),
    re.compile(r"AWS::Kendra::"),
]

# Map GuardDuty finding types to AI categories
_TYPE_TO_CATEGORY = {
    "UnauthorizedAccess": "unauthorized_access",
    "Exfiltration": "data_exfiltration",
    "CredentialAccess": "credential_access",
    "Impact": "model_abuse",
    "Persistence": "unauthorized_access",
    "PrivilegeEscalation": "unauthorized_access",
    "InitialAccess": "unauthorized_access",
    "Discovery": "anomalous_behavior",
    "Execution": "model_abuse",
}

# Keywords that suggest prompt injection or AI-specific attacks
_PROMPT_INJECTION_KEYWORDS = [
    "prompt",
    "injection",
    "jailbreak",
    "adversarial",
    "manipulation",
]

_SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
_SEVERITY_RANK = {s: i for i, s in enumerate(_SEVERITY_ORDER)}


def _map_severity(gd_severity: float) -> str:
    """Map GuardDuty numeric severity (0-10) to label."""
    if gd_severity >= 7.0:
        return "CRITICAL"
    elif gd_severity >= 4.0:
        return "HIGH"
    elif gd_severity >= 1.0:
        return "MEDIUM"
    return "LOW"


def _infer_ai_category(finding_type: str, title: str, description: str) -> str:
    """Infer AI category from finding type and content."""
    # Check for prompt injection keywords
    combined = f"{title} {description}".lower()
    if any(kw in combined for kw in _PROMPT_INJECTION_KEYWORDS):
        return "prompt_injection"

    # Map by finding type prefix
    type_prefix = finding_type.split(":")[0] if ":" in finding_type else finding_type
    return _TYPE_TO_CATEGORY.get(type_prefix, "anomalous_behavior")


def _is_ai_related(finding: dict) -> bool:
    """Check if a finding is related to AI/ML services."""
    # Check service
    service = finding.get("Service", {}).get("ServiceName", "").lower()
    if service in _AI_SERVICES:
        return True

    # Check resource type
    resource = finding.get("Resource", {})
    resource_type = resource.get("ResourceType", "")
    if any(pattern.match(resource_type) for pattern in _AI_RESOURCE_PATTERNS):
        return True

    # Check for AI-related details in the finding
    details = resource.get("InstanceDetails", {}) or {}
    if "bedrock" in str(details).lower() or "sagemaker" in str(details).lower():
        return True

    # Check title/description for AI keywords
    title = finding.get("Title", "").lower()
    description = finding.get("Description", "").lower()
    ai_keywords = ["bedrock", "sagemaker", "foundation model", "machine learning", "ai model", "llm"]
    if any(kw in title or kw in description for kw in ai_keywords):
        return True

    return False


def _hash_id(finding_id: str) -> str:
    """Create a shortened hash of the finding ID for display."""
    return hashlib.sha256(finding_id.encode()).hexdigest()[:16]


class GovernGuardDutyAIService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._gd = None
        self._detector_id: Optional[str] = None

    def _client(self):
        if self._gd is None:
            self._gd = boto3.client("guardduty", region_name=self.region)
        return self._gd

    def _get_detector_id(self) -> Optional[str]:
        """Get the GuardDuty detector ID for this region."""
        if self._detector_id is not None:
            return self._detector_id

        try:
            resp = self._client().list_detectors()
            detector_ids = resp.get("DetectorIds", [])
            if detector_ids:
                self._detector_id = detector_ids[0]
                return self._detector_id
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to list GuardDuty detectors: %s", e)

        return None

    def get_findings(self, limit: int = 50) -> GuardDutyAIFindingsResponse:
        """Cached wrapper around live GuardDuty fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"guardduty:ai:{self.region}:{limit}", _GUARDDUTY_TTL,
            lambda: self._fetch_findings(limit), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_findings(self, limit: int = 50) -> GuardDutyAIFindingsResponse:
        """Fetch AI-related findings from GuardDuty."""
        try:
            detector_id = self._get_detector_id()
            if not detector_id:
                return GuardDutyAIFindingsResponse(
                    findings=[], total=0, by_severity=[], by_category=[],
                    live=False, source="guardduty",
                    note="No GuardDuty detector found in this region. Enable GuardDuty to detect AI threats.",
                )

            client = self._client()

            # List finding IDs (active findings only)
            finding_ids: list[str] = []
            token = None
            # Fetch more than limit since we'll filter for AI-related
            fetch_limit = min(limit * 5, 500)

            while len(finding_ids) < fetch_limit:
                kwargs = {
                    "DetectorId": detector_id,
                    "FindingCriteria": {
                        "Criterion": {
                            "service.archived": {"Eq": ["false"]},
                        }
                    },
                    "SortCriteria": {
                        "AttributeName": "severity",
                        "OrderBy": "DESC",
                    },
                    "MaxResults": 50,
                }
                if token:
                    kwargs["NextToken"] = token

                resp = client.list_findings(**kwargs)
                finding_ids.extend(resp.get("FindingIds", []))
                token = resp.get("NextToken")
                if not token:
                    break

            if not finding_ids:
                return GuardDutyAIFindingsResponse(
                    findings=[], total=0, by_severity=[], by_category=[],
                    live=True, source="guardduty",
                    note="No active GuardDuty findings. Your AI workloads appear secure.",
                )

            # Get finding details in batches of 50
            all_findings: list[dict] = []
            for i in range(0, len(finding_ids), 50):
                batch = finding_ids[i:i+50]
                resp = client.get_findings(DetectorId=detector_id, FindingIds=batch)
                all_findings.extend(resp.get("Findings", []))

            # Filter for AI-related findings
            ai_findings = [f for f in all_findings if _is_ai_related(f)]

            # Parse findings
            parsed: list[GuardDutyAIFinding] = []
            severity_counts: dict[str, int] = {s: 0 for s in _SEVERITY_ORDER}
            category_counts: dict[str, int] = {}

            for f in ai_findings[:limit]:
                finding_type = f.get("Type", "")
                title = f.get("Title", "")
                description = f.get("Description", "")
                severity = _map_severity(f.get("Severity", 0))
                category = _infer_ai_category(finding_type, title, description)

                severity_counts[severity] = severity_counts.get(severity, 0) + 1
                category_counts[category] = category_counts.get(category, 0) + 1

                resource = f.get("Resource", {})
                resource_type = resource.get("ResourceType", "Other")

                # Extract resource ID safely
                resource_id = ""
                if "InstanceDetails" in resource:
                    resource_id = resource["InstanceDetails"].get("InstanceId", "")
                elif "AccessKeyDetails" in resource:
                    # Access keys are not ARNs - mask inline: first 4 + "..." + last 4
                    access_key = resource["AccessKeyDetails"].get("AccessKeyId", "")
                    if access_key and len(access_key) >= 8:
                        resource_id = f"{access_key[:4]}...{access_key[-4:]}"
                    else:
                        resource_id = access_key or ""
                elif "S3BucketDetails" in resource:
                    buckets = resource["S3BucketDetails"]
                    if buckets:
                        resource_id = buckets[0].get("Name", "")

                # Build console URL
                account_id = f.get("AccountId", "")
                finding_id = f.get("Id", "")
                investigate_url = (
                    f"https://{self.region}.console.aws.amazon.com/guardduty/home?"
                    f"region={self.region}#/findings?fId={finding_id}"
                ) if finding_id else None

                # Mask account ID: show first 4 + "****" + last 4 (account IDs are not ARNs)
                masked_account_id = None
                if account_id and len(account_id) >= 8:
                    masked_account_id = f"{account_id[:4]}****{account_id[-4:]}"
                elif account_id:
                    masked_account_id = account_id

                parsed.append(GuardDutyAIFinding(
                    id=_hash_id(finding_id),
                    type=finding_type,
                    title=title,
                    description=description[:500] if description else "",
                    severity=severity,
                    resource_type=resource_type,
                    resource_id=resource_id or "unknown",
                    region=f.get("Region", self.region),
                    service=f.get("Service", {}).get("ServiceName", "unknown"),
                    created_at=f.get("CreatedAt", ""),
                    updated_at=f.get("UpdatedAt", ""),
                    ai_category=category,
                    confidence=int(f.get("Confidence", 50)),
                    account_id=masked_account_id,
                    investigate_url=investigate_url,
                ))

            # Build response
            by_severity = [
                SeverityCount(severity=s, count=severity_counts[s])
                for s in _SEVERITY_ORDER if severity_counts.get(s, 0) > 0
            ]
            by_category = [
                CategoryCount(category=c, count=n)
                for c, n in sorted(category_counts.items(), key=lambda x: -x[1])
            ]

            return GuardDutyAIFindingsResponse(
                findings=parsed,
                total=len(parsed),
                by_severity=by_severity,
                by_category=by_category,
                live=True,
                source="guardduty",
                note=None if parsed else "No AI-related findings detected.",
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("GuardDuty unavailable: %s", e)
            return GuardDutyAIFindingsResponse(
                findings=[], total=0, by_severity=[], by_category=[],
                live=False, source="guardduty",
                note="GuardDuty unreachable or guardduty:ListFindings/GetFindings not granted.",
            )
        except Exception as e:
            logger.exception("Unexpected error fetching GuardDuty AI findings: %s", e)
            return GuardDutyAIFindingsResponse(
                findings=[], total=0, by_severity=[], by_category=[],
                live=False, source="guardduty",
                note=f"Unexpected error: {type(e).__name__}",
            )
