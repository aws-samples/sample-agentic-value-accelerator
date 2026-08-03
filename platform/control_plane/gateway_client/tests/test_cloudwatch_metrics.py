"""Unit tests for the CloudWatch metrics emission module.

Validates Requirements 9.4, 5.6:
- Custom CloudWatch metrics emitted to AVA/Gateway namespace
- Metrics: requests_per_second, latency_p50/p95/p99, error_rate_by_type,
  active_virtual_keys, cache_hit_ratio
- Circuit breaker metrics: circuit_breaker_state_transitions,
  fallback_activations, gateway_recovery_events
"""

from unittest.mock import MagicMock

import pytest

from gateway_client.cloudwatch_metrics import (
    METRICS_NAMESPACE,
    GatewayMetricsEmitter,
    MetricData,
    MetricDimension,
    MetricUnit,
)


@pytest.fixture
def mock_cloudwatch():
    """Create a mock CloudWatch client."""
    client = MagicMock()
    client.put_metric_data.return_value = {}
    return client


@pytest.fixture
def emitter(mock_cloudwatch):
    """Create a GatewayMetricsEmitter with a mocked CloudWatch client."""
    return GatewayMetricsEmitter(
        cloudwatch_client=mock_cloudwatch,
        namespace=METRICS_NAMESPACE,
        gateway_id="test-gateway",
    )


class TestGatewayMetricsEmitter:
    """Tests for the GatewayMetricsEmitter base emit functionality."""

    def test_namespace_is_ava_gateway(self, emitter):
        """Metrics are emitted to the AVA/Gateway namespace."""
        assert emitter.namespace == "AVA/Gateway"

    def test_emit_empty_list_returns_true(self, emitter, mock_cloudwatch):
        """Emitting an empty list of metrics succeeds without API calls."""
        result = emitter.emit([])
        assert result is True
        mock_cloudwatch.put_metric_data.assert_not_called()

    def test_emit_single_metric(self, emitter, mock_cloudwatch):
        """A single metric is emitted with correct namespace and data."""
        metric = MetricData(
            metric_name="test_metric",
            value=42.0,
            unit=MetricUnit.COUNT,
        )
        result = emitter.emit([metric])

        assert result is True
        mock_cloudwatch.put_metric_data.assert_called_once()
        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        assert call_kwargs["Namespace"] == "AVA/Gateway"
        assert len(call_kwargs["MetricData"]) == 1
        assert call_kwargs["MetricData"][0]["MetricName"] == "test_metric"
        assert call_kwargs["MetricData"][0]["Value"] == 42.0
        assert call_kwargs["MetricData"][0]["Unit"] == "Count"

    def test_emit_includes_gateway_id_dimension(self, emitter, mock_cloudwatch):
        """All emitted metrics include the GatewayId dimension."""
        metric = MetricData(metric_name="test", value=1.0, unit=MetricUnit.COUNT)
        emitter.emit([metric])

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        dimensions = call_kwargs["MetricData"][0]["Dimensions"]
        gateway_dims = [d for d in dimensions if d["Name"] == "GatewayId"]
        assert len(gateway_dims) == 1
        assert gateway_dims[0]["Value"] == "test-gateway"

    def test_emit_includes_custom_dimensions(self, emitter, mock_cloudwatch):
        """Custom dimensions are included alongside the GatewayId dimension."""
        metric = MetricData(
            metric_name="test",
            value=1.0,
            unit=MetricUnit.COUNT,
            dimensions=[
                MetricDimension("ErrorType", "timeout"),
                MetricDimension("Model", "claude-sonnet-4"),
            ],
        )
        emitter.emit([metric])

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        dimensions = call_kwargs["MetricData"][0]["Dimensions"]
        dim_names = [d["Name"] for d in dimensions]
        assert "GatewayId" in dim_names
        assert "ErrorType" in dim_names
        assert "Model" in dim_names

    def test_emit_returns_false_on_client_error(self, emitter, mock_cloudwatch):
        """Returns False when CloudWatch API raises an exception."""
        mock_cloudwatch.put_metric_data.side_effect = Exception("AWS error")
        result = emitter.emit([
            MetricData(metric_name="test", value=1.0, unit=MetricUnit.COUNT)
        ])
        assert result is False


class TestRequestMetrics:
    """Tests for emit_request_metric (Requirement 9.4)."""

    def test_emits_request_count_metric(self, emitter, mock_cloudwatch):
        """Emits requests_per_second metric on every request."""
        emitter.emit_request_metric(
            latency_ms=150.0, model="claude-sonnet-4", status_code=200
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        metric_names = [m["MetricName"] for m in call_kwargs["MetricData"]]
        assert "requests_per_second" in metric_names

    def test_emits_latency_metrics(self, emitter, mock_cloudwatch):
        """Emits latency_p50, latency_p95, latency_p99 metrics."""
        emitter.emit_request_metric(
            latency_ms=250.5, model="nova-pro", status_code=200
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        metric_names = [m["MetricName"] for m in call_kwargs["MetricData"]]
        assert "latency_p50" in metric_names
        assert "latency_p95" in metric_names
        assert "latency_p99" in metric_names

        # Verify latency value
        latency_metrics = [
            m for m in call_kwargs["MetricData"] if m["MetricName"] == "latency_p50"
        ]
        assert latency_metrics[0]["Value"] == 250.5
        assert latency_metrics[0]["Unit"] == "Milliseconds"

    def test_emits_error_metric_on_4xx(self, emitter, mock_cloudwatch):
        """Emits error_rate_by_type metric when status is 4xx."""
        emitter.emit_request_metric(
            latency_ms=100.0, model="claude-sonnet-4", status_code=429
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        metric_names = [m["MetricName"] for m in call_kwargs["MetricData"]]
        assert "error_rate_by_type" in metric_names

        error_metrics = [
            m for m in call_kwargs["MetricData"] if m["MetricName"] == "error_rate_by_type"
        ]
        error_dims = {d["Name"]: d["Value"] for d in error_metrics[0]["Dimensions"]}
        assert error_dims["ErrorType"] == "rate_limited"

    def test_emits_error_metric_on_5xx(self, emitter, mock_cloudwatch):
        """Emits error_rate_by_type metric with server_error type on 5xx."""
        emitter.emit_request_metric(
            latency_ms=100.0, model="nova-pro", status_code=500
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        error_metrics = [
            m for m in call_kwargs["MetricData"] if m["MetricName"] == "error_rate_by_type"
        ]
        error_dims = {d["Name"]: d["Value"] for d in error_metrics[0]["Dimensions"]}
        assert error_dims["ErrorType"] == "server_error"

    def test_no_error_metric_on_2xx(self, emitter, mock_cloudwatch):
        """No error_rate_by_type metric emitted for successful requests."""
        emitter.emit_request_metric(
            latency_ms=100.0, model="claude-sonnet-4", status_code=200
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        metric_names = [m["MetricName"] for m in call_kwargs["MetricData"]]
        assert "error_rate_by_type" not in metric_names

    def test_emits_cache_hit_metric(self, emitter, mock_cloudwatch):
        """Emits cache_hit_ratio metric with 'hit' value on cache hit."""
        emitter.emit_request_metric(
            latency_ms=5.0, model="claude-sonnet-4", status_code=200, cache_hit=True
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        cache_metrics = [
            m for m in call_kwargs["MetricData"] if m["MetricName"] == "cache_hit_ratio"
        ]
        assert len(cache_metrics) == 1
        assert cache_metrics[0]["Value"] == 1.0
        cache_dims = {d["Name"]: d["Value"] for d in cache_metrics[0]["Dimensions"]}
        assert cache_dims["CacheResult"] == "hit"

    def test_emits_cache_miss_metric(self, emitter, mock_cloudwatch):
        """Emits cache_hit_ratio metric with 'miss' value on cache miss."""
        emitter.emit_request_metric(
            latency_ms=100.0, model="claude-sonnet-4", status_code=200, cache_hit=False
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        cache_metrics = [
            m for m in call_kwargs["MetricData"] if m["MetricName"] == "cache_hit_ratio"
        ]
        assert len(cache_metrics) == 1
        assert cache_metrics[0]["Value"] == 0.0
        cache_dims = {d["Name"]: d["Value"] for d in cache_metrics[0]["Dimensions"]}
        assert cache_dims["CacheResult"] == "miss"

    def test_emits_model_dimension(self, emitter, mock_cloudwatch):
        """Request metrics include Model dimension."""
        emitter.emit_request_metric(
            latency_ms=100.0, model="nova-pro", status_code=200
        )

        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        req_metric = next(
            m for m in call_kwargs["MetricData"]
            if m["MetricName"] == "requests_per_second"
        )
        dim_names = [d["Name"] for d in req_metric["Dimensions"]]
        assert "Model" in dim_names


class TestActiveVirtualKeysMetric:
    """Tests for emit_active_virtual_keys."""

    def test_emits_active_virtual_keys_count(self, emitter, mock_cloudwatch):
        """Emits active_virtual_keys metric with the given count."""
        result = emitter.emit_active_virtual_keys(15)

        assert result is True
        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        assert call_kwargs["MetricData"][0]["MetricName"] == "active_virtual_keys"
        assert call_kwargs["MetricData"][0]["Value"] == 15.0
        assert call_kwargs["MetricData"][0]["Unit"] == "Count"


class TestCircuitBreakerMetrics:
    """Tests for circuit breaker metric emission (Requirement 5.6)."""

    def test_emits_state_transition_metric(self, emitter, mock_cloudwatch):
        """Emits circuit_breaker_state_transitions on state change."""
        result = emitter.emit_circuit_breaker_state_transition(
            from_state="closed", to_state="open"
        )

        assert result is True
        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        assert call_kwargs["MetricData"][0]["MetricName"] == "circuit_breaker_state_transitions"
        dims = {d["Name"]: d["Value"] for d in call_kwargs["MetricData"][0]["Dimensions"]}
        assert dims["FromState"] == "closed"
        assert dims["ToState"] == "open"

    def test_emits_fallback_activation_metric(self, emitter, mock_cloudwatch):
        """Emits fallback_activations with reason dimension."""
        result = emitter.emit_fallback_activation(reason="circuit_open")

        assert result is True
        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        assert call_kwargs["MetricData"][0]["MetricName"] == "fallback_activations"
        dims = {d["Name"]: d["Value"] for d in call_kwargs["MetricData"][0]["Dimensions"]}
        assert dims["Reason"] == "circuit_open"

    def test_emits_gateway_recovery_event(self, emitter, mock_cloudwatch):
        """Emits gateway_recovery_events metric on recovery."""
        result = emitter.emit_gateway_recovery_event()

        assert result is True
        call_kwargs = mock_cloudwatch.put_metric_data.call_args.kwargs
        assert call_kwargs["MetricData"][0]["MetricName"] == "gateway_recovery_events"
        assert call_kwargs["MetricData"][0]["Value"] == 1.0


class TestErrorClassification:
    """Tests for error type classification logic."""

    def test_429_classified_as_rate_limited(self):
        """HTTP 429 is classified as 'rate_limited'."""
        assert GatewayMetricsEmitter._classify_error(429) == "rate_limited"

    def test_400_classified_as_bad_request(self):
        """HTTP 400 is classified as 'bad_request'."""
        assert GatewayMetricsEmitter._classify_error(400) == "bad_request"

    def test_401_classified_as_auth_error(self):
        """HTTP 401 is classified as 'auth_error'."""
        assert GatewayMetricsEmitter._classify_error(401) == "auth_error"

    def test_403_classified_as_auth_error(self):
        """HTTP 403 is classified as 'auth_error'."""
        assert GatewayMetricsEmitter._classify_error(403) == "auth_error"

    def test_503_classified_as_service_unavailable(self):
        """HTTP 503 is classified as 'service_unavailable'."""
        assert GatewayMetricsEmitter._classify_error(503) == "service_unavailable"

    def test_500_classified_as_server_error(self):
        """HTTP 500 is classified as 'server_error'."""
        assert GatewayMetricsEmitter._classify_error(500) == "server_error"

    def test_404_classified_as_not_found(self):
        """HTTP 404 is classified as 'not_found'."""
        assert GatewayMetricsEmitter._classify_error(404) == "not_found"

    def test_other_4xx_classified_as_client_error(self):
        """Other 4xx codes are classified as 'client_error'."""
        assert GatewayMetricsEmitter._classify_error(409) == "client_error"
