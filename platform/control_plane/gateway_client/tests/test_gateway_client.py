"""Unit tests for the async Gateway Client with request routing and health monitoring.

Validates Requirements 4.1, 4.2, 5.2, 5.3, 5.6
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from gateway_client.circuit_breaker import CircuitState, GatewayCircuitBreaker
from gateway_client.gateway_client import (
    CLOUDWATCH_NAMESPACE,
    GatewayClient,
    LLMRequest,
    LLMResponse,
)


# --- Fixtures and Helpers ---


def make_request(model="claude-sonnet-4", content="Hello"):
    """Create a simple LLMRequest for testing."""
    return LLMRequest(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_tokens=100,
        temperature=0.5,
    )


def make_gateway_response():
    """Create a mock httpx response simulating the gateway."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {"role": "assistant", "content": "Hello! How can I help?"},
                "finish_reason": "stop",
            }
        ],
        "model": "claude-sonnet-4",
        "usage": {"prompt_tokens": 10, "completion_tokens": 20},
    }
    mock_response.raise_for_status = MagicMock()
    return mock_response


def make_bedrock_response():
    """Create a mock Bedrock Converse API response."""
    return {
        "output": {
            "message": {
                "role": "assistant",
                "content": [{"text": "Direct Bedrock response"}],
            }
        },
        "usage": {"inputTokens": 5, "outputTokens": 15},
        "stopReason": "end_turn",
    }


@pytest.fixture
def mock_http_client():
    """Create a mock httpx.AsyncClient."""
    client = AsyncMock()
    return client


@pytest.fixture
def mock_bedrock_client():
    """Create a mock boto3 bedrock-runtime client."""
    client = MagicMock()
    client.converse.return_value = make_bedrock_response()
    return client


@pytest.fixture
def mock_cloudwatch_client():
    """Create a mock boto3 CloudWatch client."""
    client = MagicMock()
    client.put_metric_data.return_value = {}
    return client


@pytest.fixture
def circuit_breaker():
    """Create a circuit breaker with default settings."""
    return GatewayCircuitBreaker(
        gateway_url="http://gateway:4000",
        failure_threshold=3,
        recovery_timeout=30,
        success_threshold=2,
    )


@pytest.fixture
def gateway_client(mock_http_client, mock_bedrock_client, mock_cloudwatch_client, circuit_breaker):
    """Create a GatewayClient with mocked dependencies."""
    return GatewayClient(
        gateway_url="http://gateway:4000",
        virtual_key="sk-test-key-12345",
        circuit_breaker=circuit_breaker,
        http_client=mock_http_client,
        bedrock_client=mock_bedrock_client,
        cloudwatch_client=mock_cloudwatch_client,
    )


# --- Test call() Method: Routing via Gateway ---


class TestCallRoutesThroughGateway:
    """Test that call() routes through gateway when CLOSED/HALF_OPEN."""

    @pytest.mark.asyncio
    async def test_routes_through_gateway_when_closed(
        self, gateway_client, mock_http_client
    ):
        """When circuit is CLOSED, request goes through gateway."""
        mock_http_client.post.return_value = make_gateway_response()

        request = make_request()
        response = await gateway_client.call(request)

        assert response.route == "gateway"
        assert response.content == "Hello! How can I help?"
        assert response.input_tokens == 10
        assert response.output_tokens == 20
        mock_http_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_gateway_request_includes_authorization_header(
        self, gateway_client, mock_http_client
    ):
        """Gateway requests include Bearer token in Authorization header."""
        mock_http_client.post.return_value = make_gateway_response()

        request = make_request()
        await gateway_client.call(request)

        call_args = mock_http_client.post.call_args
        headers = call_args.kwargs.get("headers", {})
        assert headers["Authorization"] == "Bearer sk-test-key-12345"

    @pytest.mark.asyncio
    async def test_gateway_request_sends_to_chat_completions(
        self, gateway_client, mock_http_client
    ):
        """Gateway requests are sent to /chat/completions endpoint."""
        mock_http_client.post.return_value = make_gateway_response()

        request = make_request()
        await gateway_client.call(request)

        call_args = mock_http_client.post.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert url == "http://gateway:4000/chat/completions"

    @pytest.mark.asyncio
    async def test_gateway_request_includes_model_and_messages(
        self, gateway_client, mock_http_client
    ):
        """Gateway request payload includes model and messages."""
        mock_http_client.post.return_value = make_gateway_response()

        request = make_request(model="nova-pro", content="Test message")
        await gateway_client.call(request)

        call_args = mock_http_client.post.call_args
        payload = call_args.kwargs.get("json", {})
        assert payload["model"] == "nova-pro"
        assert payload["messages"] == [{"role": "user", "content": "Test message"}]
        assert payload["max_tokens"] == 100
        assert payload["temperature"] == 0.5

    @pytest.mark.asyncio
    async def test_records_success_on_gateway_response(
        self, gateway_client, mock_http_client, circuit_breaker
    ):
        """Successful gateway calls record success in circuit breaker."""
        mock_http_client.post.return_value = make_gateway_response()

        # Record some failures first (but not enough to open)
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = make_request()
        await gateway_client.call(request)

        # Success should reset failure count
        assert circuit_breaker.failure_count == 0


# --- Test call() Method: Fallback to Direct Bedrock ---


class TestCallFallsBackToBedrock:
    """Test that call() falls back to Bedrock when circuit is OPEN."""

    @pytest.mark.asyncio
    async def test_routes_to_bedrock_when_open(
        self, gateway_client, mock_bedrock_client, circuit_breaker
    ):
        """When circuit is OPEN, request goes directly to Bedrock."""
        # Open the circuit
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        assert circuit_breaker.state == CircuitState.OPEN

        request = make_request(model="bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0")
        response = await gateway_client.call(request)

        assert response.route == "direct_bedrock"
        assert response.content == "Direct Bedrock response"
        assert response.input_tokens == 5
        assert response.output_tokens == 15
        mock_bedrock_client.converse.assert_called_once()

    @pytest.mark.asyncio
    async def test_bedrock_fallback_strips_bedrock_prefix(
        self, gateway_client, mock_bedrock_client, circuit_breaker
    ):
        """Direct Bedrock calls strip the 'bedrock/' prefix from model ID."""
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = make_request(model="bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0")
        await gateway_client.call(request)

        call_args = mock_bedrock_client.converse.call_args
        assert call_args.kwargs["modelId"] == "us.anthropic.claude-sonnet-4-20250514-v1:0"

    @pytest.mark.asyncio
    async def test_bedrock_fallback_converts_messages(
        self, gateway_client, mock_bedrock_client, circuit_breaker
    ):
        """Direct Bedrock calls convert messages to Converse format."""
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = LLMRequest(
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
            messages=[
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi there"},
                {"role": "user", "content": "How are you?"},
            ],
        )
        await gateway_client.call(request)

        call_args = mock_bedrock_client.converse.call_args
        messages = call_args.kwargs["messages"]
        assert len(messages) == 3
        assert messages[0] == {"role": "user", "content": [{"text": "Hello"}]}
        assert messages[1] == {"role": "assistant", "content": [{"text": "Hi there"}]}
        assert messages[2] == {"role": "user", "content": [{"text": "How are you?"}]}

    @pytest.mark.asyncio
    async def test_gateway_failure_causes_fallback_when_circuit_opens(
        self, gateway_client, mock_http_client, mock_bedrock_client, circuit_breaker
    ):
        """When gateway fails and circuit opens, falls back to Bedrock."""
        # Bring circuit to the edge (2 failures already)
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        # Next gateway call fails — circuit opens
        mock_http_client.post.side_effect = Exception("Connection refused")

        request = make_request()
        response = await gateway_client.call(request)

        # Should have fallen back to Bedrock
        assert response.route == "direct_bedrock"
        mock_bedrock_client.converse.assert_called_once()


# --- Test CloudWatch Metrics ---


class TestCloudWatchMetrics:
    """Test that CloudWatch metrics are emitted on state transitions and fallbacks."""

    @pytest.mark.asyncio
    async def test_emits_fallback_activation_metric(
        self, gateway_client, mock_cloudwatch_client, circuit_breaker
    ):
        """Fallback activation emits a CloudWatch metric."""
        # Open the circuit
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = make_request()
        await gateway_client.call(request)

        # Check that put_metric_data was called for fallback
        calls = mock_cloudwatch_client.put_metric_data.call_args_list
        fallback_calls = [
            c
            for c in calls
            if any(
                m["MetricName"] == "FallbackActivation"
                for m in c.kwargs.get("MetricData", c[1].get("MetricData", []))
                if isinstance(m, dict)
            )
        ]
        assert len(fallback_calls) >= 1

    @pytest.mark.asyncio
    async def test_emits_state_transition_metric_on_circuit_open(
        self, gateway_client, mock_http_client, mock_cloudwatch_client, circuit_breaker
    ):
        """State transition from CLOSED to OPEN emits a metric."""
        # Set up 2 failures already
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        # The third failure (via call) should trigger the transition
        mock_http_client.post.side_effect = Exception("Gateway down")

        request = make_request()
        await gateway_client.call(request)

        # Check that a state transition metric was emitted
        calls = mock_cloudwatch_client.put_metric_data.call_args_list
        transition_calls = [
            c
            for c in calls
            if any(
                m.get("MetricName") == "CircuitBreakerStateTransition"
                for m in c.kwargs.get("MetricData", c[1].get("MetricData", []))
                if isinstance(m, dict)
            )
        ]
        assert len(transition_calls) >= 1

    @pytest.mark.asyncio
    async def test_metrics_use_correct_namespace(
        self, gateway_client, mock_cloudwatch_client, circuit_breaker
    ):
        """All metrics are emitted to the AVA/Gateway namespace."""
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = make_request()
        await gateway_client.call(request)

        for call_args in mock_cloudwatch_client.put_metric_data.call_args_list:
            namespace = call_args.kwargs.get(
                "Namespace", call_args[1].get("Namespace", "")
            )
            assert namespace == CLOUDWATCH_NAMESPACE


# --- Test Background Health Checker ---


class TestHealthChecker:
    """Test the background health checker functionality."""

    @pytest.mark.asyncio
    async def test_health_checker_starts_and_stops(self, gateway_client):
        """Health checker can be started and stopped."""
        await gateway_client.start_health_checker()
        assert gateway_client.is_health_checker_running is True

        await gateway_client.stop_health_checker()
        assert gateway_client.is_health_checker_running is False

    @pytest.mark.asyncio
    async def test_health_checker_probes_health_endpoint(
        self, gateway_client, mock_http_client
    ):
        """Health checker probes /health endpoint."""
        # Mock a healthy response
        health_response = MagicMock()
        health_response.status_code = 200
        mock_http_client.get.return_value = health_response

        await gateway_client.start_health_checker()
        # Let the health check loop run once
        await asyncio.sleep(0.1)
        await gateway_client.stop_health_checker()

        # Verify /health was probed
        mock_http_client.get.assert_called()
        call_args = mock_http_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "/health" in url

    @pytest.mark.asyncio
    async def test_health_check_success_records_in_circuit_breaker(
        self, gateway_client, mock_http_client, circuit_breaker
    ):
        """Successful health checks record success in the circuit breaker."""
        # Open the circuit first
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        assert circuit_breaker.state == CircuitState.OPEN

        # Force circuit into HALF_OPEN by directly setting internal state.
        # This avoids patching time.monotonic which disrupts the asyncio event loop.
        circuit_breaker._state = CircuitState.HALF_OPEN
        circuit_breaker._success_count = 0
        circuit_breaker._failure_count = 0

        # Mock healthy response
        health_response = MagicMock()
        health_response.status_code = 200
        mock_http_client.get.return_value = health_response

        await gateway_client.start_health_checker()
        await asyncio.sleep(0.15)
        await gateway_client.stop_health_checker()

        # After health check success in HALF_OPEN, success should be recorded
        assert circuit_breaker.success_count >= 1

    @pytest.mark.asyncio
    async def test_health_check_failure_records_in_circuit_breaker(
        self, gateway_client, mock_http_client, circuit_breaker
    ):
        """Failed health checks record failure in the circuit breaker."""
        # Mock unhealthy response
        mock_http_client.get.side_effect = Exception("Connection refused")

        await gateway_client.start_health_checker()
        await asyncio.sleep(0.1)
        await gateway_client.stop_health_checker()

        # A failure should have been recorded
        assert circuit_breaker.failure_count >= 1

    @pytest.mark.asyncio
    async def test_health_checker_does_not_start_twice(
        self, gateway_client, mock_http_client
    ):
        """Starting the health checker twice does not create duplicate tasks."""
        health_response = MagicMock()
        health_response.status_code = 200
        mock_http_client.get.return_value = health_response

        await gateway_client.start_health_checker()
        await gateway_client.start_health_checker()  # Second call should be a no-op

        assert gateway_client.is_health_checker_running is True
        await gateway_client.stop_health_checker()


# --- Test Bedrock Message Conversion ---


class TestBedrockMessageConversion:
    """Test conversion of OpenAI messages to Bedrock Converse format."""

    @pytest.mark.asyncio
    async def test_system_messages_are_skipped(
        self, gateway_client, mock_bedrock_client, circuit_breaker
    ):
        """System messages are not included in Bedrock Converse messages."""
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = LLMRequest(
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
            messages=[
                {"role": "system", "content": "You are helpful"},
                {"role": "user", "content": "Hi"},
            ],
        )
        await gateway_client.call(request)

        call_args = mock_bedrock_client.converse.call_args
        messages = call_args.kwargs["messages"]
        # System message should be filtered out
        assert len(messages) == 1
        assert messages[0]["role"] == "user"

    @pytest.mark.asyncio
    async def test_multipart_content_is_handled(
        self, gateway_client, mock_bedrock_client, circuit_breaker
    ):
        """Multi-part content lists are converted correctly."""
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()
        circuit_breaker.record_failure()

        request = LLMRequest(
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Part 1"},
                        {"type": "text", "text": "Part 2"},
                    ],
                }
            ],
        )
        await gateway_client.call(request)

        call_args = mock_bedrock_client.converse.call_args
        messages = call_args.kwargs["messages"]
        assert len(messages) == 1
        content = messages[0]["content"]
        assert content == [{"text": "Part 1"}, {"text": "Part 2"}]


# --- Test Client Lifecycle ---


class TestClientLifecycle:
    """Test resource cleanup and lifecycle management."""

    @pytest.mark.asyncio
    async def test_close_stops_health_checker(self, gateway_client, mock_http_client):
        """Closing the client stops the health checker."""
        health_response = MagicMock()
        health_response.status_code = 200
        mock_http_client.get.return_value = health_response

        await gateway_client.start_health_checker()
        assert gateway_client.is_health_checker_running is True

        await gateway_client.close()
        assert gateway_client.is_health_checker_running is False
