"""Canonical service-slug derivation for evidence-attestation system.

Service slugs are filesystem-safe, git-safe, s3-key-safe identifiers that
uniquely identify a service in the .service-approval/<slug>/ hierarchy.

The canonical slug is derived from the Service Authorization Reference (SAR)
`service_prefix` field (the IAM action prefix like `lambda`, `s3`, `bedrock-agentcore`)
with rules to handle AWS umbrella services, multi-word product IDs, and
disallowed characters.

## Rules (authoritative — §2 of evidence-attestation.md):

1. Start from `sar_facts.service_prefix` (always lowercase IAM prefix).
2. If prefix is a recognized AWS "umbrella" (e.g., `lambda`), prefix with `aws`
   to match user examples (`awslambda`). Umbrella list lives in
   `data/slug-umbrellas.json`.
3. Multi-word product IDs keep internal hyphens (`bedrock-agentcore`).
4. Strip disallowed chars (anything not `[a-z0-9-]`).
5. Validate: `^[a-z0-9][a-z0-9-]{0,62}$` (fs-safe, git-safe, s3-key-safe).

## Examples:

- `derive_canonical_slug("AWS Lambda", "lambda", "lambda")` → `"awslambda"`
- `derive_canonical_slug("Amazon Bedrock AgentCore", "bedrock-agentcore", None)` → `"bedrock-agentcore"`
- `derive_canonical_slug("Amazon S3", "s3", "s3")` → `"s3"`
- `derive_canonical_slug("AWS KMS", "kms", None)` → `"kms"`
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache


_SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_DISALLOWED_CHARS = re.compile(r"[^a-z0-9-]")


class SlugValidationError(ValueError):
    """Raised when a derived slug fails the validation pattern."""


class UmbrellaConfigError(RuntimeError):
    """Raised when data/slug-umbrellas.json is missing or corrupt.

    A missing umbrella file is a configuration bug, not a degradation case —
    silently returning an empty set caused two intakes for the same service
    to derive different slugs (e.g., 'lambda' vs 'awslambda'). Fail loudly.

    A prefix that's not in the umbrella set is a different category: it's
    expected (the file lists the small subset of prefixes that need 'aws'
    prepended; everything else is fine without it).
    """


@lru_cache(maxsize=1)
def _load_umbrellas() -> set[str]:
    """Load the umbrella service list from data/slug-umbrellas.json.

    Returns:
        Set of lowercase IAM prefixes that should be prefixed with 'aws'
        (e.g., {'lambda', 'ec2', 'iam'}).

    Raises:
        UmbrellaConfigError: If the file is missing or corrupt. Distinguish
            "config bug" (file gone) from "this prefix isn't an umbrella"
            (caller's responsibility to handle the latter).
    """
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
    )
    path = os.path.join(data_dir, "slug-umbrellas.json")
    if not os.path.isfile(path):
        raise UmbrellaConfigError(
            f"data/slug-umbrellas.json is missing (looked at {path}). "
            "This file is required for canonical slug derivation; without it, "
            "two runs of the same service can derive different slugs. "
            "Restore from git history or recreate from data/sar-slugs.json."
        )
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        raise UmbrellaConfigError(
            f"data/slug-umbrellas.json is corrupt: {e}. "
            "Restore from git history or recreate from data/sar-slugs.json."
        ) from e
    return set(data.get("umbrellas", []))


def derive_canonical_slug(
    service_name: str,
    service_prefix: str,
    user_candidate: str | None = None,
) -> str:
    """Derive the canonical service slug for .service-approval/<slug>/.

    Args:
        service_name: Full service name from SAR (e.g., "AWS Lambda").
        service_prefix: IAM action prefix from SAR (e.g., "lambda").
        user_candidate: Optional user-provided slug from intake (e.g., "lambda").
            Not currently used in derivation — reserved for future disambiguation.

    Returns:
        Canonical slug string matching ^[a-z0-9][a-z0-9-]{0,62}$.

    Raises:
        SlugValidationError: If the derived slug fails validation pattern.

    Examples:
        >>> derive_canonical_slug("AWS Lambda", "lambda", "lambda")
        'awslambda'
        >>> derive_canonical_slug("Amazon Bedrock AgentCore", "bedrock-agentcore", None)
        'bedrock-agentcore'
        >>> derive_canonical_slug("Amazon S3", "s3", "s3")
        's3'
    """
    # Step 1: Start from service_prefix (authoritative IAM prefix).
    slug = service_prefix.lower().strip()

    # Step 2: Handle umbrella services — prefix with 'aws' if recognized.
    umbrellas = _load_umbrellas()
    if slug in umbrellas:
        slug = f"aws{slug}"

    # Step 3: Multi-word product IDs keep internal hyphens (already in prefix).
    # No action needed — the prefix like "bedrock-agentcore" is already hyphenated.

    # Step 4: Strip disallowed characters (anything not [a-z0-9-]).
    slug = _DISALLOWED_CHARS.sub("", slug)

    # Step 5: Validate final slug against pattern.
    if not _SLUG_PATTERN.match(slug):
        raise SlugValidationError(
            f"Derived slug '{slug}' does not match pattern ^[a-z0-9][a-z0-9-]{{0,62}}$. "
            f"Source: service_name='{service_name}', service_prefix='{service_prefix}', "
            f"user_candidate='{user_candidate}'"
        )

    return slug
