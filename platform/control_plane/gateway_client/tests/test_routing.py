"""Unit tests for the environment-based routing decision module.

Validates Requirements 4.1, 4.2, 4.3, 4.6

Tests cover:
- Routing decision based on LITELLM_GATEWAY_URL environment variable
- Gateway routing with virtual key in Authorization header
- Direct Bedrock routing when gateway URL is not set
- Framework-agnostic behavior (no framework-specific code)
- Circuit breaker integration for gateway fallback
"""

import json
import os
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from gateway_client.circuit_breaker import (
    CircuitState,
    GatewayCircuitBreaker,
)
from gateway_client.routing import (
    ENV_GATEWAY_URL,
    ENV_VIRTUAL_KEY,
    DirectBedrockClient,
    GatewayClient,
    LLMClient,
    LLMMessage,
    LLMResponse,
    LLMRoutingError,
    RoutingConfig,
    create_model_client,
    get_routing_config,
)


class TestGetRoutingConfig:
    """Test environment variable reading for routing decisions."""

    def test_gateway_url_set_and_nonempty(self, monkeypatch):
        """When LITELLM_GATEWAY_URL is set, use_gateway is True."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "sk-test-key")

        config = get_routing_config()

        assert config.use_gateway is True
        assert config.gateway_url == "http://gateway:4000"
        assert config.virtual_key == "sk-test-key"

    def test_gateway_url_unset(self, monkeypatch):
        """When LITELLM_GATEWAY_URL is not set, use_gateway is False."""
        monkeypatch.delenv(ENV_GATEWAY_URL, raising=False)
        monkeypatch.delenv(ENV_VIRTUAL_KEY, raising=False)

        config = get_routing_config()

        assert config.use_gateway is False
        assert config.gateway_url is None
        assert config.virtual_key is None

    def test_gateway_url_empty_string(self, monkeypatch):
        """When LITELLM_GATEWAY_URL is empty, use_gateway is False."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "")

        config = get_routing_config()

        assert config.use_gateway is False
        assert config.gateway_url is None

    def test_gateway_url_whitespace_only(self, monkeypatch):
        """When LITELLM_GATEWAY_URL is only whitespace, use_gateway is False."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "   ")

        config = get_routing_config()

        assert config.use_gateway is False
        assert config.gateway_url is None

    def test_gateway_url_set_but_no_virtual_key(self, monkeypatch):
        """When gateway URL is set but virtual key is not, still use gateway."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.delenv(ENV_VIRTUAL_KEY, raising=False)

        config = get_routing_config()

        assert config.use_gateway is True
        assert config.gateway_url == "http://gateway:4000"
        assert config.virtual_key is None

    def test_gateway_url_with_trailing_whitespace(self, monkeypatch):
        """Whitespace is stripped from environment variable values."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "  http://gateway:4000  ")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "  sk-test-key  ")

        config = get_routing_config()

        assert config.gateway_url == "http://gateway:4000"
        assert config.virtual_key == "sk-test-key"


class TestCreateModelClient:
    """Test the factory function for creating LLM clients."""

    def test_returns_gateway_client_when_url_set(self, monkeypatch):
        """Factory returns GatewayClient when LITELLM_GATEWAY_URL is set."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "sk-test-key")

        client = create_model_client()

        assert isinstance(client, GatewayClient)
        assert client.routing_mode == "gateway"

    def test_returns_direct_client_when_url_not_set(self, monkeypatch):
        """Factory returns DirectBedrockClient when no gateway URL."""
        monkeypatch.delenv(ENV_GATEWAY_URL, raising=False)
        monkeypatch.delenv(ENV_VIRTUAL_KEY, raising=False)

        client = create_model_client()

        assert isinstance(client, DirectBedrockClient)
        assert client.routing_mode == "direct"

    def test_returns_direct_client_when_url_empty(self, monkeypatch):
        """Factory returns DirectBedrockClient when gateway URL is empty."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "")

        client = create_model_client()

        assert isinstance(client, DirectBedrockClient)

    def test_accepts_custom_circuit_breaker(self, monkeypatch):
        """Factory passes custom circuit breaker to GatewayClient."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "sk-test-key")

        custom_cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=5,
        )
        client = create_model_client(circuit_breaker=custom_cb)

        assert isinstance(client, GatewayClient)
        assert client.circuit_breaker is custom_cb

    def test_accepts_custom_timeout(self, monkeypatch):
        """Factory passes custom timeout to GatewayClient."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "sk-test-key")

        client = create_model_client(timeout=120)

        assert isinstance(client, GatewayClient)
        assert client._timeout == 120

    def test_both_clients_implement_llm_client_interface(self, monkeypatch):
        """Both client types implement the LLMClient abstract interface."""
        monkeypatch.setenv(ENV_GATEWAY_URL, "http://gateway:4000")
        monkeypatch.setenv(ENV_VIRTUAL_KEY, "sk-test-key")
        gateway_client = create_model_client()

        monkeypatch.delenv(ENV_GATEWAY_URL)
        direct_client = create_model_client()

        assert isinstance(gateway_client, LLMClient)
        assert isinstance(direct_client, LLMClient)


class TestGatewayClient:
    """Test the GatewayClient routing behavior."""

    def _make_client(self, url="http://gateway:4000", key="sk-test"):
        return GatewayClient(gateway_url=url, virtual_key=key)

    def test_gateway_url_stored_correctly(self):
        """Gateway URL is stored without trailing slash."""
        client = self._make_client(url="http://gateway:4000/")
        assert client.gateway_url == "http://gateway:4000"

    def test_virtual_key_stored(self):
        """Virtual key is accessible."""
        client = self._make_client(key="sk-my-key")
        assert client.virtual_key == "sk-my-key"

    def test_routing_mode_gateway_when_circuit_closed(self):
        """Routing mode is 'gateway' when circuit breaker is closed."""
        client = self._make_client()
        assert client.routing_mode == "gateway"

    def test_routing_mode_direct_when_circuit_open(self):
        """Routing mode is 'direct' when circuit breaker is open."""
        client = self._make_client()
        # Force circuit open
        for _ in range(3):
            client.circuit_breaker.record_failure()
        assert client.routing_mode == "direct"

    @patch("gateway_client.routing.requests.post")
    def test_sends_virtual_key_in_authorization_header(self, mock_post):
        """Gateway requests include virtual key in Authorization header."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hello"}, "finish_reason": "stop"}],
            "model": "test-model",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        mock_post.return_value = mock_response

        client = self._make_client(key="sk-test-virtual-key")
        messages = [LLMMessage(role="user", content="Hi")]
        client.invoke(messages, model="test-model")

        # Verify Authorization header
        call_kwargs = mock_post.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers")
        assert headers["Authorization"] == "Bearer sk-test-virtual-key"

    @patch("gateway_client.routing.requests.post")
    def test_sends_request_to_chat_completions_endpoint(self, mock_post):
        """Gateway requests go to /chat/completions endpoint."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hi"}, "finish_reason": "stop"}],
            "model": "m",
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        }
        mock_post.return_value = mock_response

        client = self._make_client(url="http://gateway:4000")
        client.invoke([LLMMessage(role="user", content="test")], model="m")

        url_arg = mock_post.call_args[0][0] if mock_post.call_args[0] else mock_post.call_args.kwargs.get("url")
        if not url_arg:
            url_arg = mock_post.call_args[0][0]
        assert url_arg == "http://gateway:4000/chat/completions"

    @patch("gateway_client.routing.requests.post")
    def test_passes_model_and_messages_in_payload(self, mock_post):
        """Gateway requests include model and messages in the JSON body."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "response"}, "finish_reason": "stop"}],
            "model": "claude",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        mock_post.return_value = mock_response

        client = self._make_client()
        messages = [
            LLMMessage(role="system", content="You are helpful"),
            LLMMessage(role="user", content="Hello"),
        ]
        client.invoke(messages, model="bedrock/claude-sonnet-4")

        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["model"] == "bedrock/claude-sonnet-4"
        assert len(payload["messages"]) == 2
        assert payload["messages"][0] == {"role": "system", "content": "You are helpful"}
        assert payload["messages"][1] == {"role": "user", "content": "Hello"}

    @patch("gateway_client.routing.requests.post")
    def test_passes_optional_parameters(self, mock_post):
        """Optional parameters are included in the gateway payload."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "resp"}, "finish_reason": "stop"}],
            "model": "m",
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        }
        mock_post.return_value = mock_response

        client = self._make_client()
        client.invoke(
            [LLMMessage(role="user", content="test")],
            model="m",
            temperature=0.7,
            max_tokens=100,
            top_p=0.9,
            stop=["END"],
        )

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        assert payload["temperature"] == 0.7
        assert payload["max_tokens"] == 100
        assert payload["top_p"] == 0.9
        assert payload["stop"] == ["END"]

    @patch("gateway_client.routing.requests.post")
    def test_parses_gateway_response_correctly(self, mock_post):
        """Gateway response is parsed into LLMResponse."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"content": "Hello there!"}, "finish_reason": "stop"}
            ],
            "model": "bedrock/claude-sonnet-4",
            "usage": {"prompt_tokens": 15, "completion_tokens": 8},
        }
        mock_post.return_value = mock_response

        client = self._make_client()
        response = client.invoke(
            [LLMMessage(role="user", content="Hi")], model="bedrock/claude-sonnet-4"
        )

        assert response.content == "Hello there!"
        assert response.model == "bedrock/claude-sonnet-4"
        assert response.input_tokens == 15
        assert response.output_tokens == 8
        assert response.stop_reason == "stop"

    @patch("gateway_client.routing.requests.post")
    def test_raises_routing_error_on_non_200(self, mock_post):
        """Non-200 responses raise LLMRoutingError with status code."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Rate limit exceeded"
        mock_post.return_value = mock_response

        client = self._make_client()
        with pytest.raises(LLMRoutingError) as exc_info:
            client.invoke(
                [LLMMessage(role="user", content="test")], model="m"
            )

        assert exc_info.value.status_code == 429
        assert "429" in str(exc_info.value)

    @patch("gateway_client.routing._invoke_bedrock_converse")
    @patch("gateway_client.routing.requests.post")
    def test_falls_back_to_bedrock_on_gateway_5xx(self, mock_post, mock_bedrock):
        """On gateway 5xx, circuit breaker opens and falls back to Bedrock."""
        # Configure gateway to return 503 three times (hit threshold)
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.text = "Service Unavailable"
        mock_post.return_value = mock_response

        mock_bedrock.return_value = LLMResponse(
            content="Direct response",
            model="claude-sonnet-4",
            input_tokens=10,
            output_tokens=5,
        )

        client = GatewayClient(
            gateway_url="http://gateway:4000",
            virtual_key="sk-test",
            circuit_breaker=GatewayCircuitBreaker(
                gateway_url="http://gateway:4000",
                failure_threshold=3,
            ),
        )

        messages = [LLMMessage(role="user", content="test")]

        # First two 503s raise errors (circuit not yet open)
        with pytest.raises(LLMRoutingError):
            client.invoke(messages, model="claude")
        with pytest.raises(LLMRoutingError):
            client.invoke(messages, model="claude")

        # Third 503 opens circuit and falls back to Bedrock
        response = client.invoke(messages, model="claude")
        assert response.content == "Direct response"
        assert client.circuit_breaker.state == CircuitState.OPEN

    @patch("gateway_client.routing._invoke_bedrock_converse")
    @patch("gateway_client.routing.requests.post")
    def test_routes_directly_when_circuit_open(self, mock_post, mock_bedrock):
        """When circuit is already open, routes directly to Bedrock."""
        mock_bedrock.return_value = LLMResponse(
            content="Direct",
            model="claude",
            input_tokens=5,
            output_tokens=3,
        )

        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
        )
        cb.record_failure()  # Open the circuit

        client = GatewayClient(
            gateway_url="http://gateway:4000",
            virtual_key="sk-test",
            circuit_breaker=cb,
        )

        response = client.invoke(
            [LLMMessage(role="user", content="test")], model="claude"
        )

        assert response.content == "Direct"
        mock_post.assert_not_called()  # Gateway was never called
        mock_bedrock.assert_called_once()

    @patch("gateway_client.routing.requests.post")
    def test_records_success_on_200(self, mock_post):
        """Successful gateway response records success on circuit breaker."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
            "model": "m",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        mock_post.return_value = mock_response

        cb = GatewayCircuitBreaker(gateway_url="http://gw:4000")
        client = GatewayClient(
            gateway_url="http://gw:4000",
            virtual_key="sk-test",
            circuit_breaker=cb,
        )

        client.invoke([LLMMessage(role="user", content="hi")], model="m")

        # Success resets failure count
        assert cb.failure_count == 0


class TestDirectBedrockClient:
    """Test the DirectBedrockClient routing behavior."""

    def test_routing_mode_is_direct(self):
        """DirectBedrockClient always reports 'direct' mode."""
        client = DirectBedrockClient()
        assert client.routing_mode == "direct"

    def test_uses_env_region(self, monkeypatch):
        """Picks up AWS_REGION from environment."""
        monkeypatch.setenv("AWS_REGION", "us-west-2")
        client = DirectBedrockClient()
        assert client.region == "us-west-2"

    def test_uses_default_region(self, monkeypatch):
        """Falls back to us-east-2 when AWS_REGION is not set."""
        monkeypatch.delenv("AWS_REGION", raising=False)
        client = DirectBedrockClient()
        assert client.region == "us-east-2"

    def test_uses_custom_region(self):
        """Accepts explicit region parameter."""
        client = DirectBedrockClient(region="eu-west-1")
        assert client.region == "eu-west-1"

    @patch("gateway_client.routing.boto3.client")
    def test_invoke_calls_bedrock_converse(self, mock_boto_client):
        """DirectBedrockClient calls Bedrock Converse API."""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock
        mock_bedrock.converse.return_value = {
            "output": {
                "message": {"content": [{"text": "Hello from Bedrock!"}]}
            },
            "usage": {"inputTokens": 10, "outputTokens": 5},
            "stopReason": "end_turn",
        }

        client = DirectBedrockClient(region="us-east-2")
        response = client.invoke(
            [LLMMessage(role="user", content="Hi")],
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        )

        assert response.content == "Hello from Bedrock!"
        assert response.input_tokens == 10
        assert response.output_tokens == 5
        assert response.stop_reason == "end_turn"
        mock_boto_client.assert_called_with("bedrock-runtime", region_name="us-east-2")

    @patch("gateway_client.routing.boto3.client")
    def test_strips_bedrock_prefix_from_model_id(self, mock_boto_client):
        """Model ID prefixes like 'bedrock/' are stripped for Converse API."""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{"text": "ok"}]}},
            "usage": {"inputTokens": 5, "outputTokens": 2},
            "stopReason": "end_turn",
        }

        client = DirectBedrockClient()
        client.invoke(
            [LLMMessage(role="user", content="test")],
            model="bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0",
        )

        call_kwargs = mock_bedrock.converse.call_args.kwargs
        assert call_kwargs["modelId"] == "us.anthropic.claude-sonnet-4-20250514-v1:0"

    @patch("gateway_client.routing.boto3.client")
    def test_strips_bedrock_mantle_prefix(self, mock_boto_client):
        """Model ID prefix 'bedrock/mantle/' is stripped for Converse API."""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{"text": "ok"}]}},
            "usage": {"inputTokens": 5, "outputTokens": 2},
            "stopReason": "end_turn",
        }

        client = DirectBedrockClient()
        client.invoke(
            [LLMMessage(role="user", content="test")],
            model="bedrock/mantle/gpt-5.5",
        )

        call_kwargs = mock_bedrock.converse.call_args.kwargs
        assert call_kwargs["modelId"] == "gpt-5.5"

    @patch("gateway_client.routing.boto3.client")
    def test_separates_system_messages(self, mock_boto_client):
        """System messages are passed separately to Converse API."""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{"text": "ok"}]}},
            "usage": {"inputTokens": 10, "outputTokens": 2},
            "stopReason": "end_turn",
        }

        client = DirectBedrockClient()
        client.invoke(
            [
                LLMMessage(role="system", content="You are a helpful assistant"),
                LLMMessage(role="user", content="Hello"),
            ],
            model="claude-sonnet-4",
        )

        call_kwargs = mock_bedrock.converse.call_args.kwargs
        assert call_kwargs["system"] == [{"text": "You are a helpful assistant"}]
        assert call_kwargs["messages"] == [
            {"role": "user", "content": [{"text": "Hello"}]}
        ]

    @patch("gateway_client.routing.boto3.client")
    def test_passes_inference_config(self, mock_boto_client):
        """Optional parameters are passed as inferenceConfig."""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{"text": "ok"}]}},
            "usage": {"inputTokens": 5, "outputTokens": 2},
            "stopReason": "end_turn",
        }

        client = DirectBedrockClient()
        client.invoke(
            [LLMMessage(role="user", content="test")],
            model="claude-sonnet-4",
            temperature=0.5,
            max_tokens=200,
            top_p=0.8,
            stop=["STOP"],
        )

        call_kwargs = mock_bedrock.converse.call_args.kwargs
        assert call_kwargs["inferenceConfig"] == {
            "temperature": 0.5,
            "maxTokens": 200,
            "topP": 0.8,
            "stopSequences": ["STOP"],
        }


class TestFrameworkAgnostic:
    """Test that the routing layer is framework-agnostic."""

    def test_no_framework_imports(self):
        """The routing module does not import any agent framework."""
        import gateway_client.routing as routing_module

        # Verify no framework-specific modules are imported
        module_source = open(routing_module.__file__).read()
        # Check actual import statements, not docstring mentions
        lines = module_source.split("\n")
        import_lines = [
            line.strip()
            for line in lines
            if line.strip().startswith("import ") or line.strip().startswith("from ")
        ]
        import_text = "\n".join(import_lines)
        assert "langchain" not in import_text
        assert "langgraph" not in import_text
        assert "strands" not in import_text

    def test_llm_message_is_plain_dataclass(self):
        """LLMMessage uses only standard Python types."""
        msg = LLMMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"

    def test_llm_response_is_plain_dataclass(self):
        """LLMResponse uses only standard Python types."""
        resp = LLMResponse(
            content="Hi",
            model="claude",
            input_tokens=10,
            output_tokens=5,
            stop_reason="stop",
        )
        assert resp.content == "Hi"
        assert resp.model == "claude"
        assert resp.input_tokens == 10
        assert resp.output_tokens == 5


class TestLLMRoutingError:
    """Test the routing error class."""

    def test_error_message(self):
        err = LLMRoutingError("Gateway failed", status_code=503)
        assert str(err) == "Gateway failed"
        assert err.status_code == 503

    def test_error_without_status_code(self):
        err = LLMRoutingError("Connection timeout")
        assert str(err) == "Connection timeout"
        assert err.status_code is None
