"""Security utilities for sanitizing sensitive data before frontend exposure.

Centralizes masking / redaction patterns so all govern services apply consistent
protection. Preserves governance utility (correlatable identifiers, severity,
resource types) while removing sensitive specifics (account IDs, full ARNs,
CVEs, IP addresses, internal naming).
"""

from __future__ import annotations

import re

# AWS 12-digit account ID pattern (standalone or in ARN).
_ACCOUNT_ID = re.compile(r"\b(\d{12})\b")

# Full ARN: arn:partition:service:region:account:resource
_ARN = re.compile(r"arn:aws[a-z-]*:[^:]+:[^:]*:\d{12}:[^\s]+")

# CVE references (CVE-YYYY-NNNNN).
_CVE = re.compile(r"CVE-\d{4}-\d+", re.IGNORECASE)

# IPv4 addresses.
_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

# S3 bucket names in paths/URLs.
_S3_BUCKET = re.compile(r"s3://[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]", re.IGNORECASE)

# Random session suffixes: name-<random hex/alnum 6+> → name-****
_SESSION_SUFFIX = re.compile(r"(-[a-f0-9]{6,})$", re.IGNORECASE)


def mask_account_id(text: str | None) -> str | None:
    """Replace AWS account IDs with ************."""
    if not text:
        return text
    return _ACCOUNT_ID.sub("************", text)


def mask_arn(arn: str | None) -> str | None:
    """Reduce a full ARN to its resource tail (last segment after / or :).

    arn:aws:bedrock:us-east-1:123456789012:evaluation-job/my-job-id
    → my-job-id

    Preserves the meaningful resource identifier while hiding account/region.
    """
    if not arn:
        return arn
    if not arn.startswith("arn:"):
        return arn
    # Take the last segment after the final / or :
    tail = arn.rsplit("/", 1)[-1]
    tail = tail.rsplit(":", 1)[-1]
    return tail


def mask_arn_in_text(text: str | None) -> str | None:
    """Replace full ARNs in free text with [ARN:resource-tail]."""
    if not text:
        return text

    def _replace(m):
        arn = m.group(0)
        tail = mask_arn(arn)
        return f"[ARN:{tail}]"

    return _ARN.sub(_replace, text)


def mask_identity(ident: str | None) -> str | None:
    """Mask a caller identity for the frontend.

    Preserves governance signal (recognizable role/user name, correlatable
    across events) while redacting sensitive parts (full ARNs, account IDs,
    random STS session suffixes).

    Rules:
    - Reduce full ARN/path to its last segment (role name / session name).
    - Mask trailing random tokens: name-<random> → name-****
    - Plain IAM usernames pass through.
    """
    if not ident:
        return ident
    # Reduce a full ARN / path to its last segment (role name / session name).
    tail = ident.rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    # Mask a trailing random token: name-<random> → name-****
    parts = tail.rsplit("-", 1)
    if len(parts) == 2 and len(parts[1]) >= 6 and any(c.isdigit() for c in parts[1]):
        return f"{parts[0]}-****"
    return tail


def mask_cve(text: str | None) -> str | None:
    """Replace CVE identifiers with [CVE-REDACTED]."""
    if not text:
        return text
    return _CVE.sub("[CVE-REDACTED]", text)


def mask_ip(text: str | None) -> str | None:
    """Replace IPv4 addresses with [IP-REDACTED]."""
    if not text:
        return text
    return _IPV4.sub("[IP-REDACTED]", text)


def mask_s3_bucket(text: str | None) -> str | None:
    """Replace S3 bucket URIs with s3://[bucket]."""
    if not text:
        return text
    return _S3_BUCKET.sub("s3://[bucket]", text)


def sanitize_finding_title(title: str | None, max_len: int = 150) -> str | None:
    """Sanitize a security finding title for frontend display.

    Removes CVEs, IPs, ARNs, account IDs, S3 buckets. Preserves the nature of
    the finding (severity, resource type, issue category) while removing
    specifics that aid reconnaissance.
    """
    if not title:
        return title
    out = title
    out = mask_arn_in_text(out)
    out = mask_cve(out)
    out = mask_ip(out)
    out = mask_s3_bucket(out)
    out = mask_account_id(out)
    return out[:max_len] if len(out) > max_len else out


def sanitize_error_message(err: str | None, max_len: int = 100) -> str | None:
    """Sanitize an error message for frontend exposure.

    Strips sensitive details (paths, ARNs, account IDs) to prevent information
    disclosure through error responses.
    """
    if not err:
        return err
    out = err
    out = mask_arn_in_text(out)
    out = mask_account_id(out)
    # Remove file paths that might leak internal structure.
    out = re.sub(r"(/[a-zA-Z0-9_\-./]+)+", "[path]", out)
    return out[:max_len] if len(out) > max_len else out


def mask_budget_name(name: str | None) -> str | None:
    """Mask a budget name to hide internal organizational structure.

    Keeps first word + initial of subsequent words:
    'DevOps-AI-Agent-Development' → 'DevOps-A-A-D'
    """
    if not name:
        return name
    parts = re.split(r"[-_\s]+", name)
    if len(parts) <= 1:
        return name
    return f"{parts[0]}-" + "-".join(p[0].upper() if p else "" for p in parts[1:])


def mask_log_group(log_group: str | None) -> bool:
    """Return whether logging is enabled rather than exposing the log group name."""
    return bool(log_group)
