"""Gateway Client for routing LLM requests through the LiteLLM gateway.

Implements request routing based on circuit breaker state:
- CLOSED/HALF_OPEN: route through gateway with virtual key auth
- OPEN: fall back to direct Bedrock access via boto3 Converse API

Also provides a background health checker that probes the gateway's /health
endpoint at configurable intervals (10s when CLOSED, 30s when OPEN) and
emits CloudWatch metrics on state transitions and fallback activations.

Requirements: 4.1, 4.2, 5.2, 5.3, 5.6
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import boto3
import httpx

from gateway_client.circuit_breaker import CircuitState, GatewayCircuitBreaker

logger = logging.getLogger(__name__)

# CloudWatch metric namespace for gateway operations
CLOUDWATCH_NAMESPACE = "AVA/Gateway"

# Health check intervals in seconds
HEALTH_CHECK_INTERVAL_CLOSED = 10
HEALTH_CHECK_INTERVAL_OPEN = 30


@dataclass
class LLMRequest:
    """Represents an LLM request in OpenAI-compatible format.

    Attributes:
        model: The model identifier (e.g., "claude-sonnet-4").
        messages: List of message dicts with 'role' and 'content'.
        max_tokens: Maximum tokens to generate.
        temperature: Sampling temperature.
        extra_params: Additional parameters to pass through.
    """

    model: str
    messages: List[Dict[str, Any]]
    max_tokens: int = 4096
    temperature: float = 0.7
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Represents the response from an LLM call.

    Attributes:
        content: The generated text content.
        model: The model that generated the response.
        input_tokens: Number of input tokens consumed.
        output_tokens: Number of output tokens generated.
        route: Whether the request went through 'gateway' or 'direct_bedrock'.
        raw_response: The full raw response from the provider.
    """

    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    route: str = "gateway"
    raw_response: Optional[Dict[str, Any]] = None


class GatewayClient:
    """Client that routes LLM requests through the gateway or directly to Bedrock.

    Uses the circuit breaker pattern to ensure the gateway is never a single
    point of failure. When the gateway is healthy (CLOSED or HALF_OPEN state),
    requests are routed through the gateway with the virtual key in the
    Authorization header. When the gateway is down (OPEN state), requests
    fall back to direct Bedrock access via the boto3 Converse API.

    A background health checker probes the gateway's /health endpoint at
    configurable intervals and updates the circuit breaker state accordingly.

    Args:
        gateway_url: The LiteLLM gateway endpoint URL.
        virtual_key: The virtual key for Authorization header.
        circuit_breaker: An existing GatewayCircuitBreaker instance, or None to
            create one with default settings.
        aws_region: AWS region for direct Bedrock calls. Defaults to 'us-east-2'.
        http_client: An optional httpx.AsyncClient for gateway requests.
        bedrock_client: An optional boto3 bedrock-runtime client.
        cloudwatch_client: An optional boto3 CloudWatch client.
        health_check_interval_closed: Seconds between health checks when CLOSED.
        health_check_interval_open: Seconds between health checks when OPEN.
        request_timeout: Timeout in seconds for gateway requests.
    """

    def __init__(
        self,
        gateway_url: str,
        virtual_key: str,
        circuit_breaker: Optional[GatewayCircuitBreaker] = None,
        aws_region: str = "us-east-2",
        http_client: Optional[httpx.AsyncClient] = None,
        bedrock_client: Optional[Any] = None,
        cloudwatch_client: Optional[Any] = None,
        health_check_interval_closed: int = HEALTH_CHECK_INTERVAL_CLOSED,
        health_check_interval_open: int = HEALTH_CHECK_INTERVAL_OPEN,
        request_timeout: float = 60.0,
    ):
        self._gateway_url = gateway_url.rstrip("/")
        self._virtual_key = virtual_key
        self._aws_region = aws_region
        self._request_timeout = request_timeout
        self._health_check_interval_closed = health_check_interval_closed
        self._health_check_interval_open = health_check_interval_open

        # Circuit breaker
        self._circuit_breaker = circuit_breaker or GatewayCircuitBreaker(
            gateway_url=gateway_url
        )

        # HTTP client for gateway requests
        self._http_client = http_client
        self._owns_http_client = http_client is None

        # AWS clients (lazy-initialized if not provided)
        self._bedrock_client = bedrock_client
        self._cloudwatch_client = cloudwatch_client

        # Background health checker state
        self._health_check_task: Optional[asyncio.Task] = None
        self._running = False

        # Track previous state for transition metrics
        self._previous_state: Optional[CircuitState] = None

    @property
    def circuit_breaker(self) -> GatewayCircuitBreaker:
        """The underlying circuit breaker instance."""
        return self._circuit_breaker

    @property
    def gateway_url(self) -> str:
        """The configured gateway URL."""
        return self._gateway_url

    @property
    def is_health_checker_running(self) -> bool:
        """Whether the background health checker is currently active."""
        return self._running

    def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self._request_timeout)
        return self._http_client

    def _get_bedrock_client(self):
        """Get or create the boto3 bedrock-runtime client."""
        if self._bedrock_client is None:
            self._bedrock_client = boto3.client(
                "bedrock-runtime", region_name=self._aws_region
            )
        return self._bedrock_client

    def _get_cloudwatch_client(self):
        """Get or create the boto3 CloudWatch client."""
        if self._cloudwatch_client is None:
            self._cloudwatch_client = boto3.client(
                "cloudwatch", region_name=self._aws_region
            )
        return self._cloudwatch_client

    async def call(self, request: LLMRequest) -> LLMResponse:
        """Route an LLM request based on circuit breaker state.

        When CLOSED or HALF_OPEN: routes through the gateway with the
        virtual key in the Authorization header.

        When OPEN: falls back to direct Bedrock access via boto3 Converse API.

        Args:
            request: The LLM request to route.

        Returns:
            LLMResponse with the generated content and routing metadata.

        Raises:
            Exception: If both gateway and direct Bedrock calls fail.
        """
        current_state = self._circuit_breaker.state

        if self._circuit_breaker.should_allow_request():
            # Route through gateway (CLOSED or HALF_OPEN)
            try:
                response = await self._call_gateway(request)
                self._circuit_breaker.record_success()
                self._check_state_transition(current_state)
                return response
            except Exception as e:
                logger.warning(
                    "Gateway request failed (state=%s): %s", current_state.value, e
                )
                self._circuit_breaker.record_failure()
                new_state = self._circuit_breaker.state
                self._check_state_transition(current_state)

                # If circuit just opened, fall back to direct Bedrock
                if new_state == CircuitState.OPEN:
                    logger.info(
                        "Circuit opened, falling back to direct Bedrock access"
                    )
                    self._emit_fallback_activation()
                    return await self._call_bedrock_direct(request)
                raise
        else:
            # Circuit is OPEN — direct Bedrock fallback
            logger.debug("Circuit OPEN: routing directly to Bedrock")
            self._emit_fallback_activation()
            return await self._call_bedrock_direct(request)

    async def _call_gateway(self, request: LLMRequest) -> LLMResponse:
        """Send request through the LiteLLM gateway.

        Args:
            request: The LLM request in OpenAI-compatible format.

        Returns:
            LLMResponse from the gateway.

        Raises:
            httpx.HTTPStatusError: If the gateway returns a 5xx error.
            httpx.TimeoutException: If the request times out.
        """
        client = self._get_http_client()

        headers = {
            "Authorization": f"Bearer {self._virtual_key}",
            "Content-Type": "application/json",
        }

        # Propagate trace ID if available in the request extra_params
        trace_id = request.extra_params.pop("trace_id", None)
        if trace_id:
            headers["x-ava-trace-id"] = trace_id

        payload = {
            "model": request.model,
            "messages": request.messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            **request.extra_params,
        }

        url = f"{self._gateway_url}/chat/completions"
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()

        data = response.json()

        # Extract content from OpenAI-compatible response format
        content = ""
        if data.get("choices"):
            choice = data["choices"][0]
            message = choice.get("message", {})
            content = message.get("content", "")

        # Extract usage information
        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        return LLMResponse(
            content=content,
            model=data.get("model", request.model),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            route="gateway",
            raw_response=data,
        )

    async def _call_bedrock_direct(self, request: LLMRequest) -> LLMResponse:
        """Call Bedrock directly via boto3 Converse API.

        This is the fallback path when the gateway is unavailable.

        Args:
            request: The LLM request to send to Bedrock.

        Returns:
            LLMResponse from Bedrock.
        """
        client = self._get_bedrock_client()

        # Map the model name to a Bedrock model ID
        model_id = self._resolve_bedrock_model_id(request.model)

        # Convert messages to Bedrock Converse API format
        bedrock_messages = self._to_bedrock_messages(request.messages)

        # Build the converse request
        converse_params: Dict[str, Any] = {
            "modelId": model_id,
            "messages": bedrock_messages,
            "inferenceConfig": {
                "maxTokens": request.max_tokens,
                "temperature": request.temperature,
            },
        }

        # Execute via boto3 (runs in executor to avoid blocking the event loop)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: client.converse(**converse_params)
        )

        # Extract content from Bedrock Converse response
        content = ""
        output = response.get("output", {})
        if output.get("message", {}).get("content"):
            content_blocks = output["message"]["content"]
            content = "".join(
                block.get("text", "") for block in content_blocks if "text" in block
            )

        # Extract usage
        usage = response.get("usage", {})
        input_tokens = usage.get("inputTokens", 0)
        output_tokens = usage.get("outputTokens", 0)

        return LLMResponse(
            content=content,
            model=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            route="direct_bedrock",
            raw_response=response,
        )

    def _resolve_bedrock_model_id(self, model: str) -> str:
        """Resolve a model name to a Bedrock model ID.

        If the model already looks like a Bedrock model ID (contains a dot
        and colon pattern), it's used as-is. Otherwise, common prefixes
        like 'bedrock/' are stripped.

        Args:
            model: The model identifier from the request.

        Returns:
            A Bedrock-compatible model ID.
        """
        # Strip common LiteLLM prefixes
        if model.startswith("bedrock/"):
            return model[len("bedrock/"):]
        if model.startswith("bedrock/mantle/"):
            return model[len("bedrock/mantle/"):]
        return model

    def _to_bedrock_messages(
        self, messages: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Convert OpenAI-format messages to Bedrock Converse format.

        Bedrock Converse API expects messages in the format:
        [{"role": "user", "content": [{"text": "..."}]}]

        System messages are handled separately in Bedrock; here we filter
        them into the messages list with role 'user' for simplicity in the
        fallback path.

        Args:
            messages: OpenAI-format messages.

        Returns:
            Bedrock Converse-compatible messages.
        """
        bedrock_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # Skip system messages (Bedrock handles them differently)
            if role == "system":
                continue

            # Map assistant to assistant, user to user
            bedrock_role = "assistant" if role == "assistant" else "user"

            if isinstance(content, str):
                bedrock_messages.append(
                    {"role": bedrock_role, "content": [{"text": content}]}
                )
            elif isinstance(content, list):
                # Handle multi-part content
                bedrock_content = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        bedrock_content.append({"text": part.get("text", "")})
                    elif isinstance(part, str):
                        bedrock_content.append({"text": part})
                if bedrock_content:
                    bedrock_messages.append(
                        {"role": bedrock_role, "content": bedrock_content}
                    )

        return bedrock_messages

    # --- Background Health Checker ---

    async def start_health_checker(self) -> None:
        """Start the background health checker task.

        The health checker probes the gateway's /health endpoint at intervals
        determined by the circuit breaker state:
        - CLOSED/HALF_OPEN: every health_check_interval_closed seconds (default 10s)
        - OPEN: every health_check_interval_open seconds (default 30s)
        """
        if self._running:
            logger.warning("Health checker already running")
            return

        self._running = True
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        logger.info(
            "Background health checker started for gateway: %s", self._gateway_url
        )

    async def stop_health_checker(self) -> None:
        """Stop the background health checker task."""
        self._running = False
        if self._health_check_task is not None:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
            self._health_check_task = None
        logger.info("Background health checker stopped")

    async def _health_check_loop(self) -> None:
        """Main loop for the background health checker.

        Probes the gateway /health endpoint and updates the circuit breaker
        based on the results. The probe interval varies by circuit state.
        """
        while self._running:
            try:
                current_state = self._circuit_breaker.state

                # Determine interval based on state
                if current_state == CircuitState.OPEN:
                    interval = self._health_check_interval_open
                else:
                    interval = self._health_check_interval_closed

                # Perform health check
                is_healthy = await self._probe_health()

                previous_state = self._circuit_breaker.state
                if is_healthy:
                    self._circuit_breaker.record_success()
                else:
                    self._circuit_breaker.record_failure()

                # Check for state transition and emit metrics
                self._check_state_transition(previous_state)

                await asyncio.sleep(interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Health check loop error: %s", e)
                # Continue running even on unexpected errors
                await asyncio.sleep(self._health_check_interval_closed)

    async def _probe_health(self) -> bool:
        """Probe the gateway's /health endpoint.

        Returns:
            True if the gateway responds with HTTP 200, False otherwise.
        """
        try:
            client = self._get_http_client()
            url = f"{self._gateway_url}/health"
            response = await client.get(url, timeout=5.0)
            return response.status_code == 200
        except Exception as e:
            logger.debug("Health probe failed: %s", e)
            return False

    # --- CloudWatch Metrics ---

    def _check_state_transition(self, previous_state: CircuitState) -> None:
        """Check if a state transition occurred and emit metrics if so.

        Args:
            previous_state: The circuit breaker state before the operation.
        """
        current_state = self._circuit_breaker.state
        if current_state != previous_state:
            logger.info(
                "Circuit breaker state transition: %s → %s",
                previous_state.value,
                current_state.value,
            )
            self._emit_state_transition_metric(previous_state, current_state)

            # Emit recovery event when transitioning back to CLOSED
            if current_state == CircuitState.CLOSED and previous_state in (
                CircuitState.OPEN,
                CircuitState.HALF_OPEN,
            ):
                self._emit_recovery_metric()

    def _emit_state_transition_metric(
        self, from_state: CircuitState, to_state: CircuitState
    ) -> None:
        """Emit a CloudWatch metric for a circuit breaker state transition.

        Args:
            from_state: The previous state.
            to_state: The new state.
        """
        try:
            client = self._get_cloudwatch_client()
            client.put_metric_data(
                Namespace=CLOUDWATCH_NAMESPACE,
                MetricData=[
                    {
                        "MetricName": "CircuitBreakerStateTransition",
                        "Value": 1,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "FromState", "Value": from_state.value},
                            {"Name": "ToState", "Value": to_state.value},
                            {"Name": "GatewayUrl", "Value": self._gateway_url},
                        ],
                    }
                ],
            )
        except Exception as e:
            logger.warning("Failed to emit state transition metric: %s", e)

    def _emit_fallback_activation(self) -> None:
        """Emit a CloudWatch metric for a fallback activation."""
        try:
            client = self._get_cloudwatch_client()
            client.put_metric_data(
                Namespace=CLOUDWATCH_NAMESPACE,
                MetricData=[
                    {
                        "MetricName": "FallbackActivation",
                        "Value": 1,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "GatewayUrl", "Value": self._gateway_url},
                        ],
                    }
                ],
            )
        except Exception as e:
            logger.warning("Failed to emit fallback activation metric: %s", e)

    def _emit_recovery_metric(self) -> None:
        """Emit a CloudWatch metric for a gateway recovery event."""
        try:
            client = self._get_cloudwatch_client()
            client.put_metric_data(
                Namespace=CLOUDWATCH_NAMESPACE,
                MetricData=[
                    {
                        "MetricName": "GatewayRecoveryEvent",
                        "Value": 1,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "GatewayUrl", "Value": self._gateway_url},
                        ],
                    }
                ],
            )
        except Exception as e:
            logger.warning("Failed to emit recovery metric: %s", e)

    # --- Lifecycle ---

    async def close(self) -> None:
        """Clean up resources: stop health checker and close HTTP client."""
        await self.stop_health_checker()
        if self._owns_http_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None
