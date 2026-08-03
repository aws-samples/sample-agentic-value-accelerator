"""
Unit tests for the Langfuse observability configuration module.

Tests cover:
- Trace ID extraction from W3C traceparent and AVA-specific headers
- Trace metadata building from virtual key metadata (use_case, team)
- Langfuse callback kwargs construction with trace tags
- Local trace buffering when Langfuse is unreachable
- Buffer TTL expiration (5-minute limit)
- Buffer flush and overflow behavior
- LiteLLM callback config generation

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
"""

import time
import pytest
import os
import importlib.util

# Direct import to avoid any cascading dependency issues
_module_path = os.path.join(
    os.path.dirname(__file__), "..", "langfuse_config.py"
)
_spec = importlib.util.spec_from_file_location("langfuse_config", _module_path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

LangfuseObservabilityConfig = _module.LangfuseObservabilityConfig
LangfuseTraceBuffer = _module.LangfuseTraceBuffer
TraceMetadata = _module.TraceMetadata
BufferedTrace = _module.BufferedTrace
TRACE_PARENT_HEADER = _module.TRACE_PARENT_HEADER
AVA_TRACE_ID_HEADER = _module.AVA_TRACE_ID_HEADER
DEFAULT_BUFFER_TTL_SECONDS = _module.DEFAULT_BUFFER_TTL_SECONDS


@pytest.fixture
def config():
    """Create a LangfuseObservabilityConfig instance."""
    return LangfuseObservabilityConfig(
        langfuse_host="https://langfuse.example.com",
        langfuse_public_key="pk-lf-test-123",
        langfuse_secret_key="sk-lf-test-456",
    )


@pytest.fixture
def buffer():
    """Create a LangfuseTraceBuffer instance with small TTL for testing."""
    return LangfuseTraceBuffer(max_size=100, buffer_ttl_seconds=300)


class TestTraceIdExtraction:
    """Tests for extracting trace IDs from request headers."""

    def test_extract_ava_trace_id_header(self, config):
        """AVA-specific x-ava-trace-id header should be extracted."""
        headers = {"x-ava-trace-id": "ava-trace-abc123"}
        trace_id = config.extract_trace_id(headers)
        assert trace_id == "ava-trace-abc123"

    def test_extract_w3c_traceparent_header(self, config):
        """W3C traceparent header should extract the trace-id portion."""
        traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        headers = {"traceparent": traceparent}
        trace_id = config.extract_trace_id(headers)
        assert trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"

    def test_ava_header_takes_precedence_over_traceparent(self, config):
        """When both headers are present, AVA header takes precedence."""
        headers = {
            "x-ava-trace-id": "ava-priority-trace",
            "traceparent": "00-other-trace-id-00f067aa0ba902b7-01",
        }
        trace_id = config.extract_trace_id(headers)
        assert trace_id == "ava-priority-trace"

    def test_case_insensitive_header_lookup(self, config):
        """Header keys should be matched case-insensitively."""
        headers = {"X-Ava-Trace-Id": "case-insensitive-trace"}
        trace_id = config.extract_trace_id(headers)
        assert trace_id == "case-insensitive-trace"

    def test_no_trace_headers_returns_empty(self, config):
        """When no trace headers are present, returns empty string."""
        headers = {"content-type": "application/json"}
        trace_id = config.extract_trace_id(headers)
        assert trace_id == ""

    def test_empty_headers_returns_empty(self, config):
        """Empty headers dict returns empty trace ID."""
        trace_id = config.extract_trace_id({})
        assert trace_id == ""

    def test_malformed_traceparent_returns_full_string(self, config):
        """If traceparent doesn't have enough parts, return as-is."""
        headers = {"traceparent": "malformed-no-dashes"}
        trace_id = config.extract_trace_id(headers)
        assert trace_id == "malformed-no-dashes"

    def test_traceparent_with_short_format(self, config):
        """traceparent with fewer than 4 dash-separated parts returns as-is."""
        headers = {"traceparent": "00-traceid-parentid"}
        trace_id = config.extract_trace_id(headers)
        # Only 3 parts, so returns full string
        assert trace_id == "00-traceid-parentid"


class TestTraceMetadataBuilding:
    """Tests for building trace metadata from request context."""

    def test_build_metadata_with_all_fields(self, config):
        """build_trace_metadata should populate all fields from headers and key metadata."""
        headers = {"x-ava-trace-id": "trace-xyz"}
        key_metadata = {"use_case": "kyc_banking", "team": "fsi-compliance"}

        metadata = config.build_trace_metadata(headers, key_metadata)

        assert metadata.trace_id == "trace-xyz"
        assert metadata.use_case == "kyc_banking"
        assert metadata.team == "fsi-compliance"

    def test_build_metadata_with_no_key_metadata(self, config):
        """When virtual key metadata is None, use_case and team should be empty."""
        headers = {"x-ava-trace-id": "trace-only"}

        metadata = config.build_trace_metadata(headers, None)

        assert metadata.trace_id == "trace-only"
        assert metadata.use_case == ""
        assert metadata.team == ""

    def test_build_metadata_with_empty_key_metadata(self, config):
        """When virtual key metadata is empty dict, use_case and team are empty."""
        headers = {}
        key_metadata = {}

        metadata = config.build_trace_metadata(headers, key_metadata)

        assert metadata.trace_id == ""
        assert metadata.use_case == ""
        assert metadata.team == ""

    def test_build_metadata_partial_key_metadata(self, config):
        """When key metadata has only use_case, team should default to empty."""
        headers = {}
        key_metadata = {"use_case": "claims_processing"}

        metadata = config.build_trace_metadata(headers, key_metadata)

        assert metadata.use_case == "claims_processing"
        assert metadata.team == ""


class TestLangfuseCallbackKwargs:
    """Tests for building Langfuse callback kwargs with trace tags."""

    def test_callback_kwargs_with_full_metadata(self, config):
        """Full metadata should produce trace_id, tags, and metadata in kwargs."""
        metadata = TraceMetadata(
            use_case="kyc_banking",
            team="fsi-compliance",
            trace_id="trace-abc123",
        )

        kwargs = config.build_langfuse_callback_kwargs(metadata)

        assert kwargs["trace_id"] == "trace-abc123"
        assert "use_case:kyc_banking" in kwargs["tags"]
        assert "team:fsi-compliance" in kwargs["tags"]
        assert kwargs["metadata"]["use_case"] == "kyc_banking"
        assert kwargs["metadata"]["team"] == "fsi-compliance"

    def test_callback_kwargs_with_no_trace_id(self, config):
        """When no trace_id, it should not be in kwargs."""
        metadata = TraceMetadata(
            use_case="kyc_banking",
            team="fsi-compliance",
            trace_id="",
        )

        kwargs = config.build_langfuse_callback_kwargs(metadata)

        assert "trace_id" not in kwargs
        assert "use_case:kyc_banking" in kwargs["tags"]

    def test_callback_kwargs_with_empty_metadata(self, config):
        """Empty metadata should produce empty kwargs."""
        metadata = TraceMetadata()

        kwargs = config.build_langfuse_callback_kwargs(metadata)

        assert "trace_id" not in kwargs
        assert "tags" not in kwargs
        assert "metadata" not in kwargs

    def test_callback_kwargs_with_additional_tags(self, config):
        """Additional tags should be included in the tags list."""
        metadata = TraceMetadata(
            use_case="kyc_banking",
            team="fsi-compliance",
            trace_id="trace-123",
            additional_tags={"env": "production", "version": "1.0"},
        )

        kwargs = config.build_langfuse_callback_kwargs(metadata)

        assert "env:production" in kwargs["tags"]
        assert "version:1.0" in kwargs["tags"]
        assert "use_case:kyc_banking" in kwargs["tags"]

    def test_callback_kwargs_only_team(self, config):
        """Metadata with only team should produce team tag."""
        metadata = TraceMetadata(team="data-science")

        kwargs = config.build_langfuse_callback_kwargs(metadata)

        assert kwargs["tags"] == ["team:data-science"]
        assert kwargs["metadata"]["team"] == "data-science"


class TestLiteLLMCallbackConfig:
    """Tests for building the LiteLLM callback configuration."""

    def test_callback_config_with_explicit_values(self, config):
        """When values are provided, they should be used directly."""
        cb_config = config.build_litellm_callback_config()

        assert cb_config["success_callback"] == ["langfuse"]
        assert cb_config["failure_callback"] == ["langfuse"]
        assert cb_config["langfuse_host"] == "https://langfuse.example.com"
        assert cb_config["langfuse_public_key"] == "pk-lf-test-123"
        assert cb_config["langfuse_secret_key"] == "sk-lf-test-456"

    def test_callback_config_with_env_var_placeholders(self):
        """When no values provided, use env var placeholders."""
        config = LangfuseObservabilityConfig()
        cb_config = config.build_litellm_callback_config()

        assert cb_config["langfuse_host"] == "${LANGFUSE_HOST}"
        assert cb_config["langfuse_public_key"] == "${LANGFUSE_PUBLIC_KEY}"
        assert cb_config["langfuse_secret_key"] == "${LANGFUSE_SECRET_KEY}"


class TestLangfuseTraceBuffer:
    """Tests for the local trace buffer."""

    def test_buffer_starts_empty(self, buffer):
        """New buffer should be empty."""
        assert buffer.size == 0
        assert buffer.dropped_count == 0

    def test_add_trace_increases_size(self, buffer):
        """Adding a trace should increase buffer size."""
        trace = BufferedTrace(
            trace_data={"model": "claude-sonnet-4"},
            metadata=TraceMetadata(use_case="test"),
        )
        result = buffer.add(trace)

        assert result is True
        assert buffer.size == 1

    def test_flush_returns_all_valid_traces(self, buffer):
        """Flush should return all non-expired traces."""
        for i in range(5):
            trace = BufferedTrace(
                trace_data={"request_id": i},
                metadata=TraceMetadata(use_case=f"uc_{i}"),
            )
            buffer.add(trace)

        assert buffer.size == 5
        flushed = buffer.flush()

        assert len(flushed) == 5
        assert buffer.size == 0

    def test_flush_drops_expired_traces(self):
        """Flush should drop traces older than TTL."""
        # Use a very short TTL for testing
        short_buffer = LangfuseTraceBuffer(max_size=100, buffer_ttl_seconds=1)

        trace = BufferedTrace(
            trace_data={"old": True},
            metadata=TraceMetadata(use_case="old_trace"),
            buffered_at=time.time() - 2,  # Buffered 2 seconds ago
        )
        short_buffer.add(trace)

        # Add a fresh trace
        fresh_trace = BufferedTrace(
            trace_data={"fresh": True},
            metadata=TraceMetadata(use_case="fresh_trace"),
        )
        short_buffer.add(fresh_trace)

        flushed = short_buffer.flush()

        # Only fresh trace should remain
        assert len(flushed) == 1
        assert flushed[0].trace_data["fresh"] is True
        assert short_buffer.dropped_count == 1

    def test_buffer_overflow_evicts_oldest(self):
        """When buffer is full, oldest traces should be evicted."""
        small_buffer = LangfuseTraceBuffer(max_size=3, buffer_ttl_seconds=300)

        for i in range(5):
            trace = BufferedTrace(
                trace_data={"id": i},
                metadata=TraceMetadata(),
            )
            small_buffer.add(trace)

        # Buffer capacity is 3, deque with maxlen handles eviction
        assert small_buffer.size == 3
        # 2 traces were evicted (dropped)
        assert small_buffer.dropped_count == 2

    def test_clear_empties_buffer(self, buffer):
        """Clear should remove all traces and return the count."""
        for i in range(3):
            trace = BufferedTrace(
                trace_data={"id": i},
                metadata=TraceMetadata(),
            )
            buffer.add(trace)

        count = buffer.clear()
        assert count == 3
        assert buffer.size == 0

    def test_add_expired_trace_rejected(self):
        """Adding an already-expired trace should fail and increment dropped count."""
        buffer = LangfuseTraceBuffer(max_size=100, buffer_ttl_seconds=300)

        expired_trace = BufferedTrace(
            trace_data={"expired": True},
            metadata=TraceMetadata(),
            buffered_at=time.time() - 400,  # 400 seconds ago > 300 TTL
        )
        result = buffer.add(expired_trace)

        assert result is False
        assert buffer.size == 0
        assert buffer.dropped_count == 1


class TestBufferedTrace:
    """Tests for the BufferedTrace dataclass."""

    def test_age_seconds_property(self):
        """age_seconds should reflect time since buffering."""
        trace = BufferedTrace(
            trace_data={},
            metadata=TraceMetadata(),
            buffered_at=time.time() - 10,
        )
        assert trace.age_seconds >= 10

    def test_is_expired_within_ttl(self):
        """Trace within TTL should not be expired."""
        trace = BufferedTrace(
            trace_data={},
            metadata=TraceMetadata(),
            buffered_at=time.time() - 100,
        )
        assert trace.is_expired is False

    def test_is_expired_beyond_ttl(self):
        """Trace beyond TTL should be expired."""
        trace = BufferedTrace(
            trace_data={},
            metadata=TraceMetadata(),
            buffered_at=time.time() - 400,  # > 300s default TTL
        )
        assert trace.is_expired is True


class TestLangfuseAvailability:
    """Tests for Langfuse availability tracking and buffering behavior."""

    def test_initial_availability_is_true(self, config):
        """Langfuse should initially be marked as available."""
        assert config.is_langfuse_available is True

    def test_marking_unavailable(self, config):
        """Setting availability to False should be reflected."""
        config.is_langfuse_available = False
        assert config.is_langfuse_available is False

    def test_buffer_trace_when_unavailable(self, config):
        """buffer_trace should accept traces when Langfuse is unreachable."""
        config.is_langfuse_available = False
        metadata = TraceMetadata(use_case="kyc_banking", team="compliance")

        result = config.buffer_trace(
            trace_data={"model": "claude-sonnet-4", "tokens": 1000},
            metadata=metadata,
        )

        assert result is True
        assert config.buffer.size == 1

    def test_flush_buffered_traces_on_recovery(self, config):
        """flush_buffered_traces should return buffered traces for delivery."""
        config.is_langfuse_available = False
        metadata = TraceMetadata(use_case="test", team="qa")

        config.buffer_trace({"id": 1}, metadata)
        config.buffer_trace({"id": 2}, metadata)

        config.is_langfuse_available = True
        flushed = config.flush_buffered_traces()

        assert len(flushed) == 2
        assert config.buffer.size == 0


class TestTraceMetadataDataclass:
    """Tests for TraceMetadata dataclass."""

    def test_default_values(self):
        """TraceMetadata defaults should all be empty."""
        metadata = TraceMetadata()
        assert metadata.use_case == ""
        assert metadata.team == ""
        assert metadata.trace_id == ""
        assert metadata.additional_tags == {}

    def test_custom_values(self):
        """TraceMetadata should accept custom values."""
        metadata = TraceMetadata(
            use_case="claims",
            team="insurance",
            trace_id="abc-123",
            additional_tags={"env": "prod"},
        )
        assert metadata.use_case == "claims"
        assert metadata.team == "insurance"
        assert metadata.trace_id == "abc-123"
        assert metadata.additional_tags == {"env": "prod"}
