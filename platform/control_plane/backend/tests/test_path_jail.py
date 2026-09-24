"""Comprehensive tests for PathJail security layer.

Tests cover:
- Directory traversal attacks (../, URL-encoded, null bytes)
- Symlink escape attempts
- Absolute paths outside jail
- Blocked pattern matching
- Allowed pattern matching against the allowlist
- Integration with harness policy service
"""

import os
import tempfile
from pathlib import Path
from typing import Generator

import pytest

from core.path_jail import (
    PathJail,
    PathJailViolation,
    PathJailViolationType,
    HarnessJailConfig,
    JailViolationEvent,
    create_default_jail,
    create_strict_jail,
)
from core.output_caps import (
    cap_output,
    cap_output_detailed,
    cap_lines,
    cap_grep_results,
    cap_glob_results,
    cap_list,
    OutputCapConfig,
    MAX_READ_SIZE_KB,
    MAX_GREP_MATCHES,
    MAX_GLOB_RESULTS,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def temp_jail_root() -> Generator[Path, None, None]:
    """Create a temporary directory for jail testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        # Create test structure
        (root / "src").mkdir()
        (root / "src" / "main.py").write_text("# main")
        (root / "src" / "config.py").write_text("# config")
        (root / "tests").mkdir()
        (root / "tests" / "test_main.py").write_text("# test")
        (root / "docs").mkdir()
        (root / "docs" / "README.md").write_text("# readme")
        (root / ".env").write_text("SECRET=value")
        (root / "secrets").mkdir()
        (root / "secrets" / "api_key.txt").write_text("secret-key")
        yield root


@pytest.fixture
def basic_jail(temp_jail_root: Path) -> PathJail:
    """Create a basic PathJail for testing."""
    return PathJail(
        root=temp_jail_root,
        allowed_patterns=[],  # Allow all
        blocked_patterns=["**/secrets/**", "**/.env*"],
    )


@pytest.fixture
def strict_jail(temp_jail_root: Path) -> PathJail:
    """Create a strict PathJail that only allows Python files."""
    return PathJail(
        root=temp_jail_root,
        allowed_patterns=["**/*.py"],
        blocked_patterns=["**/secrets/**", "**/.env*"],
    )


# =============================================================================
# Basic Functionality Tests
# =============================================================================

class TestBasicJailFunctionality:
    """Test basic PathJail operations."""

    def test_valid_path_within_jail(self, basic_jail: PathJail, temp_jail_root: Path):
        """Valid paths within the jail should resolve successfully."""
        resolved = basic_jail.jail("src/main.py")
        assert resolved == temp_jail_root / "src" / "main.py"
        assert resolved.exists()

    def test_relative_path_resolution(self, basic_jail: PathJail, temp_jail_root: Path):
        """Relative paths should be resolved relative to jail root."""
        resolved = basic_jail.jail("tests/test_main.py")
        assert resolved.parent.name == "tests"
        assert resolved.name == "test_main.py"

    def test_is_allowed_returns_bool(self, basic_jail: PathJail):
        """is_allowed should return boolean without raising."""
        assert basic_jail.is_allowed("src/main.py") is True
        assert basic_jail.is_allowed("secrets/api_key.txt") is False
        assert basic_jail.is_allowed("../escape.py") is False

    def test_check_returns_tuple(self, basic_jail: PathJail):
        """check() should return (bool, violation_or_none)."""
        allowed, violation = basic_jail.check("src/main.py")
        assert allowed is True
        assert violation is None

        allowed, violation = basic_jail.check("secrets/api_key.txt")
        assert allowed is False
        assert violation is not None
        assert violation.violation_type == PathJailViolationType.BLOCKED_PATTERN

    def test_filter_paths(self, basic_jail: PathJail):
        """filter_paths should return only allowed paths."""
        paths = [
            "src/main.py",
            "secrets/api_key.txt",  # blocked
            "tests/test_main.py",
            "../escape.py",  # traversal
            ".env",  # blocked
        ]
        filtered = basic_jail.filter_paths(paths)
        assert filtered == ["src/main.py", "tests/test_main.py"]

    def test_filter_paths_with_violations(self, basic_jail: PathJail):
        """filter_paths_with_violations should return both lists."""
        paths = [
            "src/main.py",
            "secrets/api_key.txt",
            "../escape.py",
        ]
        allowed, violations = basic_jail.filter_paths_with_violations(paths)
        assert allowed == ["src/main.py"]
        assert len(violations) == 2
        assert violations[0][0] == "secrets/api_key.txt"
        assert violations[1][0] == "../escape.py"


# =============================================================================
# Directory Traversal Attack Tests
# =============================================================================

class TestTraversalAttacks:
    """Test protection against directory traversal attacks."""

    def test_simple_parent_traversal(self, basic_jail: PathJail):
        """Simple ../ traversal should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("../outside.txt")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_nested_parent_traversal(self, basic_jail: PathJail):
        """Nested traversal (src/../../../etc) should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("src/../../../etc/passwd")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_windows_backslash_traversal(self, basic_jail: PathJail):
        """Windows-style backslash traversal should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("..\\outside.txt")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_mixed_slash_traversal(self, basic_jail: PathJail):
        """Mixed slash styles should still be caught."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("src\\..\\..\\outside.txt")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_double_dot_at_end(self, basic_jail: PathJail):
        """.. at end of path should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("src/..")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_url_encoded_traversal(self, basic_jail: PathJail):
        """URL-encoded traversal attempts should be blocked."""
        # Note: actual %2e%2e detection depends on whether URL decoding happens before
        # In this case, we test the literal string
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("%2e%2e/etc/passwd")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_null_byte_injection(self, basic_jail: PathJail):
        """Null byte injection should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("src/main.py\x00.txt")
        assert exc_info.value.violation_type == PathJailViolationType.TRAVERSAL_ATTACK

    def test_valid_path_with_dots(self, basic_jail: PathJail, temp_jail_root: Path):
        """Paths with dots in names (not traversal) should work."""
        # Create a file with dots
        dotted_file = temp_jail_root / "src" / "config.prod.py"
        dotted_file.write_text("# prod config")

        resolved = basic_jail.jail("src/config.prod.py")
        assert resolved.exists()


# =============================================================================
# Symlink Escape Tests
# =============================================================================

class TestSymlinkEscapes:
    """Test protection against symlink escape attempts."""

    @pytest.mark.skipif(os.name == 'nt', reason="Symlinks require elevated privileges on Windows")
    def test_symlink_pointing_outside(self, temp_jail_root: Path):
        """Symlink pointing outside jail should be blocked."""
        # Create a symlink pointing outside
        outside_dir = temp_jail_root.parent / "outside"
        outside_dir.mkdir(exist_ok=True)
        outside_file = outside_dir / "secret.txt"
        outside_file.write_text("external secret")

        symlink = temp_jail_root / "src" / "escape_link"
        symlink.symlink_to(outside_file)

        jail = PathJail(root=temp_jail_root, follow_symlinks=True)

        with pytest.raises(PathJailViolation) as exc_info:
            jail.jail("src/escape_link")
        assert exc_info.value.violation_type == PathJailViolationType.SYMLINK_ESCAPE

        # Cleanup
        symlink.unlink()
        outside_file.unlink()
        outside_dir.rmdir()

    @pytest.mark.skipif(os.name == 'nt', reason="Symlinks require elevated privileges on Windows")
    def test_symlink_within_jail_allowed(self, temp_jail_root: Path):
        """Symlink pointing within jail should be allowed."""
        # Create a symlink pointing to another file in jail
        symlink = temp_jail_root / "link_to_main"
        symlink.symlink_to(temp_jail_root / "src" / "main.py")

        jail = PathJail(root=temp_jail_root, follow_symlinks=True)
        resolved = jail.jail("link_to_main")
        assert resolved == temp_jail_root / "src" / "main.py"

        symlink.unlink()

    def test_symlinks_disabled(self, temp_jail_root: Path):
        """When follow_symlinks=False, any symlink should be rejected."""
        if os.name == 'nt':
            pytest.skip("Symlinks require elevated privileges on Windows")

        # Create a symlink within jail
        symlink = temp_jail_root / "link_to_main"
        symlink.symlink_to(temp_jail_root / "src" / "main.py")

        jail = PathJail(root=temp_jail_root, follow_symlinks=False)

        with pytest.raises(PathJailViolation) as exc_info:
            jail.jail("link_to_main")
        assert exc_info.value.violation_type == PathJailViolationType.SYMLINK_ESCAPE

        symlink.unlink()


# =============================================================================
# Absolute Path Tests
# =============================================================================

class TestAbsolutePaths:
    """Test handling of absolute paths."""

    def test_absolute_path_within_jail(self, basic_jail: PathJail, temp_jail_root: Path):
        """Absolute path within jail should be allowed."""
        abs_path = str(temp_jail_root / "src" / "main.py")
        resolved = basic_jail.jail(abs_path)
        assert resolved == temp_jail_root / "src" / "main.py"

    def test_absolute_path_outside_jail(self, basic_jail: PathJail):
        """Absolute path outside jail should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("/etc/passwd")
        # Could be TRAVERSAL_ATTACK or ABSOLUTE_OUTSIDE depending on implementation
        assert exc_info.value.violation_type in [
            PathJailViolationType.ABSOLUTE_OUTSIDE,
            PathJailViolationType.TRAVERSAL_ATTACK,
        ]

    def test_windows_absolute_path(self, basic_jail: PathJail):
        """Windows absolute path outside jail should be blocked."""
        if os.name != 'nt':
            pytest.skip("Windows-specific test")

        with pytest.raises(PathJailViolation):
            basic_jail.jail("C:\\Windows\\System32\\cmd.exe")


# =============================================================================
# Blocked Pattern Tests
# =============================================================================

class TestBlockedPatterns:
    """Test blocked pattern matching."""

    def test_blocked_directory_pattern(self, basic_jail: PathJail):
        """Paths matching blocked directory patterns should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail("secrets/api_key.txt")
        assert exc_info.value.violation_type == PathJailViolationType.BLOCKED_PATTERN

    def test_blocked_file_pattern(self, basic_jail: PathJail):
        """Paths matching blocked file patterns should be blocked."""
        with pytest.raises(PathJailViolation) as exc_info:
            basic_jail.jail(".env")
        assert exc_info.value.violation_type == PathJailViolationType.BLOCKED_PATTERN

    def test_blocked_dotenv_variations(self, temp_jail_root: Path):
        """Various .env patterns should be blocked."""
        # Create test files
        (temp_jail_root / ".env.local").write_text("LOCAL=1")
        (temp_jail_root / ".env.production").write_text("PROD=1")

        jail = PathJail(
            root=temp_jail_root,
            blocked_patterns=["**/.env", "**/.env.*"],
        )

        with pytest.raises(PathJailViolation):
            jail.jail(".env")

        with pytest.raises(PathJailViolation):
            jail.jail(".env.local")

        with pytest.raises(PathJailViolation):
            jail.jail(".env.production")

    def test_credentials_pattern(self, temp_jail_root: Path):
        """Credential file patterns should be blocked by default config."""
        (temp_jail_root / "credentials.json").write_text("{}")
        (temp_jail_root / "aws_credentials").write_text("key=value")

        config = HarnessJailConfig(root=temp_jail_root)  # Uses defaults
        jail = config.create_jail()

        with pytest.raises(PathJailViolation):
            jail.jail("credentials.json")

    def test_key_file_patterns(self, temp_jail_root: Path):
        """Key file patterns should be blocked."""
        (temp_jail_root / "private_key.pem").write_text("---BEGIN---")
        (temp_jail_root / "server.key").write_text("key data")
        (temp_jail_root / "id_rsa").write_text("ssh key")

        config = HarnessJailConfig(root=temp_jail_root)
        jail = config.create_jail()

        with pytest.raises(PathJailViolation):
            jail.jail("private_key.pem")

        with pytest.raises(PathJailViolation):
            jail.jail("server.key")

        with pytest.raises(PathJailViolation):
            jail.jail("id_rsa")


# =============================================================================
# Allowed Pattern Tests
# =============================================================================

class TestAllowedPatterns:
    """Test allowed pattern (allowlist) matching."""

    def test_strict_jail_only_allows_python(self, strict_jail: PathJail, temp_jail_root: Path):
        """Strict jail should only allow Python files."""
        # Python file should work
        resolved = strict_jail.jail("src/main.py")
        assert resolved.exists()

        # Non-Python file should be blocked
        with pytest.raises(PathJailViolation) as exc_info:
            strict_jail.jail("docs/README.md")
        assert exc_info.value.violation_type == PathJailViolationType.NOT_ALLOWED

    def test_empty_allowed_patterns_allows_all(self, basic_jail: PathJail, temp_jail_root: Path):
        """Empty allowed patterns should allow all (except blocked)."""
        # Both Python and Markdown should work
        basic_jail.jail("src/main.py")
        basic_jail.jail("docs/README.md")

    def test_multiple_allowed_patterns(self, temp_jail_root: Path):
        """Multiple allowed patterns should all work."""
        jail = PathJail(
            root=temp_jail_root,
            allowed_patterns=["**/*.py", "**/*.md"],
            blocked_patterns=[],
        )

        # Both should work
        jail.jail("src/main.py")
        jail.jail("docs/README.md")

        # Other extensions blocked
        (temp_jail_root / "data.csv").write_text("a,b,c")
        with pytest.raises(PathJailViolation):
            jail.jail("data.csv")


# =============================================================================
# Factory Function Tests
# =============================================================================

class TestFactoryFunctions:
    """Test convenience factory functions."""

    def test_create_default_jail(self, temp_jail_root: Path):
        """create_default_jail should create a jail with sensible defaults."""
        jail = create_default_jail(temp_jail_root)

        # Regular files should work
        jail.jail("src/main.py")

        # Secrets should be blocked
        with pytest.raises(PathJailViolation):
            jail.jail("secrets/api_key.txt")

    def test_create_strict_jail_default_extensions(self, temp_jail_root: Path):
        """create_strict_jail should use default extensions."""
        jail = create_strict_jail(temp_jail_root)

        # Common code files should work
        jail.jail("src/main.py")

        # JSON is in the default list
        (temp_jail_root / "config.json").write_text("{}")
        jail.jail("config.json")

        # But binary files should not
        (temp_jail_root / "image.png").write_bytes(b"\x89PNG")
        with pytest.raises(PathJailViolation):
            jail.jail("image.png")

    def test_create_strict_jail_custom_extensions(self, temp_jail_root: Path):
        """create_strict_jail should accept custom extensions."""
        jail = create_strict_jail(temp_jail_root, allowed_extensions=[".txt", ".log"])

        # Create files with correct extensions
        (temp_jail_root / "notes.txt").write_text("notes")
        (temp_jail_root / "app.log").write_text("log")

        # These should work
        jail.jail("notes.txt")
        jail.jail("app.log")

        # Python not in custom list - should fail
        with pytest.raises(PathJailViolation):
            jail.jail("src/main.py")


# =============================================================================
# HarnessJailConfig Tests
# =============================================================================

class TestHarnessJailConfig:
    """Test HarnessJailConfig dataclass."""

    def test_default_blocked_patterns(self, temp_jail_root: Path):
        """Default config should have comprehensive blocked patterns."""
        config = HarnessJailConfig(root=temp_jail_root)

        # Check that defaults include sensitive patterns
        assert any(".env" in p for p in config.blocked_patterns)
        assert any("secrets" in p for p in config.blocked_patterns)
        assert any(".pem" in p for p in config.blocked_patterns)
        assert any(".ssh" in p for p in config.blocked_patterns)

    def test_create_jail_method(self, temp_jail_root: Path):
        """create_jail() should create a PathJail with config settings."""
        config = HarnessJailConfig(
            root=temp_jail_root,
            allowed_patterns=["**/*.py"],
            blocked_patterns=["**/test_*"],
            follow_symlinks=False,
        )
        jail = config.create_jail()

        assert jail.root == temp_jail_root
        assert jail.follow_symlinks is False


# =============================================================================
# Output Caps Tests
# =============================================================================

class TestOutputCaps:
    """Test output capping functions."""

    def test_cap_output_under_limit(self):
        """Content under limit should not be truncated."""
        content = "Hello, world!"
        capped, truncated = cap_output(content, max_kb=1)
        assert capped == content
        assert truncated is False

    def test_cap_output_over_limit(self):
        """Content over limit should be truncated."""
        content = "x" * (MAX_READ_SIZE_KB * 1024 + 1000)
        capped, truncated = cap_output(content)
        assert truncated is True
        assert len(capped) < len(content)
        assert "[... output truncated ...]" in capped

    def test_cap_output_detailed(self):
        """Detailed cap should include metadata."""
        content = "x" * 5000
        result = cap_output_detailed(content, max_kb=1)
        assert result.was_truncated is True
        assert result.original_size_bytes > result.capped_size_bytes
        assert result.truncation_message is not None

    def test_cap_lines_under_limit(self):
        """Lines under limit should not be truncated."""
        content = "line1\nline2\nline3"
        capped, truncated = cap_lines(content, max_lines=10)
        assert capped == content
        assert truncated is False

    def test_cap_lines_over_limit(self):
        """Lines over limit should be truncated."""
        content = "\n".join(f"line{i}" for i in range(100))
        capped, truncated = cap_lines(content, max_lines=10)
        assert truncated is True
        assert "truncated" in capped
        assert capped.count("\n") < 20  # Rough check

    def test_cap_grep_results(self):
        """Grep results should be capped."""
        matches = [{"file": f"file{i}.py", "line": i} for i in range(300)]
        capped, truncated = cap_grep_results(matches)
        assert truncated is True
        assert len(capped) == MAX_GREP_MATCHES

    def test_cap_glob_results(self):
        """Glob results should be capped."""
        files = [f"path/to/file{i}.py" for i in range(600)]
        capped, truncated = cap_glob_results(files)
        assert truncated is True
        assert len(capped) == MAX_GLOB_RESULTS

    def test_cap_list_generic(self):
        """Generic list capping should work."""
        items = list(range(1000))
        capped, truncated = cap_list(items, max_count=100)
        assert truncated is True
        assert len(capped) == 100
        assert capped == list(range(100))

    def test_output_cap_config(self):
        """OutputCapConfig should use configured limits."""
        config = OutputCapConfig(
            max_read_size_kb=1,
            max_grep_matches=10,
            max_glob_results=20,
        )

        # Test with config methods
        content = "x" * 2000
        capped, truncated = config.cap_output(content)
        assert truncated is True

        matches = [{"file": f"f{i}"} for i in range(50)]
        capped, truncated = config.cap_grep(matches)
        assert len(capped) == 10

        files = [f"f{i}.py" for i in range(50)]
        capped, truncated = config.cap_glob(files)
        assert len(capped) == 20


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_nonexistent_root_raises(self, temp_jail_root: Path):
        """Non-existent root should raise ValueError."""
        with pytest.raises(ValueError, match="does not exist"):
            PathJail(root=temp_jail_root / "nonexistent")

    def test_file_as_root_raises(self, temp_jail_root: Path):
        """File as root should raise ValueError."""
        with pytest.raises(ValueError, match="must be a directory"):
            PathJail(root=temp_jail_root / "src" / "main.py")

    def test_empty_path_string(self, basic_jail: PathJail, temp_jail_root: Path):
        """Empty path should resolve to jail root."""
        resolved = basic_jail.jail("")
        assert resolved == temp_jail_root

    def test_violation_has_correct_attributes(self, basic_jail: PathJail):
        """PathJailViolation should have all expected attributes."""
        try:
            basic_jail.jail("../escape.txt")
        except PathJailViolation as e:
            assert e.path == "../escape.txt"
            assert e.violation_type == PathJailViolationType.TRAVERSAL_ATTACK
            assert e.jail_root is not None
            assert str(e)  # Should have message
