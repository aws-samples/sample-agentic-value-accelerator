"""Path Jailing Security Layer for Harness Governance.

Inspired by Visa VVAH's _jail() function, this module provides secure path
validation to prevent directory traversal attacks, symlink escapes, and
unauthorized access to sensitive files.

Usage:
    jail = PathJail(
        root=Path("/workspace/project"),
        allowed_patterns=["**/*.py", "**/*.ts", "**/*.json"],
        blocked_patterns=["**/secrets/**", "**/.env*", "**/credentials*"]
    )

    # Validate and resolve a path
    safe_path = jail.jail("src/config.py")  # Returns resolved Path

    # Check if allowed without raising
    if jail.is_allowed("../outside/file.txt"):
        ...

    # Filter a list of paths
    safe_paths = jail.filter_paths(["src/main.py", "../escape.py"])
"""

from __future__ import annotations

import fnmatch
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


class PathJailViolationType(str, Enum):
    """Types of jail violations for audit purposes."""
    TRAVERSAL_ATTACK = "traversal_attack"
    SYMLINK_ESCAPE = "symlink_escape"
    ABSOLUTE_OUTSIDE = "absolute_outside"
    BLOCKED_PATTERN = "blocked_pattern"
    NOT_ALLOWED = "not_allowed"


def check_traversal(path_str: str) -> Optional[str]:
    """Return the offending component if `path_str` attempts directory traversal, else None.

    Module-level rather than a private method because the Govern path-jail *test* endpoint
    (`api/routes/govern_path_jail.py`) has to answer the same question in order to predict
    what this enforcer would do, and a second copy of these rules would be free to drift
    from the ones actually enforced - reporting "allowed" for a payload that enforcement
    rejects, or the reverse. `PathJail._check_traversal` delegates here so there is exactly
    one definition.

    Note this inspects the raw string, before any resolution: it is the cheap first gate,
    not the whole check. `PathJail.jail` still resolves the path and confirms it stays
    under the jail root, which is what catches escapes this cannot see (a symlink, or an
    absolute path pointing elsewhere).
    """
    # Normalize to forward slashes for analysis
    normalized = path_str.replace("\\", "/")

    # Split into components and check each
    components = normalized.split("/")
    for component in components:
        # Direct parent traversal
        if component == "..":
            return ".."
        # Hidden traversal via URL encoding (shouldn't happen but defense in depth)
        if component == "%2e%2e" or component == "%2E%2E":
            return component
        # Null byte injection
        if "\x00" in component:
            return "null_byte"

    return None


class PathJailViolation(Exception):
    """Raised when a path access attempt violates jail boundaries.

    Attributes:
        path: The path that caused the violation
        violation_type: The type of violation
        message: Human-readable explanation
        jail_root: The jail root that was violated
    """

    def __init__(
        self,
        path: str,
        violation_type: PathJailViolationType,
        message: str,
        jail_root: Optional[Path] = None,
    ):
        self.path = path
        self.violation_type = violation_type
        self.jail_root = jail_root
        super().__init__(message)


@dataclass
class JailViolationEvent:
    """Audit event for a jail violation."""
    timestamp: datetime
    path: str
    violation_type: PathJailViolationType
    jail_root: str
    policy_id: Optional[str] = None
    user_id: Optional[str] = None
    harness_id: Optional[str] = None
    details: str = ""


class PathJail:
    """Secure path jail for file system access validation.

    Validates paths against:
    1. Directory traversal attacks (../, etc.)
    2. Symlink escapes
    3. Absolute paths outside root
    4. Blocked patterns (secrets, credentials, etc.)
    5. Allowed patterns (whitelist mode)

    Thread-safe: This class is stateless and safe for concurrent use.

    Args:
        root: The root directory of the jail (all paths must resolve within)
        allowed_patterns: Glob patterns for allowed files (whitelist). If empty,
            all files are allowed except blocked ones.
        blocked_patterns: Glob patterns for blocked files (blacklist). Applied
            after allowed patterns.
        follow_symlinks: If True, resolve symlinks and verify they stay in jail.
            If False, reject all symlinks. Default: True.
    """

    def __init__(
        self,
        root: Path,
        allowed_patterns: Optional[List[str]] = None,
        blocked_patterns: Optional[List[str]] = None,
        follow_symlinks: bool = True,
    ):
        # Resolve the root to absolute, real path
        self.root = root.resolve()
        if not self.root.exists():
            raise ValueError(f"Jail root does not exist: {self.root}")
        if not self.root.is_dir():
            raise ValueError(f"Jail root must be a directory: {self.root}")

        self.allowed_patterns = allowed_patterns or []
        self.blocked_patterns = blocked_patterns or []
        self.follow_symlinks = follow_symlinks

        # Pre-compile patterns for efficiency
        self._compiled_allowed = [self._normalize_pattern(p) for p in self.allowed_patterns]
        self._compiled_blocked = [self._normalize_pattern(p) for p in self.blocked_patterns]

        logger.debug(
            "PathJail initialized: root=%s, allowed=%d patterns, blocked=%d patterns",
            self.root,
            len(self.allowed_patterns),
            len(self.blocked_patterns),
        )

    @staticmethod
    def _normalize_pattern(pattern: str) -> str:
        """Normalize a glob pattern for matching.

        Ensures patterns use forward slashes and handles Windows paths.
        """
        # Convert Windows backslashes to forward slashes for fnmatch
        return pattern.replace("\\", "/")

    @staticmethod
    def _normalize_path_for_match(path: str) -> str:
        """Normalize a path string for pattern matching.

        Converts Windows backslashes to forward slashes for cross-platform matching.
        """
        # Simply replace backslashes with forward slashes
        return path.replace("\\", "/")

    def _matches_pattern(self, rel_path: str, patterns: List[str]) -> bool:
        """Check if a relative path matches any of the given patterns.

        Supports glob-style patterns including:
        - ** matches any number of directories (including zero)
        - * matches within a single path component
        - ? matches a single character
        """
        import re

        normalized = self._normalize_path_for_match(rel_path)
        normalized_lower = normalized.lower()

        for pattern in patterns:
            norm_pattern = self._normalize_pattern(pattern).lower()

            # Convert glob pattern to regex
            # First, escape regex special chars
            regex_parts = []
            i = 0
            while i < len(norm_pattern):
                c = norm_pattern[i]

                if c == '*':
                    # Check for **
                    if i + 1 < len(norm_pattern) and norm_pattern[i + 1] == '*':
                        # Check for **/ (match any number of directories)
                        if i + 2 < len(norm_pattern) and norm_pattern[i + 2] == '/':
                            # **/ matches any leading path including empty
                            regex_parts.append("(?:.*/)?")
                            i += 3
                        elif i + 2 == len(norm_pattern):
                            # ** at end matches anything
                            regex_parts.append(".*")
                            i += 2
                        elif i > 0 and norm_pattern[i - 1:i] == '/':
                            # /** at end or middle - already handled /
                            regex_parts.append(".*")
                            i += 2
                        else:
                            # ** matches anything
                            regex_parts.append(".*")
                            i += 2
                    else:
                        # Single * matches anything except /
                        regex_parts.append("[^/]*")
                        i += 1
                elif c == '?':
                    # ? matches single char except /
                    regex_parts.append("[^/]")
                    i += 1
                elif c in '.[](){}+^$|\\':
                    # Escape regex special chars
                    regex_parts.append('\\' + c)
                    i += 1
                else:
                    regex_parts.append(c)
                    i += 1

            regex_pattern = "^" + "".join(regex_parts) + "$"

            if re.match(regex_pattern, normalized_lower):
                return True

            # Also check if pattern matches basename (for simple patterns like "*.py")
            if not pattern.startswith("**/") and "/" not in pattern:
                if re.match(regex_pattern, os.path.basename(normalized_lower)):
                    return True

        return False

    def _check_traversal(self, path_str: str) -> Optional[str]:
        """Check for directory traversal attempts in the raw path string.

        Returns the problematic component if found, None otherwise.
        """
        return check_traversal(path_str)

    def _resolve_safely(self, path: Path) -> Tuple[Path, bool]:
        """Resolve a path safely, detecting symlink escapes.

        Returns:
            Tuple of (resolved_path, is_symlink)

        Raises:
            PathJailViolation if symlink points outside jail
        """
        is_symlink = path.is_symlink()

        if is_symlink and not self.follow_symlinks:
            raise PathJailViolation(
                str(path),
                PathJailViolationType.SYMLINK_ESCAPE,
                f"Symlinks are not allowed: {path}",
                self.root,
            )

        # Use resolve() to follow symlinks and get real path
        try:
            resolved = path.resolve()
        except (OSError, RuntimeError) as e:
            # RuntimeError can occur on symlink loops
            raise PathJailViolation(
                str(path),
                PathJailViolationType.SYMLINK_ESCAPE,
                f"Cannot resolve path (possible symlink loop): {path} - {e}",
                self.root,
            )

        return resolved, is_symlink

    def jail(self, path: str, context: Optional[str] = None) -> Path:
        """Resolve and validate a path against jail rules.

        This is the main security function. It validates that a given path:
        1. Does not contain traversal attacks
        2. Resolves within the jail root
        3. Does not escape via symlinks
        4. Does not match blocked patterns
        5. Matches allowed patterns (if any specified)

        Args:
            path: The path to validate (can be relative or absolute)
            context: Optional context string for error messages

        Returns:
            The resolved, safe Path object

        Raises:
            PathJailViolation: If the path violates any jail rule
        """
        ctx_msg = f" ({context})" if context else ""

        # Step 1: Check for obvious traversal attempts in raw string
        traversal = self._check_traversal(path)
        if traversal:
            raise PathJailViolation(
                path,
                PathJailViolationType.TRAVERSAL_ATTACK,
                f"Directory traversal detected: '{traversal}' in path '{path}'{ctx_msg}",
                self.root,
            )

        # Step 2: Construct the full path
        path_obj = Path(path)
        if path_obj.is_absolute():
            # Absolute path - must be within root
            full_path = path_obj
        else:
            # Relative path - join with root
            full_path = self.root / path

        # Step 3: Resolve symlinks and get real path
        resolved_path, is_symlink = self._resolve_safely(full_path)

        # Step 4: Verify resolved path is within jail root
        try:
            resolved_path.relative_to(self.root)
        except ValueError:
            violation_type = (
                PathJailViolationType.SYMLINK_ESCAPE
                if is_symlink
                else PathJailViolationType.ABSOLUTE_OUTSIDE
            )
            raise PathJailViolation(
                path,
                violation_type,
                f"Path escapes jail root: '{path}' resolves to '{resolved_path}' "
                f"which is outside '{self.root}'{ctx_msg}",
                self.root,
            )

        # Step 5: Get relative path for pattern matching
        rel_path = str(resolved_path.relative_to(self.root))

        # Step 6: Check blocked patterns (blacklist)
        if self._matches_pattern(rel_path, self._compiled_blocked):
            raise PathJailViolation(
                path,
                PathJailViolationType.BLOCKED_PATTERN,
                f"Path matches blocked pattern: '{path}'{ctx_msg}",
                self.root,
            )

        # Step 7: Check allowed patterns (whitelist) if specified
        if self._compiled_allowed and not self._matches_pattern(rel_path, self._compiled_allowed):
            raise PathJailViolation(
                path,
                PathJailViolationType.NOT_ALLOWED,
                f"Path does not match any allowed pattern: '{path}'{ctx_msg}",
                self.root,
            )

        return resolved_path

    def is_allowed(self, path: str) -> bool:
        """Check if a path is allowed without raising an exception.

        Args:
            path: The path to check

        Returns:
            True if the path would pass jail() validation, False otherwise
        """
        try:
            self.jail(path)
            return True
        except PathJailViolation:
            return False

    def check(self, path: str) -> Tuple[bool, Optional[PathJailViolation]]:
        """Check if a path is allowed, returning the violation if not.

        Args:
            path: The path to check

        Returns:
            Tuple of (is_allowed, violation_or_none)
        """
        try:
            self.jail(path)
            return True, None
        except PathJailViolation as e:
            return False, e

    def filter_paths(self, paths: List[str]) -> List[str]:
        """Filter a list of paths to only include allowed ones.

        Args:
            paths: List of paths to filter

        Returns:
            List of paths that pass jail validation
        """
        return [p for p in paths if self.is_allowed(p)]

    def filter_paths_with_violations(
        self, paths: List[str]
    ) -> Tuple[List[str], List[Tuple[str, PathJailViolation]]]:
        """Filter paths and return both allowed paths and violations.

        Args:
            paths: List of paths to filter

        Returns:
            Tuple of (allowed_paths, list of (path, violation) tuples)
        """
        allowed: List[str] = []
        violations: List[Tuple[str, PathJailViolation]] = []

        for path in paths:
            try:
                self.jail(path)
                allowed.append(path)
            except PathJailViolation as e:
                violations.append((path, e))

        return allowed, violations


@dataclass
class HarnessJailConfig:
    """Configuration for a harness-specific path jail.

    Used by HarnessPolicyService to define jail rules per policy.
    """
    root: Path
    allowed_patterns: List[str] = field(default_factory=list)
    blocked_patterns: List[str] = field(default_factory=lambda: [
        # Default blocked patterns for sensitive files
        "**/secrets/**",
        "**/.env",
        "**/.env.*",
        "**/*.env",
        "**/credentials*",
        "**/*credential*",
        "**/*secret*",
        "**/private_key*",
        "**/*.pem",
        "**/*.key",
        "**/id_rsa*",
        "**/id_ed25519*",
        "**/.aws/**",
        "**/.ssh/**",
        "**/.gnupg/**",
        "**/node_modules/**",
        "**/__pycache__/**",
        "**/.git/**",
    ])
    follow_symlinks: bool = True

    def create_jail(self) -> PathJail:
        """Create a PathJail instance from this configuration."""
        return PathJail(
            root=self.root,
            allowed_patterns=self.allowed_patterns,
            blocked_patterns=self.blocked_patterns,
            follow_symlinks=self.follow_symlinks,
        )


def create_default_jail(root: Path) -> PathJail:
    """Create a PathJail with sensible default security settings.

    Blocks common sensitive file patterns while allowing all other files.

    Args:
        root: The root directory for the jail

    Returns:
        Configured PathJail instance
    """
    config = HarnessJailConfig(root=root)
    return config.create_jail()


def create_strict_jail(root: Path, allowed_extensions: Optional[List[str]] = None) -> PathJail:
    """Create a strict PathJail that only allows specific file types.

    Args:
        root: The root directory for the jail
        allowed_extensions: List of allowed extensions (e.g., [".py", ".ts", ".json"]).
            Defaults to common code file extensions.

    Returns:
        Configured PathJail instance
    """
    if allowed_extensions is None:
        allowed_extensions = [
            ".py", ".ts", ".tsx", ".js", ".jsx",
            ".json", ".yaml", ".yml", ".toml",
            ".md", ".txt", ".rst",
            ".html", ".css", ".scss",
            ".sql", ".graphql",
            ".sh", ".bash",
            ".tf", ".hcl",
        ]

    allowed_patterns = [f"**/*{ext}" for ext in allowed_extensions]

    config = HarnessJailConfig(
        root=root,
        allowed_patterns=allowed_patterns,
    )
    return config.create_jail()
