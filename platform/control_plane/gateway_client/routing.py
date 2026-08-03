"""Environment-based routing decision layer for LLM requests.

Reads LITELLM_GATEWAY_URL and LITELLM_VIRTUAL_KEY from the environment to
determine whether to route LLM requests through the LiteLLM gateway or
directly to Amazon Bedrock via boto3.

Routing logic:
    - If LITELLM_GATEWAY_URL is set and non-empty: route through the gateway
      with the virtual key in the Authorization header. A circuit breaker
      protects against gateway failures by falling back to direct Bedrock.
    - If LITELLM_GATEWAY_URL is unset or empty: route directly to Bedrock
      via boto3 (existing behavior, no gateway interaction).

If LITELLM_VIRTUAL_KEY is not set directly, the module also supports
resolving the key from Secrets Manager via LITELLM_VIRTUAL_KEY_SECRET
(the secret name injected by deployment hooks).

This module is framework-agnostic — it works with both Strands Agents SDK
and LangGraph/LangChain without any framework-specific code.

Validates: Requirements 4.1, 4.2, 4.3, 4.6
"""

import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import boto3
import requests

from gateway_client.circuit_breaker import (
    CircuitState,
    GatewayCircuitBreaker,
)

logger = logging.getLogger(__name__)

# Environment variable names
ENV_GATEWAY_URL = "LITELLM_GATEWAY_URL"
ENV_VIRTUAL_KEY = "LITELLM_VIRTUAL_KEY"
ENV_VIRTUAL_KEY_SECRET = "LITELLM_VIRTUAL_KEY_SECRET"
ENV_AWS_REGION = "AWS_REGION"
DEFAULT_REGION = "us-east-2"

# Module-level cache for resolved virtual key
_cached_virtual_key: Optional[str] = None


@dataclass
class LLMMessage:
    """A single message in a conversation."""

    role: str  # "system", "user", "assistant"
    content: str


@dataclass
class LLMRequest:
    """Framework-agnostic LLM request."""

    messages: List[LLMMessage]
    model: str
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    stop: Optional[List[str]] = None
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Framework-agnostic LLM response."""

    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    stop_reason: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


class LLMClient(ABC):
    """Abstract interface for making LLM calls.

    Implementations route through the gateway or directly to Bedrock
    depending on environment configuration.
    """

    @abstractmethod
    def invoke(
        self,
        messages: List[LLMMessage],
        model: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Send a request to an LLM and return the response.

        Args:
            messages: Conversation messages.
            model: Model identifier (e.g., "us.anthropic.claude-sonnet-4-20250514-v1:0").
            **kwargs: Additional parameters (temperature, max_tokens, etc.).

        Returns:
            LLMResponse with the model's reply.

        Raises:
            LLMRoutingError: If the request cannot be completed.
        """
        ...

    @property
    @abstractmethod
    def routing_mode(self) -> str:
        """Return the current routing mode: 'gateway' or 'direct'."""
        ...


class LLMRoutingError(Exception):
    """Raised when an LLM request cannot be routed successfully."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class GatewayClient(LLMClient):
    """Routes LLM requests through the LiteLLM gateway.

    Uses the circuit breaker to fall back to direct Bedrock access
    when the gateway is unavailable.

    Args:
        gateway_url: The LiteLLM gateway endpoint URL.
        virtual_key: The virtual key for Authorization header.
        circuit_breaker: Optional pre-configured circuit breaker instance.
        timeout: Request timeout in seconds (default: 60).
    """

    def __init__(
        self,
        gateway_url: str,
        virtual_key: str,
        circuit_breaker: Optional[GatewayCircuitBreaker] = None,
        timeout: int = 60,
    ):
        self._gateway_url = gateway_url.rstrip("/")
        self._virtual_key = virtual_key
        self._timeout = timeout
        self._circuit_breaker = circuit_breaker or GatewayCircuitBreaker(
            gateway_url=self._gateway_url
        )

    @property
    def gateway_url(self) -> str:
        """The configured gateway URL."""
        return self._gateway_url

    @property
    def virtual_key(self) -> str:
        """The virtual key used for authorization."""
        return self._virtual_key

    @property
    def circuit_breaker(self) -> GatewayCircuitBreaker:
        """The circuit breaker instance."""
        return self._circuit_breaker

    @property
    def routing_mode(self) -> str:
        """Return 'gateway' when circuit is closed/half-open, 'direct' when open."""
        if self._circuit_breaker.should_allow_request():
            return "gateway"
        return "direct"

    def invoke(
        self,
        messages: List[LLMMessage],
        model: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Route request through gateway or fall back to direct Bedrock.

        When the circuit breaker is closed or half-open, requests go through
        the gateway. When open, requests go directly to Bedrock via boto3.
        """
        if self._circuit_breaker.should_allow_request():
            try:
                response = self._call_gateway(messages, model, **kwargs)
                self._circuit_breaker.record_success()
                return response
            except LLMRoutingError as e:
                # Only open circuit on gateway infrastructure failures (5xx)
                if e.status_code and e.status_code >= 500:
                    self._circuit_breaker.record_failure()
                    logger.warning(
                        "Gateway request failed (HTTP %d), "
                        "circuit breaker failure count: %d/%d",
                        e.status_code,
                        self._circuit_breaker.failure_count,
                        self._circuit_breaker.failure_threshold,
                    )
                    # If circuit just opened, fall back to direct
                    if not self._circuit_breaker.should_allow_request():
                        logger.info(
                            "Circuit breaker opened, falling back to direct Bedrock"
                        )
                        return self._call_bedrock_direct(messages, model, **kwargs)
                raise
            except (requests.ConnectionError, requests.Timeout) as e:
                self._circuit_breaker.record_failure()
                logger.warning(
                    "Gateway connection error: %s, "
                    "circuit breaker failure count: %d/%d",
                    str(e),
                    self._circuit_breaker.failure_count,
                    self._circuit_breaker.failure_threshold,
                )
                # If circuit just opened, fall back to direct
                if not self._circuit_breaker.should_allow_request():
                    logger.info(
                        "Circuit breaker opened, falling back to direct Bedrock"
                    )
                    return self._call_bedrock_direct(messages, model, **kwargs)
                raise LLMRoutingError(
                    f"Gateway connection failed: {e}"
                ) from e
        else:
            # Circuit is open — route directly to Bedrock
            logger.debug("Circuit breaker is OPEN, routing directly to Bedrock")
            return self._call_bedrock_direct(messages, model, **kwargs)

    def _call_gateway(
        self,
        messages: List[LLMMessage],
        model: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Send request to the LiteLLM gateway in OpenAI-compatible format."""
        url = f"{self._gateway_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._virtual_key}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }

        # Add optional parameters
        if kwargs.get("temperature") is not None:
            payload["temperature"] = kwargs["temperature"]
        if kwargs.get("max_tokens") is not None:
            payload["max_tokens"] = kwargs["max_tokens"]
        if kwargs.get("top_p") is not None:
            payload["top_p"] = kwargs["top_p"]
        if kwargs.get("stop") is not None:
            payload["stop"] = kwargs["stop"]

        # Pass through any extra parameters
        for key, value in kwargs.items():
            if key not in ("temperature", "max_tokens", "top_p", "stop"):
                payload[key] = value

        response = requests.post(
            url, headers=headers, json=payload, timeout=self._timeout
        )

        if response.status_code != 200:
            raise LLMRoutingError(
                f"Gateway returned HTTP {response.status_code}: {response.text}",
                status_code=response.status_code,
            )

        data = response.json()
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        usage = data.get("usage", {})

        return LLMResponse(
            content=message.get("content", ""),
            model=data.get("model", model),
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            stop_reason=choice.get("finish_reason"),
            raw_response=data,
        )

    def _call_bedrock_direct(
        self,
        messages: List[LLMMessage],
        model: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Fall back to direct Bedrock access via boto3 Converse API."""
        return _invoke_bedrock_converse(messages, model, **kwargs)


class DirectBedrockClient(LLMClient):
    """Routes LLM requests directly to Amazon Bedrock via boto3.

    Used when LITELLM_GATEWAY_URL is not set. This preserves the
    existing behavior where agents call Bedrock directly.

    Args:
        region: AWS region for Bedrock (defaults to AWS_REGION env or us-east-2).
    """

    def __init__(self, region: Optional[str] = None):
        self._region = region or os.environ.get(ENV_AWS_REGION, DEFAULT_REGION)

    @property
    def region(self) -> str:
        """The AWS region used for Bedrock calls."""
        return self._region

    @property
    def routing_mode(self) -> str:
        """Always 'direct' — no gateway involved."""
        return "direct"

    def invoke(
        self,
        messages: List[LLMMessage],
        model: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Send request directly to Bedrock via boto3 Converse API."""
        return _invoke_bedrock_converse(messages, model, region=self._region, **kwargs)


def _invoke_bedrock_converse(
    messages: List[LLMMessage],
    model: str,
    region: Optional[str] = None,
    **kwargs: Any,
) -> LLMResponse:
    """Call Bedrock Converse API directly via boto3.

    Converts framework-agnostic messages into Bedrock's Converse format
    and returns a framework-agnostic response.
    """
    region = region or os.environ.get(ENV_AWS_REGION, DEFAULT_REGION)
    client = boto3.client("bedrock-runtime", region_name=region)

    # Strip litellm prefixes from model ID if present.
    # Check longer prefix first to avoid partial match.
    model_id = model
    for prefix in ("bedrock/mantle/", "bedrock/"):
        if model_id.startswith(prefix):
            model_id = model_id[len(prefix):]
            break

    # Build Converse API request
    converse_messages = []
    system_prompts = []

    for msg in messages:
        if msg.role == "system":
            system_prompts.append({"text": msg.content})
        else:
            converse_messages.append(
                {"role": msg.role, "content": [{"text": msg.content}]}
            )

    converse_kwargs: Dict[str, Any] = {
        "modelId": model_id,
        "messages": converse_messages,
    }

    if system_prompts:
        converse_kwargs["system"] = system_prompts

    # Build inference config
    inference_config: Dict[str, Any] = {}
    if kwargs.get("temperature") is not None:
        inference_config["temperature"] = kwargs["temperature"]
    if kwargs.get("max_tokens") is not None:
        inference_config["maxTokens"] = kwargs["max_tokens"]
    if kwargs.get("top_p") is not None:
        inference_config["topP"] = kwargs["top_p"]
    if kwargs.get("stop") is not None:
        inference_config["stopSequences"] = kwargs["stop"]

    if inference_config:
        converse_kwargs["inferenceConfig"] = inference_config

    try:
        response = client.converse(**converse_kwargs)
    except client.exceptions.ClientError as e:
        raise LLMRoutingError(
            f"Bedrock Converse API error: {e}",
            status_code=getattr(e.response, "status_code", None)
            if hasattr(e, "response")
            else None,
        ) from e

    # Parse Converse API response
    output = response.get("output", {})
    message = output.get("message", {})
    content_blocks = message.get("content", [])
    content = ""
    for block in content_blocks:
        if "text" in block:
            content += block["text"]

    usage = response.get("usage", {})
    stop_reason = response.get("stopReason")

    return LLMResponse(
        content=content,
        model=model_id,
        input_tokens=usage.get("inputTokens", 0),
        output_tokens=usage.get("outputTokens", 0),
        stop_reason=stop_reason,
        raw_response=response,
    )


@dataclass
class RoutingConfig:
    """Configuration resolved from environment variables.

    Attributes:
        gateway_url: The gateway URL (None if not configured).
        virtual_key: The virtual key for gateway auth (None if not configured).
        use_gateway: Whether to route through the gateway.
    """

    gateway_url: Optional[str]
    virtual_key: Optional[str]
    use_gateway: bool


def _resolve_virtual_key() -> Optional[str]:
    """Resolve the virtual key from environment or Secrets Manager.

    Resolution order:
    1. LITELLM_VIRTUAL_KEY env var (raw key value) — used directly
    2. LITELLM_VIRTUAL_KEY_SECRET env var (Secrets Manager secret name) —
       resolved via boto3 and cached in memory for the process lifetime

    Returns:
        The resolved virtual key string, or None if neither is set.
    """
    global _cached_virtual_key

    # Check direct key first
    direct_key = os.environ.get(ENV_VIRTUAL_KEY, "").strip()
    if direct_key:
        return direct_key

    # Return cached key if already resolved
    if _cached_virtual_key is not None:
        return _cached_virtual_key

    # Try resolving from Secrets Manager
    secret_name = os.environ.get(ENV_VIRTUAL_KEY_SECRET, "").strip()
    if not secret_name:
        return None

    try:
        region = os.environ.get(ENV_AWS_REGION, DEFAULT_REGION)
        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_name)
        secret_value = response["SecretString"]

        # The secret may be a plain string (the key) or JSON with a "key" field
        try:
            parsed = json.loads(secret_value)
            if isinstance(parsed, dict):
                _cached_virtual_key = parsed.get("litellm_virtual_key", parsed.get("key", parsed.get("token", secret_value)))
            else:
                _cached_virtual_key = secret_value
        except (json.JSONDecodeError, TypeError):
            _cached_virtual_key = secret_value

        logger.info(
            "Resolved virtual key from Secrets Manager secret '%s'",
            secret_name,
        )
        return _cached_virtual_key

    except Exception as e:
        logger.error(
            "Failed to resolve virtual key from Secrets Manager secret '%s': %s",
            secret_name,
            str(e),
        )
        return None


def get_routing_config() -> RoutingConfig:
    """Read routing configuration from environment variables.

    Returns:
        RoutingConfig indicating whether to use gateway or direct routing.
    """
    gateway_url = os.environ.get(ENV_GATEWAY_URL, "").strip()
    virtual_key = _resolve_virtual_key()

    use_gateway = bool(gateway_url)

    if use_gateway and not virtual_key:
        logger.warning(
            "%s is set but no virtual key available (checked %s and %s) "
            "— gateway requests will lack authorization",
            ENV_GATEWAY_URL,
            ENV_VIRTUAL_KEY,
            ENV_VIRTUAL_KEY_SECRET,
        )

    return RoutingConfig(
        gateway_url=gateway_url or None,
        virtual_key=virtual_key,
        use_gateway=use_gateway,
    )


def create_model_client(
    circuit_breaker: Optional[GatewayCircuitBreaker] = None,
    timeout: int = 60,
) -> LLMClient:
    """Factory function to create a configured LLM client.

    Reads environment variables to decide the routing path:
    - LITELLM_GATEWAY_URL set and non-empty → GatewayClient
    - LITELLM_GATEWAY_URL unset or empty → DirectBedrockClient

    This is the primary entry point for agents to get an LLM client.
    Framework-agnostic — works with Strands Agents SDK, LangGraph,
    LangChain, or any Python code.

    Args:
        circuit_breaker: Optional pre-configured circuit breaker. If None,
            a default one is created when gateway routing is active.
        timeout: Request timeout in seconds for gateway calls (default: 60).

    Returns:
        An LLMClient instance configured for the current environment.

    Example:
        >>> client = create_model_client()
        >>> response = client.invoke(
        ...     messages=[LLMMessage(role="user", content="Hello")],
        ...     model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        ... )
        >>> print(response.content)
    """
    config = get_routing_config()

    if config.use_gateway:
        logger.info(
            "Routing through LiteLLM gateway at %s", config.gateway_url
        )
        return GatewayClient(
            gateway_url=config.gateway_url,  # type: ignore[arg-type]
            virtual_key=config.virtual_key or "",
            circuit_breaker=circuit_breaker,
            timeout=timeout,
        )
    else:
        logger.info("Routing directly to Bedrock (no gateway configured)")
        return DirectBedrockClient()
