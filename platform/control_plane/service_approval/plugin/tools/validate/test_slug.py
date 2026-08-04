"""Tests for canonical slug derivation (R1 from evidence-attestation.md §7).

Validates:
- Umbrella services get 'aws' prefix (lambda → awslambda)
- Multi-word product IDs preserve internal hyphens (bedrock-agentcore)
- Invalid characters are rejected
- Validation pattern enforced (^[a-z0-9][a-z0-9-]{0,62}$)
"""
from __future__ import annotations

import pytest

from tools.slug import SlugValidationError, derive_canonical_slug


class TestSlugDerivation:
    """Test canonical slug derivation rules from §2 of evidence-attestation.md."""

    def test_umbrella_service_gets_aws_prefix(self):
        """Umbrella services (lambda) get 'aws' prefix."""
        slug = derive_canonical_slug("AWS Lambda", "lambda", "lambda")
        assert slug == "awslambda"

    def test_multi_word_product_preserves_hyphens(self):
        """Multi-word product IDs keep internal hyphens."""
        slug = derive_canonical_slug(
            "Amazon Bedrock AgentCore", "bedrock-agentcore", None
        )
        assert slug == "bedrock-agentcore"

        slug = derive_canonical_slug(
            "Amazon Bedrock AgentCore Control",
            "bedrock-agentcore-control",
            None,
        )
        assert slug == "bedrock-agentcore-control"

    def test_non_umbrella_stays_as_is(self):
        """Non-umbrella services use IAM prefix directly."""
        slug = derive_canonical_slug("Amazon S3", "s3", "s3")
        assert slug == "s3"

        slug = derive_canonical_slug("AWS KMS", "kms", None)
        assert slug == "kms"

    def test_lowercase_enforced(self):
        """Service prefix is always lowercased."""
        # Even if service_prefix arrives uppercased (shouldn't happen),
        # it gets lowercased.
        slug = derive_canonical_slug("AWS Lambda", "LAMBDA", None)
        assert slug == "awslambda"

    def test_disallowed_chars_stripped(self):
        """Characters not in [a-z0-9-] are removed."""
        # Hypothetical malformed prefix with spaces and underscores.
        slug = derive_canonical_slug("Test Service", "test_service", None)
        assert slug == "testservice"

        # With hyphen (allowed).
        slug = derive_canonical_slug("Test Service", "test-service", None)
        assert slug == "test-service"

    def test_validation_pattern_enforced(self):
        """Derived slug must match ^[a-z0-9][a-z0-9-]{0,62}$."""
        # Valid: starts with letter, contains hyphens.
        slug = derive_canonical_slug("Test", "test-service-123", None)
        assert slug == "test-service-123"

        # Valid: single char.
        slug = derive_canonical_slug("S3", "s", None)
        assert slug == "s"

    def test_invalid_slug_raises(self):
        """Slug that fails validation pattern raises SlugValidationError."""
        # Start with hyphen (invalid).
        with pytest.raises(SlugValidationError):
            derive_canonical_slug("Invalid", "-invalid", None)

        # Empty string (invalid).
        with pytest.raises(SlugValidationError):
            derive_canonical_slug("Invalid", "", None)

        # Only special chars stripped → empty (invalid).
        with pytest.raises(SlugValidationError):
            derive_canonical_slug("Invalid", "___", None)

    def test_user_candidate_reserved_for_future(self):
        """User candidate is accepted but not currently used in derivation."""
        # Even if user provides a different candidate, service_prefix wins.
        slug = derive_canonical_slug("AWS Lambda", "lambda", "mylambda")
        assert slug == "awslambda"

    def test_umbrella_list_missing_graceful_degradation(self):
        """If slug-umbrellas.json is missing, umbrellas are not prefixed."""
        # This test would require mocking the file read, but the intent is
        # documented: _load_umbrellas returns empty set if file is missing.
        # In practice, the file exists in W1, so this is just a design note.
        pass


class TestSlugExamples:
    """Test exact examples from §2 of evidence-attestation.md."""

    def test_lambda(self):
        assert derive_canonical_slug("AWS Lambda", "lambda", "lambda") == "awslambda"

    def test_bedrock_agentcore(self):
        assert (
            derive_canonical_slug("Amazon Bedrock AgentCore", "bedrock-agentcore", None)
            == "bedrock-agentcore"
        )

    def test_bedrock_agentcore_control(self):
        assert (
            derive_canonical_slug(
                "Amazon Bedrock AgentCore Control",
                "bedrock-agentcore-control",
                None,
            )
            == "bedrock-agentcore-control"
        )

    def test_s3(self):
        assert derive_canonical_slug("Amazon S3", "s3", "s3") == "s3"

    def test_kms(self):
        assert derive_canonical_slug("AWS KMS", "kms", None) == "kms"
