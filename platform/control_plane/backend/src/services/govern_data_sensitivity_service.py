"""Govern Data Sensitivity service — Amazon Macie integration for data classification.

Pulls sensitive data discovery results from Macie to provide:
- S3 bucket sensitivity classifications (PII, PHI, PCI, etc.)
- Sensitive data type counts
- Data classification statistics

Returns graceful fallbacks when Macie is not enabled.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_SENSITIVITY_TTL = 300  # 5 min cache


@dataclass
class SensitivityBucket:
    """Sensitivity classification bucket with counts."""
    category: str  # PII, PHI, PCI, Confidential, Public, etc.
    count: int
    color: str
    examples: list[str] = field(default_factory=list)


@dataclass
class S3BucketClassification:
    """Classification for an S3 bucket."""
    bucket_name: str
    sensitivity: str
    object_count: int
    sensitive_objects: int
    top_detections: list[str]


@dataclass
class DataSensitivityResponse:
    """Response from the data sensitivity service."""
    live: bool
    source: str
    note: Optional[str] = None
    buckets_analyzed: int = 0
    buckets_with_sensitive: int = 0
    sensitivity_breakdown: list[SensitivityBucket] = field(default_factory=list)
    bucket_classifications: list[S3BucketClassification] = field(default_factory=list)
    top_sensitive_types: list[str] = field(default_factory=list)
    setup_guidance: Optional[dict] = None


# Color mapping for sensitivity categories
SENSITIVITY_COLORS = {
    "PHI": "#ef4444",      # red
    "PCI": "#f59e0b",      # amber
    "PII": "#8b5cf6",      # violet
    "Credentials": "#dc2626",  # red-600
    "Regulatory": "#3b82f6",   # blue
    "Confidential": "#0ea5e9", # cyan
    "Public": "#10b981",       # emerald
    "Other": "#94a3b8",        # slate
}


def _categorize_detection(detection_type: str) -> str:
    """Map Macie detection type to sensitivity category."""
    dt = detection_type.upper()

    # PHI (Protected Health Information)
    if any(x in dt for x in ["HEALTH", "MEDICAL", "PATIENT", "DIAGNOSIS", "PRESCRIPTION"]):
        return "PHI"

    # PCI (Payment Card Industry)
    if any(x in dt for x in ["CREDIT_CARD", "CARD_NUMBER", "CVV", "EXPIR"]):
        return "PCI"

    # Credentials
    if any(x in dt for x in ["PASSWORD", "SECRET", "API_KEY", "TOKEN", "CREDENTIAL"]):
        return "Credentials"

    # PII (Personally Identifiable Information)
    if any(x in dt for x in [
        "SSN", "SOCIAL_SECURITY", "DRIVER_LICENSE", "PASSPORT",
        "NAME", "EMAIL", "PHONE", "ADDRESS", "DATE_OF_BIRTH", "DOB"
    ]):
        return "PII"

    # Financial/Regulatory
    if any(x in dt for x in ["BANK", "ACCOUNT_NUMBER", "FINANCIAL", "TAX"]):
        return "Regulatory"

    return "Other"


class GovernDataSensitivityService:
    """Service for Amazon Macie data sensitivity integration."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def get_sensitivity_summary(self) -> DataSensitivityResponse:
        """Get summary of data sensitivity from Macie."""
        cache_key = f"govern_data_sensitivity:{self.region}"
        return get_or_load(cache_key, self._fetch_sensitivity, ttl=_SENSITIVITY_TTL)

    def _fetch_sensitivity(self) -> DataSensitivityResponse:
        """Fetch data sensitivity info from Macie."""
        try:
            macie = boto3.client("macie2", region_name=self.region)

            # Check if Macie is enabled
            try:
                status = macie.get_macie_session()
                if status.get("status") != "ENABLED":
                    return DataSensitivityResponse(
                        live=False,
                        source="macie",
                        note="Macie is not enabled",
                        setup_guidance=self._get_setup_guidance("not_enabled"),
                    )
            except ClientError as e:
                if "Macie is not enabled" in str(e) or "AccessDeniedException" in str(e):
                    return DataSensitivityResponse(
                        live=False,
                        source="macie",
                        note="Macie is not enabled or accessible",
                        setup_guidance=self._get_setup_guidance("not_enabled"),
                    )
                raise

            # Get findings for sensitivity classification
            findings_resp = macie.list_findings(
                findingCriteria={
                    "criterion": {
                        "category": {"eq": ["CLASSIFICATION"]}
                    }
                },
                maxResults=100,
            )
            finding_ids = findings_resp.get("findingIds", [])

            if not finding_ids:
                # No classification findings - check if any buckets are monitored
                buckets_resp = macie.describe_buckets(maxResults=50)
                bucket_count = len(buckets_resp.get("buckets", []))

                if bucket_count == 0:
                    return DataSensitivityResponse(
                        live=True,
                        source="macie",
                        note="No S3 buckets monitored by Macie",
                        buckets_analyzed=0,
                        setup_guidance=self._get_setup_guidance("no_buckets"),
                    )

                return DataSensitivityResponse(
                    live=True,
                    source="macie",
                    note=f"{bucket_count} buckets monitored, no sensitive data detected",
                    buckets_analyzed=bucket_count,
                    sensitivity_breakdown=[
                        SensitivityBucket(category="Public", count=bucket_count, color=SENSITIVITY_COLORS["Public"])
                    ],
                )

            # Get finding details
            findings = []
            for i in range(0, len(finding_ids), 20):
                batch = finding_ids[i:i + 20]
                details = macie.get_findings(findingIds=batch)
                findings.extend(details.get("findings", []))

            # Analyze findings
            category_counts = Counter()
            type_counts = Counter()
            bucket_detections: dict[str, list[str]] = {}

            for f in findings:
                classification = f.get("classificationDetails", {})
                result = classification.get("result", {})

                # Get bucket name
                resources = f.get("resourcesAffected", {})
                s3_obj = resources.get("s3Object", {}) or resources.get("s3Bucket", {})
                bucket_name = s3_obj.get("bucketArn", "").split(":")[-1] or s3_obj.get("name", "unknown")

                # Get sensitive data types
                sensitive_data = result.get("sensitiveData", [])
                for sd in sensitive_data:
                    category = sd.get("category", "")
                    for detection in sd.get("detections", []):
                        det_type = detection.get("type", "")
                        if det_type:
                            mapped_category = _categorize_detection(det_type)
                            category_counts[mapped_category] += detection.get("count", 1)
                            type_counts[det_type] += 1

                            if bucket_name not in bucket_detections:
                                bucket_detections[bucket_name] = []
                            if det_type not in bucket_detections[bucket_name]:
                                bucket_detections[bucket_name].append(det_type)

            # Build response
            sensitivity_breakdown = []
            for cat, count in category_counts.most_common():
                color = SENSITIVITY_COLORS.get(cat, SENSITIVITY_COLORS["Other"])
                examples = [t for t, _ in type_counts.most_common(3) if _categorize_detection(t) == cat]
                sensitivity_breakdown.append(SensitivityBucket(
                    category=cat,
                    count=count,
                    color=color,
                    examples=examples[:3],
                ))

            bucket_classifications = []
            for bucket_name, detections in bucket_detections.items():
                # Determine primary sensitivity
                det_categories = [_categorize_detection(d) for d in detections]
                primary = max(set(det_categories), key=det_categories.count) if det_categories else "Other"
                bucket_classifications.append(S3BucketClassification(
                    bucket_name=bucket_name[:50],
                    sensitivity=primary,
                    object_count=0,  # Would need additional API call
                    sensitive_objects=len(detections),
                    top_detections=detections[:5],
                ))

            return DataSensitivityResponse(
                live=True,
                source="macie",
                note=f"{len(findings)} classification findings analyzed",
                buckets_analyzed=len(bucket_detections),
                buckets_with_sensitive=len(bucket_detections),
                sensitivity_breakdown=sensitivity_breakdown,
                bucket_classifications=bucket_classifications[:20],
                top_sensitive_types=[t for t, _ in type_counts.most_common(10)],
            )

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("AccessDeniedException", "UnauthorizedAccess"):
                return DataSensitivityResponse(
                    live=False,
                    source="macie",
                    note="Access denied to Macie",
                    setup_guidance=self._get_setup_guidance("access_denied"),
                )
            logger.warning("Macie error: %s", e)
            return DataSensitivityResponse(
                live=False,
                source="macie",
                note=f"Macie error: {error_code}",
                setup_guidance=self._get_setup_guidance("error"),
            )
        except BotoCoreError as e:
            logger.warning("Macie unavailable: %s", e)
            return DataSensitivityResponse(
                live=False,
                source="macie",
                note="Macie service unavailable",
                setup_guidance=self._get_setup_guidance("unavailable"),
            )

    def _get_setup_guidance(self, reason: str) -> dict:
        """Return setup guidance based on the failure reason."""
        base = {
            "service": "Amazon Macie",
            "docs_url": "https://docs.aws.amazon.com/macie/latest/user/getting-started.html",
        }

        if reason == "not_enabled":
            return {
                **base,
                "title": "Enable Amazon Macie for data classification",
                "description": "Macie automatically discovers and classifies sensitive data in S3 buckets using machine learning.",
                "steps": [
                    "Enable Macie: aws macie2 enable-macie",
                    "Add S3 buckets for monitoring in the Macie console",
                    "Run a sensitive data discovery job",
                ],
                "cli_command": "aws macie2 enable-macie",
                "benefits": [
                    "Automatic PII/PHI/PCI detection",
                    "Continuous S3 bucket monitoring",
                    "Compliance reporting for GDPR, HIPAA, PCI-DSS",
                ],
            }
        elif reason == "no_buckets":
            return {
                **base,
                "title": "Add S3 buckets to Macie monitoring",
                "steps": [
                    "Go to Macie console > S3 buckets",
                    "Select buckets containing AI training data",
                    "Create a sensitive data discovery job",
                ],
            }
        elif reason == "access_denied":
            return {
                **base,
                "title": "IAM permissions required for Macie",
                "steps": [
                    "Add macie2:GetMacieSession permission",
                    "Add macie2:ListFindings permission",
                    "Add macie2:GetFindings permission",
                    "Add macie2:DescribeBuckets permission",
                ],
                "iam_policy": {
                    "Effect": "Allow",
                    "Action": [
                        "macie2:GetMacieSession",
                        "macie2:ListFindings",
                        "macie2:GetFindings",
                        "macie2:DescribeBuckets",
                    ],
                    "Resource": "*"
                },
            }
        else:
            return {
                **base,
                "title": "Check Amazon Macie availability",
                "steps": [
                    "Verify Macie is available in your region",
                    "Check network connectivity",
                    "Verify IAM permissions",
                ],
            }
