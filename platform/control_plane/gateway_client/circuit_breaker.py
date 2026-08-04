"""Circuit Breaker for the LiteLLM Gateway.

Implements the circuit breaker pattern to ensure the gateway is never a single
point of failure. When the gateway is healthy (CLOSED state), requests route
through it. When the gateway is down (OPEN state), requests fall back to direct
Bedrock access. After a recovery timeout, the breaker enters HALF_OPEN state
and probes the gateway to determine if it has recovered.

State transitions:
    CLOSED → OPEN:      After `failure_threshold` consecutive failures (default: 3)
    OPEN → HALF_OPEN:   After `recovery_timeout` seconds elapse (default: 30s)
    HALF_OPEN → CLOSED: After `success_threshold` consecutive successes (default: 2)
    HALF_OPEN → OPEN:   On any single failure
"""

import asyncio
import logging
import time
import threading
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class GatewayCircuitBreaker:
    """Client-side circuit breaker for the LiteLLM gateway.

    This circuit breaker sits between agents and the LiteLLM gateway.
    It monitors gateway health and automatically falls back to direct
    Bedrock access when the gateway becomes unavailable.

    Thread-safe: uses a lock to protect state transitions, allowing
    multiple async agents to share a single circuit breaker instance.

    Args:
        gateway_url: The LiteLLM gateway endpoint URL.
        failure_threshold: Number of consecutive failures before opening
            the circuit. Defaults to 3.
        recovery_timeout: Seconds to wait before transitioning from OPEN
            to HALF_OPEN. Defaults to 30.
        success_threshold: Number of consecutive successes in HALF_OPEN
            state before closing the circuit. Defaults to 2.
    """

    def __init__(
        self,
        gateway_url: str,
        failure_threshold: int = 3,
        recovery_timeout: int = 30,
        success_threshold: int = 2,
    ):
        self._gateway_url = gateway_url
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._success_threshold = success_threshold

        # State
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None

        # Thread safety
        self._lock = threading.Lock()

    @property
    def gateway_url(self) -> str:
        """The configured gateway URL."""
        return self._gateway_url

    @property
    def failure_threshold(self) -> int:
        """Number of failures before the circuit opens."""
        return self._failure_threshold

    @property
    def recovery_timeout(self) -> int:
        """Seconds before OPEN transitions to HALF_OPEN."""
        return self._recovery_timeout

    @property
    def success_threshold(self) -> int:
        """Successes needed in HALF_OPEN to close the circuit."""
        return self._success_threshold

    @property
    def state(self) -> CircuitState:
        """Current circuit breaker state.

        Evaluates time-based transitions: if the circuit is OPEN and
        the recovery timeout has elapsed, it transitions to HALF_OPEN.
        """
        with self._lock:
            return self._evaluate_state()

    @property
    def failure_count(self) -> int:
        """Current consecutive failure count."""
        with self._lock:
            return self._failure_count

    @property
    def success_count(self) -> int:
        """Current consecutive success count (relevant in HALF_OPEN)."""
        with self._lock:
            return self._success_count

    def _evaluate_state(self) -> CircuitState:
        """Evaluate and apply time-based state transitions.

        Must be called while holding self._lock.
        """
        if self._state == CircuitState.OPEN and self._last_failure_time is not None:
            elapsed = time.monotonic() - self._last_failure_time
            if elapsed >= self._recovery_timeout:
                self._transition_to_half_open()
        return self._state

    def _transition_to_half_open(self) -> None:
        """Transition from OPEN to HALF_OPEN.

        Must be called while holding self._lock.
        """
        logger.info(
            "Circuit breaker transitioning OPEN → HALF_OPEN "
            "(recovery timeout elapsed)"
        )
        self._state = CircuitState.HALF_OPEN
        self._success_count = 0
        self._failure_count = 0

    def record_success(self) -> None:
        """Record a successful request or health check.

        State transitions:
            - HALF_OPEN: increments success count; closes circuit after
              `success_threshold` consecutive successes.
            - CLOSED: resets failure counter.
            - OPEN: no effect (shouldn't happen in normal flow).
        """
        with self._lock:
            current_state = self._evaluate_state()

            if current_state == CircuitState.HALF_OPEN:
                self._success_count += 1
                logger.debug(
                    "Circuit breaker HALF_OPEN: success %d/%d",
                    self._success_count,
                    self._success_threshold,
                )
                if self._success_count >= self._success_threshold:
                    logger.info(
                        "Circuit breaker transitioning HALF_OPEN → CLOSED "
                        "(reached %d consecutive successes)",
                        self._success_threshold,
                    )
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    self._success_count = 0

            elif current_state == CircuitState.CLOSED:
                # Reset failure count on success in closed state
                self._failure_count = 0

    def record_failure(self) -> None:
        """Record a failed request or health check.

        State transitions:
            - CLOSED: increments failure count; opens circuit after
              `failure_threshold` consecutive failures.
            - HALF_OPEN: immediately transitions back to OPEN.
            - OPEN: no effect (shouldn't happen in normal flow).
        """
        with self._lock:
            current_state = self._evaluate_state()

            if current_state == CircuitState.CLOSED:
                self._failure_count += 1
                logger.debug(
                    "Circuit breaker CLOSED: failure %d/%d",
                    self._failure_count,
                    self._failure_threshold,
                )
                if self._failure_count >= self._failure_threshold:
                    logger.info(
                        "Circuit breaker transitioning CLOSED → OPEN "
                        "(reached %d consecutive failures)",
                        self._failure_threshold,
                    )
                    self._state = CircuitState.OPEN
                    self._last_failure_time = time.monotonic()
                    self._success_count = 0

            elif current_state == CircuitState.HALF_OPEN:
                logger.info(
                    "Circuit breaker transitioning HALF_OPEN → OPEN "
                    "(failure during probe)"
                )
                self._state = CircuitState.OPEN
                self._last_failure_time = time.monotonic()
                self._failure_count = 0
                self._success_count = 0

    def should_allow_request(self) -> bool:
        """Determine if a request should be routed through the gateway.

        Returns:
            True if the circuit is CLOSED or HALF_OPEN (gateway route).
            False if the circuit is OPEN (direct Bedrock fallback).
        """
        current_state = self.state
        return current_state in (CircuitState.CLOSED, CircuitState.HALF_OPEN)

    def reset(self) -> None:
        """Reset the circuit breaker to its initial CLOSED state.

        Useful for testing or manual recovery.
        """
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._last_failure_time = None
            logger.info("Circuit breaker manually reset to CLOSED state")
