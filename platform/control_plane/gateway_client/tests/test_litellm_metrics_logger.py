"""Unit tests for the LiteLLM custom metrics logger.

Validates Requirement 9.4: LiteLLM emits custom CloudWatch metrics via callback.
"""

import time
from unittest.mock import MagicMock, patch

import pytest

from gateway_client.cloudwatch_metrics import GatewayMetricsEmitter
from gateway_client.litellm_metrics_logger import LiteLLMMetricsLogger


@pytest.fixture
def mock_emitter():
    """Create a mock GatewayMetricsEmitter."""
    emitter = MagicMock(spec=GatewayMetricsEmitter)
    emitter.emit_request_metric.return_value = True
    return emitter


@pytest.fixture
def logger_instance(mock_emitter):
    """Create a LiteLLMMetricsLogger with mocked emitter."""
    return LiteLLMMetricsLogger(metrics_emitter=mock_emitter)


class TestLogSuccessEvent:
    """Tests for the log_success_event callback."""

    def test_emits_request_metric_on_success(self, logger_instance, mock_emitter):
        """Successful requests emit metrics with status 200."""
        kwargs = {"model": "claude-sonnet-4"}
        start = time.time()
        end = start + 0.5  # 500ms latency

        logger_instance.log_success_event(kwargs, None, start, end)

        mock_emitter.emit_request_metric.assert_called_once()
        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["model"] == "claude-sonnet-4"
        assert call_kwargs["status_code"] == 200
        assert abs(call_kwargs["latency_ms"] - 500.0) < 1.0

    def test_calculates_latency_correctly(self, logger_instance, mock_emitter):
        """Latency is calculated as (end - start) * 1000 ms."""
        kwargs = {"model": "nova-pro"}
        start = 1000.0
        end = 1000.25  # 250ms

        logger_instance.log_success_event(kwargs, None, start, end)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert abs(call_kwargs["latency_ms"] - 250.0) < 0.001

    def test_detects_cache_hit_from_litellm_params(self, logger_instance, mock_emitter):
        """Detects cache hit from litellm_params.cache_hit."""
        kwargs = {
            "model": "claude-sonnet-4",
            "litellm_params": {"cache_hit": True},
        }

        logger_instance.log_success_event(kwargs, None, 0.0, 0.01)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["cache_hit"] is True

    def test_detects_cache_hit_from_metadata(self, logger_instance, mock_emitter):
        """Detects cache hit from metadata.cache_hit."""
        kwargs = {
            "model": "claude-sonnet-4",
            "metadata": {"cache_hit": True},
        }

        logger_instance.log_success_event(kwargs, None, 0.0, 0.01)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["cache_hit"] is True

    def test_detects_cache_hit_from_response_hidden_params(
        self, logger_instance, mock_emitter
    ):
        """Detects cache hit from response._hidden_params."""
        kwargs = {"model": "claude-sonnet-4"}
        response = MagicMock()
        response._hidden_params = {"cache_hit": True}

        logger_instance.log_success_event(kwargs, response, 0.0, 0.01)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["cache_hit"] is True

    def test_defaults_to_cache_miss(self, logger_instance, mock_emitter):
        """Defaults to cache_hit=False when no cache indicators present."""
        kwargs = {"model": "claude-sonnet-4"}

        logger_instance.log_success_event(kwargs, None, 0.0, 0.1)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["cache_hit"] is False

    def test_uses_unknown_model_when_missing(self, logger_instance, mock_emitter):
        """Uses 'unknown' as model name when not in kwargs."""
        kwargs = {}

        logger_instance.log_success_event(kwargs, None, 0.0, 0.1)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["model"] == "unknown"

    def test_does_not_raise_on_emitter_error(self, logger_instance, mock_emitter):
        """Gracefully handles errors from the emitter without raising."""
        mock_emitter.emit_request_metric.side_effect = Exception("CloudWatch error")
        kwargs = {"model": "claude-sonnet-4"}

        # Should not raise
        logger_instance.log_success_event(kwargs, None, 0.0, 0.1)


class TestLogFailureEvent:
    """Tests for the log_failure_event callback."""

    def test_emits_request_metric_on_failure(self, logger_instance, mock_emitter):
        """Failed requests emit metrics with extracted status code."""
        kwargs = {"model": "claude-sonnet-4"}
        error = MagicMock()
        error.status_code = 503
        start = 0.0
        end = 2.0  # 2000ms

        logger_instance.log_failure_event(kwargs, error, start, end)

        mock_emitter.emit_request_metric.assert_called_once()
        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["model"] == "claude-sonnet-4"
        assert call_kwargs["status_code"] == 503
        assert abs(call_kwargs["latency_ms"] - 2000.0) < 0.001
        assert call_kwargs["cache_hit"] is False

    def test_extracts_status_from_response_attribute(
        self, logger_instance, mock_emitter
    ):
        """Extracts status_code from exception's response attribute."""
        kwargs = {"model": "nova-pro"}
        error = Exception("request failed")
        error.response = MagicMock()
        error.response.status_code = 429

        logger_instance.log_failure_event(kwargs, error, 0.0, 0.5)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["status_code"] == 429

    def test_defaults_to_500_when_status_unknown(self, logger_instance, mock_emitter):
        """Defaults to 500 when status code cannot be determined."""
        kwargs = {"model": "nova-pro"}
        error = Exception("something went wrong")

        logger_instance.log_failure_event(kwargs, error, 0.0, 0.5)

        call_kwargs = mock_emitter.emit_request_metric.call_args.kwargs
        assert call_kwargs["status_code"] == 500

    def test_does_not_raise_on_emitter_error(self, logger_instance, mock_emitter):
        """Gracefully handles errors from the emitter without raising."""
        mock_emitter.emit_request_metric.side_effect = Exception("CloudWatch error")
        kwargs = {"model": "claude-sonnet-4"}
        error = MagicMock()
        error.status_code = 500

        # Should not raise
        logger_instance.log_failure_event(kwargs, error, 0.0, 0.1)


class TestLiteLLMMetricsLoggerInit:
    """Tests for logger initialization."""

    def test_creates_default_emitter_when_none_provided(self):
        """Creates a GatewayMetricsEmitter with default settings."""
        logger_inst = LiteLLMMetricsLogger(gateway_id="my-gw", aws_region="us-west-2")
        assert logger_inst.emitter is not None
        assert logger_inst.emitter.gateway_id == "my-gw"

    def test_uses_provided_emitter(self, mock_emitter):
        """Uses the provided emitter instance."""
        logger_inst = LiteLLMMetricsLogger(metrics_emitter=mock_emitter)
        assert logger_inst.emitter is mock_emitter
