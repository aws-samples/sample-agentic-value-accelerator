"""Govern Macie service — Amazon Macie data-sensitivity, read-through + cached.

Surfaces the account's real sensitive-data posture straight from Amazon Macie so
the Data Governance data-sensitivity/classification view can run on live data
instead of mock:

  1. GetMacieSession        — confirm Macie is ENABLED before trusting anything else.
  2. GetFindingStatistics   — full-account counts grouped by finding `type` and by
                              `severity.description`, plus a group-by on the affected
                              S3 bucket name to count distinct affected buckets.
  3. ListFindings + GetFindings — a small, most-severe-first sample, masked, so the
                              UI can show concrete examples (managed data-identifier
                              types, bucket, severity) without leaking specifics.

From the finding `type` statistics we derive PII / PCI / PHI-style classification
counts (Macie's SensitiveData subtypes → data classes). Everything is honest:
`live` is only True when Macie is ENABLED and every sub-read succeeds; otherwise we
degrade to live=False with a clear note (and setup guidance) and never fabricate.
A session that is ENABLED is not on its own enough - if the statistics or sample
read was denied, the counts are zero because nobody looked, not because the account
is clean, and the response says so instead of reporting "no findings yet".

Verified shape (boto3 macie2, us-east-1 live):
  - get_macie_session() → {status: 'ENABLED'|..., findingPublishingFrequency, ...}
  - get_finding_statistics(groupBy=..., size=...) → {countsByGroup: [{count, groupKey}]}
      groupBy ∈ {type, severity.description, resourcesAffected.s3Bucket.name}
  - list_findings(sortCriteria, maxResults) → {findingIds: [...]}
  - get_findings(findingIds=[...]) → {findings: [{
        id, type, category ('CLASSIFICATION'|'POLICY'), severity{description, score},
        title, createdAt, accountId,
        resourcesAffected{s3Bucket{name, arn, ...}, s3Object{extension, path, ...}},
        classificationDetails{result{sensitiveData:[{category, totalCount,
            detections:[{type, count, occurrences{...}}]}]}}}]}

MANDATORY masking (core.security_utils): S3 bucket names embed the 12-digit account
id (e.g. 'my-bucket-123456789012'); finding titles/paths can carry ARNs/account ids.
We never surface accountId, object keys/paths, or detection `occurrences` (which
pinpoint where sensitive data lives).
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.config import settings
from core.security_utils import mask_account_id, sanitize_finding_title
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min — Macie findings move slowly; a short TTL collapses page loads.
_SAMPLE_LIST = 15   # findingIds to list for the sample
_SAMPLE_DETAIL = 10  # findings to hydrate (GetFindings) for the masked sample
_BUCKET_STATS_SIZE = 1000  # group-by size to count all affected buckets


# ─────────────────── Classification model (PII / PCI / PHI-style) ───────────────────

# Colors mirror the existing SensitivityBucket palette used by DataTaxonomy.
_CLASS_COLORS = {
    "PII": "#8b5cf6",           # violet
    "PHI": "#ef4444",           # red
    "PCI/Financial": "#f59e0b", # amber
    "Credentials": "#dc2626",   # red-600
    "Custom": "#3b82f6",        # blue
    "Multiple": "#0ea5e9",      # cyan
    "Other": "#94a3b8",         # slate
}

# Macie SensitiveData finding-type suffix → data class. These are the full-account
# groupings we can count from GetFindingStatistics(groupBy=type).
_FINDING_TYPE_CLASS = {
    "Personal": "PII",
    "Financial": "PCI/Financial",
    "Credentials": "Credentials",
    "CustomIdentifier": "Custom",
    "Multiple": "Multiple",
}

# Macie managed-data-identifier category → data class (for sample detail refinement).
_MACIE_CATEGORY_CLASS = {
    "PERSONAL_INFORMATION": "PII",
    "PERSONAL_IDENTIFICATION": "PII",
    "PERSONAL_HEALTH_INFORMATION": "PHI",
    "PROTECTED_HEALTH_INFORMATION": "PHI",
    "FINANCIAL_INFORMATION": "PCI/Financial",
    "CREDENTIALS": "Credentials",
    "CUSTOM_IDENTIFIER": "Custom",
}

# Health-indicating managed-identifier keywords → PHI, even when Macie files the
# detection under its broader "Personal" finding type.
_PHI_KEYWORDS = ("HEALTH", "MEDICAL", "MEDICARE", "MEDICAID", "PATIENT", "DIAGNOSIS",
                 "DRUG_ENFORCEMENT", "HCPCS", "NPI", "DEA_", "INSURANCE_CLAIM")


def _finding_type_class(finding_type: str) -> str:
    """Map a Macie SensitiveData finding type to a PII/PCI/PHI-style class."""
    suffix = finding_type.rsplit("/", 1)[-1] if finding_type else ""
    return _FINDING_TYPE_CLASS.get(suffix, "Other")


def _detection_class(category: str, det_type: str) -> str:
    """Fine-grained class for one managed-data-identifier detection (sample)."""
    dt = (det_type or "").upper()
    if any(k in dt for k in _PHI_KEYWORDS):
        return "PHI"
    return _MACIE_CATEGORY_CLASS.get((category or "").upper(), "Other")


def _iso(v) -> Optional[str]:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


# ─────────────────── Response models ───────────────────


class SensitivityClass(BaseModel):
    """One PII/PCI/PHI-style data class with a full-account finding count."""

    category: str = Field(..., description="PII | PHI | PCI/Financial | Credentials | Custom | Multiple | Other")
    count: int = Field(0, description="Full-account Macie finding count mapped to this class")
    color: str
    examples: List[str] = Field(default_factory=list, description="Example managed-identifier types seen in the sample")


class FindingTypeCount(BaseModel):
    """Full-account finding count for one Macie finding type."""

    finding_type: str = Field(..., description="e.g. SensitiveData:S3Object/Personal")
    category: str = Field(..., description="CLASSIFICATION (sensitive data) | POLICY (bucket policy)")
    count: int = 0


class SeverityCount(BaseModel):
    """Full-account finding count for one severity band."""

    severity: str = Field(..., description="High | Medium | Low")
    count: int = 0


class SampleFinding(BaseModel):
    """A single masked sample finding (most-severe-first)."""

    finding_id: str
    finding_type: str
    category: str = Field(..., description="CLASSIFICATION | POLICY")
    severity: Optional[str] = None
    title: Optional[str] = Field(None, description="Sanitized (ARNs/account-id/bucket masked)")
    bucket: Optional[str] = Field(None, description="Affected S3 bucket, account-id masked")
    object_extension: Optional[str] = Field(None, description="Affected object file extension (no key/path)")
    sensitive_data_types: List[str] = Field(default_factory=list, description="Managed-identifier types detected")
    created_at: Optional[str] = None


class MacieDataSensitivityResponse(BaseModel):
    """Live Macie data-sensitivity posture for Data Governance classification."""

    live: bool
    source: str
    note: Optional[str] = None
    macie_status: Optional[str] = Field(None, description="Macie session status, e.g. ENABLED")
    finding_publishing_frequency: Optional[str] = None
    total_findings: int = 0
    classification_findings: int = Field(0, description="SensitiveData (CLASSIFICATION) findings")
    policy_findings: int = Field(0, description="Bucket POLICY findings")
    affected_bucket_count: int = Field(0, description="Distinct S3 buckets with findings")
    classification_breakdown: List[SensitivityClass] = Field(default_factory=list)
    by_finding_type: List[FindingTypeCount] = Field(default_factory=list)
    by_severity: List[SeverityCount] = Field(default_factory=list)
    sample_findings: List[SampleFinding] = Field(default_factory=list)
    top_sensitive_types: List[str] = Field(default_factory=list, description="Most common managed-identifier types in the sample")
    setup_guidance: Optional[dict] = None


# ─────────────────── Service ───────────────────

_SEVERITY_RANK = {"High": 0, "Medium": 1, "Low": 2}


class GovernMacieService:
    """Amazon Macie data-sensitivity — read-through, cached, honest-degrading."""

    def __init__(self, region: Optional[str] = None):
        self.region = region or settings.GOVERN_AWS_REGION

    def _client(self):
        return boto3.client("macie2", region_name=self.region)

    def get_data_sensitivity(self) -> MacieDataSensitivityResponse:
        result, cached_at = get_or_load(
            f"macie:data-sensitivity:{self.region}", _TTL,
            self._fetch_data_sensitivity, should_cache=lambda r: r.live,
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

    # ─────────────────── Per-call helpers (never raise; None means the read failed) ───────────────────
    #
    # Both of these used to return [] for two different things: "Macie looked and found
    # nothing" and "the call was denied or unreachable". The caller could not tell them
    # apart, so a denied read surfaced as total_findings=0 with the note "Macie is
    # ENABLED; no findings yet" under live=True. An empty list now means measured-empty
    # (still live) and None means the measurement never happened.

    def _stats(self, macie, group_by: str, size: int = 50) -> Optional[list[dict]]:
        """GetFindingStatistics for one groupBy; None when the call itself failed."""
        try:
            resp = macie.get_finding_statistics(groupBy=group_by, size=size)
            return resp.get("countsByGroup", []) or []
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Macie GetFindingStatistics(%s) unavailable: %s", group_by, e)
            return None

    def _sample(self, macie) -> Optional[list[dict]]:
        """ListFindings (most-severe-first) + GetFindings for a small sample.

        None when either call failed; [] when Macie genuinely has no findings to list.
        """
        try:
            lf = macie.list_findings(
                maxResults=_SAMPLE_LIST,
                sortCriteria={"attributeName": "severity.score", "orderBy": "DESC"},
            )
            ids = (lf.get("findingIds", []) or [])[:_SAMPLE_DETAIL]
            if not ids:
                return []
            gf = macie.get_findings(findingIds=ids)
            return gf.get("findings", []) or []
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Macie ListFindings/GetFindings unavailable: %s", e)
            return None

    # ─────────────────── Fetch ───────────────────

    def _fetch_data_sensitivity(self) -> MacieDataSensitivityResponse:
        try:
            macie = self._client()

            # 1) Confirm Macie is enabled before trusting anything else.
            try:
                session = macie.get_macie_session()
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                msg = str(e)
                if code == "AccessDeniedException" or "UnauthorizedAccess" in code:
                    return self._degrade("access_denied", "Access denied to Macie (get_macie_session).")
                if "Macie is not enabled" in msg or code in ("ResourceNotFoundException", "MacieNotEnabled"):
                    return self._degrade("not_enabled", "Macie is not enabled in this region.")
                raise

            status = session.get("status")
            if status != "ENABLED":
                return self._degrade("not_enabled", f"Macie session status is {status or 'unknown'}, not ENABLED.")

            # 2) Full-account statistics.
            by_type_raw = self._stats(macie, "type")
            by_sev_raw = self._stats(macie, "severity.description")
            bucket_groups = self._stats(macie, "resourcesAffected.s3Bucket.name", size=_BUCKET_STATS_SIZE)

            # An ENABLED session says Macie is on, not that we managed to read it. Any
            # sub-read that failed is recorded by name here, because every count below is
            # derived from these lists and a missing list reads as a clean account.
            failed_reads: list[str] = []
            if by_type_raw is None:
                failed_reads.append("macie2:GetFindingStatistics(type)")
            if by_sev_raw is None:
                failed_reads.append("macie2:GetFindingStatistics(severity.description)")
            if bucket_groups is None:
                failed_reads.append("macie2:GetFindingStatistics(resourcesAffected.s3Bucket.name)")

            by_finding_type: list[FindingTypeCount] = []
            class_counts: Counter = Counter()
            classification_findings = 0
            policy_findings = 0
            total_findings = 0
            for g in by_type_raw or []:
                ftype = g.get("groupKey", "")
                count = int(g.get("count", 0))
                total_findings += count
                is_classification = ftype.startswith("SensitiveData")
                if is_classification:
                    classification_findings += count
                    class_counts[_finding_type_class(ftype)] += count
                else:
                    policy_findings += count
                by_finding_type.append(FindingTypeCount(
                    finding_type=ftype,
                    category="CLASSIFICATION" if is_classification else "POLICY",
                    count=count,
                ))
            by_finding_type.sort(key=lambda x: x.count, reverse=True)

            by_severity = [
                SeverityCount(severity=g.get("groupKey", "Unknown"), count=int(g.get("count", 0)))
                for g in by_sev_raw or []
            ]
            by_severity.sort(key=lambda x: _SEVERITY_RANK.get(x.severity, 99))

            affected_bucket_count = len(bucket_groups or [])

            # 3) Masked sample → example detection types per class + top types.
            sample = self._sample(macie)
            if sample is None:
                failed_reads.append("macie2:ListFindings/GetFindings")
            class_examples: dict[str, list[str]] = {}
            type_counter: Counter = Counter()
            sample_findings: list[SampleFinding] = []

            for f in sample or []:
                ftype = f.get("type", "")
                is_classification = (f.get("category") == "CLASSIFICATION") or ftype.startswith("SensitiveData")
                resources = f.get("resourcesAffected", {}) or {}
                s3_bucket = resources.get("s3Bucket", {}) or {}
                s3_object = resources.get("s3Object", {}) or {}

                det_types: list[str] = []
                result = (f.get("classificationDetails", {}) or {}).get("result", {}) or {}
                for sd in result.get("sensitiveData", []) or []:
                    sd_category = sd.get("category", "")
                    for det in sd.get("detections", []) or []:
                        det_type = det.get("type", "")
                        if not det_type:
                            continue
                        det_types.append(det_type)
                        type_counter[det_type] += 1
                        # Refine example placement using the fine detection class.
                        cls = _detection_class(sd_category, det_type)
                        class_examples.setdefault(cls, [])
                        if det_type not in class_examples[cls]:
                            class_examples[cls].append(det_type)
                        # Also seed the finding-type-derived class so its examples fill.
                        ftcls = _finding_type_class(ftype)
                        class_examples.setdefault(ftcls, [])
                        if det_type not in class_examples[ftcls]:
                            class_examples[ftcls].append(det_type)

                sample_findings.append(SampleFinding(
                    finding_id=mask_account_id(f.get("id", "")) or "",
                    finding_type=ftype,
                    category="CLASSIFICATION" if is_classification else "POLICY",
                    severity=(f.get("severity", {}) or {}).get("description"),
                    title=sanitize_finding_title(f.get("title")),
                    bucket=mask_account_id(s3_bucket.get("name")),
                    object_extension=s3_object.get("extension") or None,
                    sensitive_data_types=det_types[:5],
                    created_at=_iso(f.get("createdAt")),
                ))

            classification_breakdown = [
                SensitivityClass(
                    category=cls,
                    count=count,
                    color=_CLASS_COLORS.get(cls, _CLASS_COLORS["Other"]),
                    examples=class_examples.get(cls, [])[:3],
                )
                for cls, count in class_counts.most_common()
            ]

            if failed_reads:
                # Never the "no findings yet" sentence in this branch. That is the false
                # reassurance the old code emitted whenever the statistics read was denied:
                # total_findings is 0 here because the read failed, and a clean-looking
                # data-sensitivity panel is the reading that gets closed rather than chased.
                note = (
                    f"Macie is ENABLED, but {', '.join(failed_reads)} failed, so the counts "
                    f"shown are not a measurement of this account - zero here does not mean "
                    f"no sensitive data."
                )
            elif total_findings == 0:
                # A live answer even when the account is clean (Macie on, zero findings).
                note = "Macie is ENABLED; no findings yet (no sensitive-data or policy findings)."
            else:
                note = (
                    f"{total_findings} finding(s): {classification_findings} sensitive-data, "
                    f"{policy_findings} policy, across {affected_bucket_count} bucket(s)."
                )

            return MacieDataSensitivityResponse(
                # macie_status below is genuinely measured, so it is still reported - but a
                # denied statistics/sample read leaves every count a fabricated zero, and
                # they are non-Optional ints the UI renders as numbers, so the response
                # degrades instead of publishing them under a Live badge.
                live=not failed_reads,
                source="macie2" if not failed_reads else "macie2-partial",
                note=note,
                macie_status=status,
                finding_publishing_frequency=session.get("findingPublishingFrequency"),
                total_findings=total_findings,
                classification_findings=classification_findings,
                policy_findings=policy_findings,
                affected_bucket_count=affected_bucket_count,
                classification_breakdown=classification_breakdown,
                by_finding_type=by_finding_type,
                by_severity=by_severity,
                sample_findings=sample_findings,
                top_sensitive_types=[t for t, _ in type_counter.most_common(10)],
            )

        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("AccessDeniedException", "UnauthorizedAccess"):
                return self._degrade("access_denied", "Access denied to Macie.")
            logger.warning("Macie error: %s", e)
            return self._degrade("error", f"Macie error: {code or 'unknown'}")
        except BotoCoreError as e:
            logger.warning("Macie unavailable: %s", e)
            return self._degrade("unavailable", "Macie service unavailable (network/region).")

    # ─────────────────── Honest-degrade ───────────────────

    def _degrade(self, reason: str, note: str) -> MacieDataSensitivityResponse:
        return MacieDataSensitivityResponse(
            live=False,
            source="macie2",
            note=note,
            setup_guidance=self._setup_guidance(reason),
        )

    def _setup_guidance(self, reason: str) -> dict:
        base = {
            "service": "Amazon Macie",
            "docs_url": "https://docs.aws.amazon.com/macie/latest/user/getting-started.html",
        }
        if reason == "not_enabled":
            return {
                **base,
                "title": "Enable Amazon Macie for data classification",
                "description": "Macie discovers and classifies sensitive data (PII, PHI, PCI, credentials) in S3 using managed and custom data identifiers.",
                "steps": [
                    "Enable Macie: aws macie2 enable-macie",
                    "Turn on automated sensitive data discovery, or create a discovery job",
                    "Select the S3 buckets holding AI training / evaluation data",
                ],
                "cli_command": "aws macie2 enable-macie",
                "benefits": [
                    "Automatic PII / PHI / PCI / credential detection",
                    "Continuous S3 bucket sensitivity monitoring",
                    "Evidence for GDPR, HIPAA, PCI-DSS reporting",
                ],
            }
        if reason == "access_denied":
            return {
                **base,
                "title": "IAM permissions required for Macie",
                "steps": [
                    "Add macie2:GetMacieSession",
                    "Add macie2:GetFindingStatistics",
                    "Add macie2:ListFindings",
                    "Add macie2:GetFindings",
                ],
                "iam_policy": {
                    "Effect": "Allow",
                    "Action": [
                        "macie2:GetMacieSession",
                        "macie2:GetFindingStatistics",
                        "macie2:ListFindings",
                        "macie2:GetFindings",
                    ],
                    "Resource": "*",
                },
            }
        return {
            **base,
            "title": "Check Amazon Macie availability",
            "steps": [
                "Verify Macie is available and enabled in this region",
                "Check network connectivity and IAM permissions",
            ],
        }
