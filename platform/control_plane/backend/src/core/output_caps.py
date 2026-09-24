"""Output Size Caps for Context Overflow Prevention.

Prevents context window overflow by enforcing size limits on:
- File read operations
- Grep/search results
- Glob file listings
- General tool outputs

These caps are critical for:
1. Preventing denial of service via large file reads
2. Keeping LLM context windows manageable
3. Ensuring consistent tool behavior

Usage:
    from core.output_caps import cap_output, cap_grep_results, cap_glob_results

    # Cap file content
    content, truncated = cap_output(large_file_content)

    # Cap search results
    matches, truncated = cap_grep_results(all_matches)

    # Cap glob results
    files, truncated = cap_glob_results(all_files)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, TypeVar, Union

logger = logging.getLogger(__name__)

# ============================================================================
# Default Limits
# ============================================================================

# Maximum size for file read operations in KB
MAX_READ_SIZE_KB: int = 200

# Maximum number of grep/search matches to return
MAX_GREP_MATCHES: int = 200

# Maximum number of glob results to return
MAX_GLOB_RESULTS: int = 500

# Maximum number of lines for line-based output
MAX_OUTPUT_LINES: int = 1000

# Maximum size for general output in KB
MAX_OUTPUT_SIZE_KB: int = 100

# Maximum number of items in list responses
MAX_LIST_ITEMS: int = 500


# ============================================================================
# Cap Result Types
# ============================================================================

@dataclass
class CapResult:
    """Result of a capping operation with metadata."""
    content: str
    was_truncated: bool
    original_size_bytes: int
    capped_size_bytes: int
    truncation_message: Optional[str] = None

    @property
    def truncation_ratio(self) -> float:
        """Ratio of content removed (0.0 to 1.0)."""
        if self.original_size_bytes == 0:
            return 0.0
        return 1.0 - (self.capped_size_bytes / self.original_size_bytes)


@dataclass
class ListCapResult:
    """Result of capping a list with metadata."""
    items: List[Any]
    was_truncated: bool
    original_count: int
    capped_count: int
    truncation_message: Optional[str] = None


T = TypeVar("T")


# ============================================================================
# Core Capping Functions
# ============================================================================

def cap_output(
    content: str,
    max_kb: int = MAX_READ_SIZE_KB,
    truncation_marker: str = "\n\n[... output truncated ...]",
) -> Tuple[str, bool]:
    """Cap output content to a maximum size in KB.

    Args:
        content: The content to cap
        max_kb: Maximum size in kilobytes
        truncation_marker: Marker to append if truncated

    Returns:
        Tuple of (capped_content, was_truncated)
    """
    max_bytes = max_kb * 1024
    content_bytes = content.encode("utf-8", errors="replace")

    if len(content_bytes) <= max_bytes:
        return content, False

    # Reserve space for truncation marker
    marker_bytes = len(truncation_marker.encode("utf-8"))
    target_bytes = max_bytes - marker_bytes

    # Truncate at a safe boundary (try to end at newline)
    truncated_bytes = content_bytes[:target_bytes]

    # Try to find a newline to truncate at cleanly
    last_newline = truncated_bytes.rfind(b"\n")
    if last_newline > target_bytes * 0.8:  # Only if we keep at least 80%
        truncated_bytes = truncated_bytes[: last_newline + 1]

    # Decode back to string
    truncated = truncated_bytes.decode("utf-8", errors="replace")

    logger.debug(
        "Output capped: %d bytes -> %d bytes (%.1f%% reduction)",
        len(content_bytes),
        len(truncated_bytes),
        (1 - len(truncated_bytes) / len(content_bytes)) * 100,
    )

    return truncated + truncation_marker, True


def cap_output_detailed(
    content: str,
    max_kb: int = MAX_READ_SIZE_KB,
    truncation_marker: str = "\n\n[... output truncated ...]",
) -> CapResult:
    """Cap output with detailed metadata.

    Args:
        content: The content to cap
        max_kb: Maximum size in kilobytes
        truncation_marker: Marker to append if truncated

    Returns:
        CapResult with full metadata
    """
    original_bytes = len(content.encode("utf-8", errors="replace"))
    capped, truncated = cap_output(content, max_kb, truncation_marker)
    capped_bytes = len(capped.encode("utf-8", errors="replace"))

    message = None
    if truncated:
        message = (
            f"Output truncated from {original_bytes:,} bytes to {capped_bytes:,} bytes "
            f"({(1 - capped_bytes / original_bytes) * 100:.1f}% reduction)"
        )

    return CapResult(
        content=capped,
        was_truncated=truncated,
        original_size_bytes=original_bytes,
        capped_size_bytes=capped_bytes,
        truncation_message=message,
    )


def cap_lines(
    content: str,
    max_lines: int = MAX_OUTPUT_LINES,
    truncation_marker: str = "\n[... {remaining} more lines truncated ...]",
) -> Tuple[str, bool]:
    """Cap content by number of lines.

    Args:
        content: The content to cap
        max_lines: Maximum number of lines
        truncation_marker: Marker to append (can include {remaining} placeholder)

    Returns:
        Tuple of (capped_content, was_truncated)
    """
    lines = content.splitlines(keepends=True)

    if len(lines) <= max_lines:
        return content, False

    remaining = len(lines) - max_lines
    capped_lines = lines[:max_lines]
    marker = truncation_marker.format(remaining=remaining)

    return "".join(capped_lines) + marker, True


def cap_grep_results(
    matches: List[Dict[str, Any]],
    max_count: int = MAX_GREP_MATCHES,
) -> Tuple[List[Dict[str, Any]], bool]:
    """Cap grep/search match results.

    Args:
        matches: List of match dictionaries
        max_count: Maximum number of matches to return

    Returns:
        Tuple of (capped_matches, was_truncated)
    """
    if len(matches) <= max_count:
        return matches, False

    logger.debug(
        "Grep results capped: %d matches -> %d matches",
        len(matches),
        max_count,
    )

    return matches[:max_count], True


def cap_grep_results_detailed(
    matches: List[Dict[str, Any]],
    max_count: int = MAX_GREP_MATCHES,
) -> ListCapResult:
    """Cap grep results with detailed metadata.

    Args:
        matches: List of match dictionaries
        max_count: Maximum number of matches to return

    Returns:
        ListCapResult with metadata
    """
    capped, truncated = cap_grep_results(matches, max_count)

    message = None
    if truncated:
        message = f"Search results capped: showing {len(capped)} of {len(matches)} matches"

    return ListCapResult(
        items=capped,
        was_truncated=truncated,
        original_count=len(matches),
        capped_count=len(capped),
        truncation_message=message,
    )


def cap_glob_results(
    files: List[str],
    max_count: int = MAX_GLOB_RESULTS,
) -> Tuple[List[str], bool]:
    """Cap glob/file listing results.

    Args:
        files: List of file paths
        max_count: Maximum number of files to return

    Returns:
        Tuple of (capped_files, was_truncated)
    """
    if len(files) <= max_count:
        return files, False

    logger.debug(
        "Glob results capped: %d files -> %d files",
        len(files),
        max_count,
    )

    return files[:max_count], True


def cap_glob_results_detailed(
    files: List[str],
    max_count: int = MAX_GLOB_RESULTS,
) -> ListCapResult:
    """Cap glob results with detailed metadata.

    Args:
        files: List of file paths
        max_count: Maximum number of files to return

    Returns:
        ListCapResult with metadata
    """
    capped, truncated = cap_glob_results(files, max_count)

    message = None
    if truncated:
        message = f"File list capped: showing {len(capped)} of {len(files)} files"

    return ListCapResult(
        items=capped,
        was_truncated=truncated,
        original_count=len(files),
        capped_count=len(capped),
        truncation_message=message,
    )


def cap_list(
    items: List[T],
    max_count: int = MAX_LIST_ITEMS,
) -> Tuple[List[T], bool]:
    """Generic list capping function.

    Args:
        items: List to cap
        max_count: Maximum items to return

    Returns:
        Tuple of (capped_items, was_truncated)
    """
    if len(items) <= max_count:
        return items, False

    return items[:max_count], True


def cap_list_detailed(
    items: List[T],
    max_count: int = MAX_LIST_ITEMS,
    item_type: str = "items",
) -> ListCapResult:
    """Generic list capping with detailed metadata.

    Args:
        items: List to cap
        max_count: Maximum items to return
        item_type: Description of item type for message

    Returns:
        ListCapResult with metadata
    """
    capped, truncated = cap_list(items, max_count)

    message = None
    if truncated:
        message = f"List capped: showing {len(capped)} of {len(items)} {item_type}"

    return ListCapResult(
        items=capped,
        was_truncated=truncated,
        original_count=len(items),
        capped_count=len(capped),
        truncation_message=message,
    )


# ============================================================================
# Utility Functions
# ============================================================================

def estimate_token_count(text: str) -> int:
    """Rough estimate of token count (approximately 4 chars per token).

    This is a rough heuristic - actual tokenization varies by model.
    Use for quick estimates only, not for precise billing.

    Args:
        text: Text to estimate

    Returns:
        Estimated token count
    """
    # Average ~4 characters per token for English text
    return len(text) // 4


def should_cap_for_context(
    text: str,
    max_context_tokens: int = 100_000,
    safety_margin: float = 0.8,
) -> bool:
    """Check if text should be capped to fit in context window.

    Args:
        text: Text to check
        max_context_tokens: Maximum context window size
        safety_margin: Fraction of context to use (default 80%)

    Returns:
        True if text exceeds safe limit
    """
    estimated_tokens = estimate_token_count(text)
    safe_limit = int(max_context_tokens * safety_margin)
    return estimated_tokens > safe_limit


def cap_for_context(
    text: str,
    max_context_tokens: int = 100_000,
    safety_margin: float = 0.8,
) -> Tuple[str, bool]:
    """Cap text to fit within context window.

    Args:
        text: Text to cap
        max_context_tokens: Maximum context window size
        safety_margin: Fraction of context to use

    Returns:
        Tuple of (capped_text, was_truncated)
    """
    safe_tokens = int(max_context_tokens * safety_margin)
    # Convert tokens back to approximate characters
    safe_chars = safe_tokens * 4

    if len(text) <= safe_chars:
        return text, False

    # Cap and add marker
    marker = "\n\n[... truncated to fit context window ...]"
    return text[: safe_chars - len(marker)] + marker, True


# ============================================================================
# Configuration Class
# ============================================================================

@dataclass
class OutputCapConfig:
    """Configuration for output capping.

    Can be customized per-harness or per-policy.
    """
    max_read_size_kb: int = MAX_READ_SIZE_KB
    max_grep_matches: int = MAX_GREP_MATCHES
    max_glob_results: int = MAX_GLOB_RESULTS
    max_output_lines: int = MAX_OUTPUT_LINES
    max_list_items: int = MAX_LIST_ITEMS

    def cap_output(self, content: str) -> Tuple[str, bool]:
        """Cap output using this config's limits."""
        return cap_output(content, self.max_read_size_kb)

    def cap_grep(self, matches: List[Dict]) -> Tuple[List[Dict], bool]:
        """Cap grep results using this config's limits."""
        return cap_grep_results(matches, self.max_grep_matches)

    def cap_glob(self, files: List[str]) -> Tuple[List[str], bool]:
        """Cap glob results using this config's limits."""
        return cap_glob_results(files, self.max_glob_results)

    def cap_lines(self, content: str) -> Tuple[str, bool]:
        """Cap lines using this config's limits."""
        return cap_lines(content, self.max_output_lines)


# Default configuration instance
DEFAULT_CAPS = OutputCapConfig()
