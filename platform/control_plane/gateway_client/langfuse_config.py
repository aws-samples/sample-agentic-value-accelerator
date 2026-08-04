"""
Langfuse observability configuration for the LiteLLM Gateway.

Provides:
- Trace propagation: agents pass a trace ID in request headers, the gateway
  correlates traces by forwarding the trace parent to Langfuse callbacks.
- Local buffering: when Langfuse is unreachable, traces are buffered locally
  for up to 5 minutes before being dropped.
- Trace tagging: each trace is tagged with use_case and team derived from
  the virtual key metadata stored in the request context.

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
"""

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)

# Maximum time (seconds) to buffer traces when Langfuse is unreachable
DEFAULT_BUFFER_TTL_SECONDS = 300  # 5 minutes

# Maximum buffer size to prevent unbounded memory growth
DEFAULT_MAX_BUFFER_SIZE = 10000

# Header name for trace ID propagation (W3C Trace Context standard)
TRACE_PARENT_HEADER = "traceparent"

# Custom header for AVA-specific trace correlation
AVA_TRACE_ID_HEADER = "x-ava-trace-id"

# Retry interval for flushing buffered traces (seconds)
FLUSH_RETRY_INTERVAL = 10


@dataclass
class TraceMetadata:
    """Metadata tags derived from virtual key context for trace enrichment.

    Attributes:
        use_case: The use case identifier (e.g., "kyc_banking").
        team: The team identifier (e.g., "fsi-compliance").
        trace_id: The propagated trace ID from the upstream agent request.
        additional_tags: Any extra key-value tags to attach to the trace.
    """

    use_case: str = ""
    team: str = ""
    trace_id: str = ""
    additional_tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class BufferedTrace:
    """A trace record buffered for deferred delivery to Langfuse.

    Attributes:
        trace_data: The serialized trace payload to send to Langfuse.
        metadata: Trace metadata including use_case, team, and trace_id.
        buffered_at: Unix timestamp when the trace was buffered.
    """

    trace_data: Dict[str, Any]
    metadata: TraceMetadata
    buffered_at: float = field(default_factory=time.time)

    @property
    def age_seconds(self) -> float:
        """How long this trace has been buffered, in seconds."""
        return time.time() - self.buffered_at

    @property
    def is_expired(self) -> bool:
        """Whether this trace has exceeded the buffer TTL."""
        return self.age_seconds > DEFAULT_BUFFER_TTL_SECONDS


class LangfuseTraceBuffer:
    """Thread-safe local buffer for traces when Langfuse is unreachable.

    Buffers traces for up to 5 minutes. When Langfuse becomes available
    again, buffered traces are flushed in order. Traces older than the
    TTL are dropped with a warning log.

    Args:
        max_size: Maximum number of traces to buffer. Oldest traces are
            dropped when the buffer is full.
        buffer_ttl_seconds: Maximum age (seconds) for buffered traces
            before they are dropped. Defaults to 300 (5 minutes).
    """

    def __init__(
        self,
        max_size: int = DEFAULT_MAX_BUFFER_SIZE,
        buffer_ttl_seconds: int = DEFAULT_BUFFER_TTL_SECONDS,
    ):
        self._buffer: Deque[BufferedTrace] = deque(maxlen=max_size)
        self._lock = threading.Lock()
        self._max_size = max_size
        self._buffer_ttl_seconds = buffer_ttl_seconds
        self._dropped_count = 0

    @property
    def size(self) -> int:
        """Current number of traces in the buffer."""
        with self._lock:
            return len(self._buffer)

    @property
    def dropped_count(self) -> int:
        """Total number of traces dropped due to expiration or overflow."""
        with self._lock:
            return self._dropped_count

    def add(self, trace: BufferedTrace) -> bool:
        """Add a trace to the buffer.

        If the buffer is at capacity, the oldest trace is evicted.

        Args:
            trace: The buffered trace to add.

        Returns:
            True if the trace was added, False if it was immediately expired.
        """
        if trace.is_expired:
            with self._lock:
                self._dropped_count += 1
            logger.warning(
                "Trace already expired at buffer time (age=%.1fs), dropping",
                trace.age_seconds,
            )
            return False

        with self._lock:
            if len(self._buffer) >= self._max_size:
                evicted = self._buffer[0]
                self._dropped_count += 1
                logger.warning(
                    "Buffer full (%d), evicting oldest trace (age=%.1fs)",
                    self._max_size,
                    evicted.age_seconds,
                )
            self._buffer.append(trace)
        return True

    def flush(self) -> List[BufferedTrace]:
        """Remove and return all non-expired traces from the buffer.

        Expired traces are dropped and counted. The returned list is
        ordered from oldest to newest.

        Returns:
            List of non-expired buffered traces, ready for delivery.
        """
        with self._lock:
            valid_traces: List[BufferedTrace] = []
            expired_count = 0

            while self._buffer:
                trace = self._buffer.popleft()
                if trace.age_seconds > self._buffer_ttl_seconds:
                    expired_count += 1
                else:
                    valid_traces.append(trace)

            if expired_count > 0:
                self._dropped_count += expired_count
                logger.warning(
                    "Dropped %d expired traces during flush (TTL=%ds)",
                    expired_count,
                    self._buffer_ttl_seconds,
                )

            return valid_traces

    def clear(self) -> int:
        """Clear all traces from the buffer.

        Returns:
            The number of traces that were cleared.
        """
        with self._lock:
            count = len(self._buffer)
            self._buffer.clear()
            return count


class LangfuseObservabilityConfig:
    """Configures Langfuse observability for the LiteLLM Gateway.

    Handles:
    - Extracting trace propagation headers from agent requests
    - Tagging traces with use_case and team from virtual key metadata
    - Buffering traces locally when Langfuse is unreachable
    - Building the Langfuse callback configuration for LiteLLM

    Args:
        langfuse_host: The Langfuse endpoint URL.
        langfuse_public_key: Langfuse public key for authentication.
        langfuse_secret_key: Langfuse secret key for authentication.
        buffer_ttl_seconds: Max buffer time in seconds (default 300 = 5 min).
        max_buffer_size: Maximum traces to buffer (default 10000).
    """

    def __init__(
        self,
        langfuse_host: str = "",
        langfuse_public_key: str = "",
        langfuse_secret_key: str = "",
        buffer_ttl_seconds: int = DEFAULT_BUFFER_TTL_SECONDS,
        max_buffer_size: int = DEFAULT_MAX_BUFFER_SIZE,
    ):
        self._langfuse_host = langfuse_host
        self._langfuse_public_key = langfuse_public_key
        self._langfuse_secret_key = langfuse_secret_key
        self._buffer = LangfuseTraceBuffer(
            max_size=max_buffer_size,
            buffer_ttl_seconds=buffer_ttl_seconds,
        )
        self._is_langfuse_available = True

    @property
    def buffer(self) -> LangfuseTraceBuffer:
        """Access the trace buffer."""
        return self._buffer

    @property
    def is_langfuse_available(self) -> bool:
        """Whether Langfuse is currently reachable."""
        return self._is_langfuse_available

    @is_langfuse_available.setter
    def is_langfuse_available(self, value: bool) -> None:
        """Set Langfuse availability status."""
        if not value and self._is_langfuse_available:
            logger.warning("Langfuse marked as unreachable, buffering traces")
        elif value and not self._is_langfuse_available:
            logger.info("Langfuse connectivity restored")
        self._is_langfuse_available = value

    def extract_trace_id(self, headers: Dict[str, str]) -> str:
        """Extract trace ID from request headers for correlation.

        Supports both W3C Trace Context (traceparent) and AVA-specific
        (x-ava-trace-id) headers. The AVA header takes precedence.

        Args:
            headers: Dictionary of HTTP request headers (case-insensitive keys).

        Returns:
            The extracted trace ID string, or empty string if not found.
        """
        # Normalize header keys to lowercase for case-insensitive lookup
        normalized = {k.lower(): v for k, v in headers.items()}

        # AVA-specific header takes precedence
        if AVA_TRACE_ID_HEADER in normalized:
            return normalized[AVA_TRACE_ID_HEADER]

        # Fall back to W3C Trace Context traceparent header
        if TRACE_PARENT_HEADER in normalized:
            return self._parse_traceparent(normalized[TRACE_PARENT_HEADER])

        return ""

    def build_trace_metadata(
        self,
        headers: Dict[str, str],
        virtual_key_metadata: Optional[Dict[str, Any]] = None,
    ) -> TraceMetadata:
        """Build trace metadata from request headers and virtual key metadata.

        Extracts the trace ID from headers and the use_case/team from the
        virtual key metadata to create a TraceMetadata object for tagging.

        Args:
            headers: HTTP request headers containing trace propagation info.
            virtual_key_metadata: Virtual key metadata dict containing
                'use_case' and 'team' fields. Typically from LiteLLM's
                key validation context.

        Returns:
            TraceMetadata with use_case, team, and trace_id populated.
        """
        trace_id = self.extract_trace_id(headers)

        use_case = ""
        team = ""
        if virtual_key_metadata:
            use_case = virtual_key_metadata.get("use_case", "")
            team = virtual_key_metadata.get("team", "")

        return TraceMetadata(
            use_case=use_case,
            team=team,
            trace_id=trace_id,
        )

    def build_langfuse_callback_kwargs(
        self, metadata: TraceMetadata
    ) -> Dict[str, Any]:
        """Build kwargs for LiteLLM's Langfuse callback with trace tags.

        Produces a dictionary that can be passed as `metadata` in LiteLLM
        callback kwargs to tag the Langfuse trace with use_case, team,
        and correlate with the upstream trace ID.

        Args:
            metadata: The trace metadata to include in callback kwargs.

        Returns:
            Dictionary of Langfuse callback parameters.
        """
        callback_kwargs: Dict[str, Any] = {}

        # Trace correlation via trace_id
        if metadata.trace_id:
            callback_kwargs["trace_id"] = metadata.trace_id

        # Tags for filtering in Langfuse UI
        tags: List[str] = []
        if metadata.use_case:
            tags.append(f"use_case:{metadata.use_case}")
        if metadata.team:
            tags.append(f"team:{metadata.team}")
        for key, value in metadata.additional_tags.items():
            tags.append(f"{key}:{value}")

        if tags:
            callback_kwargs["tags"] = tags

        # Metadata for Langfuse trace attributes
        trace_metadata: Dict[str, str] = {}
        if metadata.use_case:
            trace_metadata["use_case"] = metadata.use_case
        if metadata.team:
            trace_metadata["team"] = metadata.team

        if trace_metadata:
            callback_kwargs["metadata"] = trace_metadata

        return callback_kwargs

    def build_litellm_callback_config(self) -> Dict[str, Any]:
        """Build the LiteLLM callback configuration section for Langfuse.

        Returns the litellm_settings fields related to Langfuse callbacks
        including the environment variable references for keys and host.

        Returns:
            Dictionary with Langfuse callback configuration.
        """
        return {
            "success_callback": ["langfuse"],
            "failure_callback": ["langfuse"],
            "langfuse_host": self._langfuse_host or "${LANGFUSE_HOST}",
            "langfuse_public_key": (
                self._langfuse_public_key or "${LANGFUSE_PUBLIC_KEY}"
            ),
            "langfuse_secret_key": (
                self._langfuse_secret_key or "${LANGFUSE_SECRET_KEY}"
            ),
        }

    def buffer_trace(
        self, trace_data: Dict[str, Any], metadata: TraceMetadata
    ) -> bool:
        """Buffer a trace for deferred delivery when Langfuse is unreachable.

        Args:
            trace_data: The trace payload to buffer.
            metadata: Associated trace metadata.

        Returns:
            True if the trace was buffered, False if expired or failed.
        """
        buffered = BufferedTrace(
            trace_data=trace_data,
            metadata=metadata,
        )
        return self._buffer.add(buffered)

    def flush_buffered_traces(self) -> List[BufferedTrace]:
        """Flush all non-expired buffered traces.

        Call this when Langfuse connectivity is restored to deliver
        previously buffered traces.

        Returns:
            List of buffered traces ready for delivery, ordered oldest first.
        """
        traces = self._buffer.flush()
        if traces:
            logger.info(
                "Flushed %d buffered traces for delivery to Langfuse",
                len(traces),
            )
        return traces

    @staticmethod
    def _parse_traceparent(traceparent: str) -> str:
        """Parse a W3C traceparent header to extract the trace ID.

        W3C Trace Context format: {version}-{trace-id}-{parent-id}-{trace-flags}
        Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

        Args:
            traceparent: The traceparent header value.

        Returns:
            The trace-id portion, or the full string if not parseable.
        """
        parts = traceparent.split("-")
        if len(parts) >= 4:
            return parts[1]  # trace-id is the second field
        # If not a valid traceparent format, return as-is for best-effort
        return traceparent
