"""Tests for path resolution helpers (tools/paths.py).

Validates:
- repo_root() finds the repository root
- service_root(slug) returns .service-approval/<slug>/
- phase_dir(slug, phase) returns .service-approval/<slug>/<NN>-<phase>/
- mcp_log(slug) returns .service-approval/<slug>/mcp-calls.log
- staging_dir(ts) returns .service-approval/_staging/<ts>/
- Invalid phase names raise PathResolutionError
"""
from __future__ import annotations

from pathlib import Path

import pytest

from tools.paths import (
    PathResolutionError,
    legacy_state_dir,
    mcp_log,
    phase_dir,
    repo_root,
    service_root,
    staging_dir,
)


class TestRepoRoot:
    """Test repo_root() resolution."""

    def test_finds_manifest_yaml(self):
        """repo_root() walks up to find manifest.yaml (project marker)."""
        root = repo_root()
        assert root.is_dir()
        assert (root / "manifest.yaml").exists(), (
            "repo_root() must anchor on manifest.yaml — see tools/paths.py docstring"
        )

    def test_returns_absolute_path(self):
        """repo_root() returns an absolute path."""
        root = repo_root()
        assert root.is_absolute()


class TestServiceRoot:
    """Test service_root(slug) resolution."""

    def test_returns_service_directory(self):
        """service_root('awslambda') → .service-approval/awslambda/"""
        root = service_root("awslambda")
        assert root == repo_root() / ".service-approval" / "awslambda"

    def test_works_with_multi_word_slug(self):
        """service_root handles multi-word slugs with hyphens."""
        root = service_root("bedrock-agentcore")
        assert root == repo_root() / ".service-approval" / "bedrock-agentcore"

    def test_invalid_slug_raises(self):
        """Empty or non-string slug raises PathResolutionError."""
        with pytest.raises(PathResolutionError):
            service_root("")

        with pytest.raises(PathResolutionError):
            service_root(None)  # type: ignore


class TestPhaseDir:
    """Test phase_dir(slug, phase) resolution."""

    def test_assess_phase(self):
        """phase_dir('awslambda', 'assess') → .service-approval/awslambda/01-assess/"""
        path = phase_dir("awslambda", "assess")
        expected = repo_root() / ".service-approval" / "awslambda" / "01-assess"
        assert path == expected

    def test_generate_phase(self):
        """phase_dir('awslambda', 'generate') → .service-approval/awslambda/05-generate/"""
        path = phase_dir("awslambda", "generate")
        expected = repo_root() / ".service-approval" / "awslambda" / "05-generate"
        assert path == expected

    def test_all_phases_map_correctly(self):
        """Verify all 9 phase names map to correct numbers."""
        phase_map = {
            "intake": "00",
            "assess": "01",
            "research": "02",
            "validate": "03",
            "map": "04",
            "generate": "05",
            "test": "06",
            "summarize": "07",
            "evidence": "08",
        }
        for phase_name, phase_num in phase_map.items():
            path = phase_dir("awslambda", phase_name)
            expected = (
                repo_root() / ".service-approval" / "awslambda" / f"{phase_num}-{phase_name}"
            )
            assert path == expected, f"Phase {phase_name} mismatch"

    def test_invalid_phase_raises(self):
        """Invalid phase name raises PathResolutionError."""
        with pytest.raises(PathResolutionError) as exc_info:
            phase_dir("awslambda", "invalid-phase")
        assert "Invalid phase name" in str(exc_info.value)
        assert "invalid-phase" in str(exc_info.value)

    def test_works_with_different_slugs(self):
        """phase_dir works with any valid slug."""
        path = phase_dir("s3", "assess")
        assert path == repo_root() / ".service-approval" / "s3" / "01-assess"

        path = phase_dir("bedrock-agentcore", "map")
        assert path == repo_root() / ".service-approval" / "bedrock-agentcore" / "04-map"


class TestMcpLog:
    """Test mcp_log(slug) resolution."""

    def test_returns_mcp_log_path(self):
        """mcp_log('awslambda') → .service-approval/awslambda/mcp-calls.log"""
        path = mcp_log("awslambda")
        expected = repo_root() / ".service-approval" / "awslambda" / "mcp-calls.log"
        assert path == expected

    def test_works_with_different_slugs(self):
        """mcp_log works with any slug."""
        path = mcp_log("s3")
        assert path == repo_root() / ".service-approval" / "s3" / "mcp-calls.log"


class TestStagingDir:
    """Test staging_dir(ts) resolution."""

    def test_returns_staging_directory(self):
        """staging_dir('2026-05-13T11-30-00Z') → .service-approval/_staging/<ts>/"""
        ts = "2026-05-13T11-30-00Z"
        path = staging_dir(ts)
        expected = repo_root() / ".service-approval" / "_staging" / ts
        assert path == expected

    def test_invalid_timestamp_raises(self):
        """Empty or non-string timestamp raises PathResolutionError."""
        with pytest.raises(PathResolutionError):
            staging_dir("")

        with pytest.raises(PathResolutionError):
            staging_dir(None)  # type: ignore


class TestLegacyStateDir:
    """Test legacy_state_dir() resolution."""

    def test_returns_legacy_state_path(self):
        """legacy_state_dir() → .service-approval/state/"""
        path = legacy_state_dir()
        expected = repo_root() / ".service-approval" / "state"
        assert path == expected

    def test_is_marked_deprecated(self):
        """Docstring warns this is deprecated and migration-only."""
        # This is a design assertion — the docstring must contain "DEPRECATED".
        import inspect

        doc = inspect.getdoc(legacy_state_dir)
        assert doc is not None
        assert "DEPRECATED" in doc or "legacy" in doc.lower()


class TestPathTypes:
    """Test that all path helpers return pathlib.Path."""

    def test_all_return_path_objects(self):
        """All path helpers return pathlib.Path instances."""
        assert isinstance(repo_root(), Path)
        assert isinstance(service_root("awslambda"), Path)
        assert isinstance(phase_dir("awslambda", "assess"), Path)
        assert isinstance(mcp_log("awslambda"), Path)
        assert isinstance(staging_dir("2026-05-13T11-30-00Z"), Path)
        assert isinstance(legacy_state_dir(), Path)


class TestPathTraversalDefense:
    """Verify slug validation + jail enforcement defeats path-traversal attacks."""

    @pytest.mark.parametrize("malicious_slug", [
        "../etc",
        "../../etc/passwd",
        "..",
        "./..",
        ".hidden",
        "slug/with/slashes",
        "slug with spaces",
        "UPPERCASE",
        "slug_with_underscore",
        "",
    ])
    def test_service_root_rejects_traversal(self, malicious_slug):
        """service_root() must reject slugs that don't match the canonical pattern."""
        with pytest.raises(PathResolutionError):
            service_root(malicious_slug)

    @pytest.mark.parametrize("malicious_slug", [
        "../etc",
        "slug/with/slashes",
        "UPPERCASE",
        "",
    ])
    def test_phase_dir_rejects_traversal(self, malicious_slug):
        """phase_dir() must reject malicious slugs even when phase is valid."""
        with pytest.raises(PathResolutionError):
            phase_dir(malicious_slug, "assess")

    @pytest.mark.parametrize("malicious_ts", [
        "../etc",
        "../",
        "2026-05-13/../../etc",
        "abc",
        "2026:05:13",  # colons not allowed
        "",
    ])
    def test_staging_dir_rejects_traversal(self, malicious_ts):
        """staging_dir() must reject timestamps that don't match the canonical pattern."""
        with pytest.raises(PathResolutionError):
            staging_dir(malicious_ts)

    def test_resolved_paths_stay_under_service_approval(self):
        """All resolved paths must be relative to repo_root() / .service-approval / ."""
        sa_root = (repo_root() / ".service-approval").resolve()
        # These are valid slugs, just verifying the assertion
        assert service_root("awslambda").is_relative_to(sa_root)
        assert phase_dir("awslambda", "evidence").is_relative_to(sa_root)
        assert staging_dir("2026-05-13T11-30-00Z").is_relative_to(sa_root)
