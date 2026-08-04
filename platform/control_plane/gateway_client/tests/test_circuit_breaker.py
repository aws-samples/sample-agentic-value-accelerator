"""Unit tests for the Gateway Circuit Breaker module.

Validates Requirements 5.1, 5.2, 5.3, 5.4
"""

import time
import threading
from unittest.mock import patch

import pytest

from gateway_client.circuit_breaker import (
    CircuitState,
    GatewayCircuitBreaker,
)


class TestCircuitBreakerInitialization:
    """Test initial state and configuration."""

    def test_initial_state_is_closed(self):
        """The circuit breaker starts in CLOSED state."""
        cb = GatewayCircuitBreaker(gateway_url="http://gateway:4000")
        assert cb.state == CircuitState.CLOSED

    def test_default_failure_threshold(self):
        cb = GatewayCircuitBreaker(gateway_url="http://gateway:4000")
        assert cb.failure_threshold == 3

    def test_default_recovery_timeout(self):
        cb = GatewayCircuitBreaker(gateway_url="http://gateway:4000")
        assert cb.recovery_timeout == 30

    def test_default_success_threshold(self):
        cb = GatewayCircuitBreaker(gateway_url="http://gateway:4000")
        assert cb.success_threshold == 2

    def test_custom_configuration(self):
        cb = GatewayCircuitBreaker(
            gateway_url="http://custom:4000",
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=3,
        )
        assert cb.gateway_url == "http://custom:4000"
        assert cb.failure_threshold == 5
        assert cb.recovery_timeout == 60
        assert cb.success_threshold == 3


class TestClosedToOpenTransition:
    """Test CLOSED → OPEN transition after failure_threshold failures."""

    def test_stays_closed_below_threshold(self):
        """Circuit stays CLOSED with fewer failures than threshold."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=3
        )
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED

    def test_opens_at_threshold(self):
        """Circuit opens after exactly failure_threshold failures."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=3
        )
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_success_resets_failure_count(self):
        """A success in CLOSED state resets the failure counter."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=3
        )
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        # Failure counter was reset, so 3 more failures needed
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_single_failure_threshold(self):
        """Works with failure_threshold=1."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=1
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN


class TestOpenToHalfOpenTransition:
    """Test OPEN → HALF_OPEN transition after recovery timeout."""

    def test_stays_open_before_timeout(self):
        """Circuit stays OPEN when timeout hasn't elapsed."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=30,
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_transitions_to_half_open_after_timeout(self):
        """Circuit transitions to HALF_OPEN after recovery_timeout."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=1,
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(1.1)
        assert cb.state == CircuitState.HALF_OPEN

    @patch("time.monotonic")
    def test_timeout_transition_mocked(self, mock_monotonic):
        """Test timeout transition using mocked time."""
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=30,
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        # Advance time past the recovery timeout
        mock_monotonic.return_value = 131.0
        assert cb.state == CircuitState.HALF_OPEN


class TestHalfOpenToClosedTransition:
    """Test HALF_OPEN → CLOSED after success_threshold successes."""

    @patch("time.monotonic")
    def test_closes_after_success_threshold(self, mock_monotonic):
        """Circuit closes after success_threshold consecutive successes."""
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=10,
            success_threshold=2,
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        # Move past recovery timeout to get to HALF_OPEN
        mock_monotonic.return_value = 111.0
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED

    @patch("time.monotonic")
    def test_single_success_not_enough(self, mock_monotonic):
        """One success is not enough with success_threshold=2."""
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=10,
            success_threshold=2,
        )
        cb.record_failure()
        mock_monotonic.return_value = 111.0
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        assert cb.state == CircuitState.HALF_OPEN


class TestHalfOpenToOpenTransition:
    """Test HALF_OPEN → OPEN on any failure."""

    @patch("time.monotonic")
    def test_failure_in_half_open_reopens(self, mock_monotonic):
        """A single failure in HALF_OPEN reopens the circuit."""
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=10,
            success_threshold=2,
        )
        cb.record_failure()
        mock_monotonic.return_value = 111.0
        assert cb.state == CircuitState.HALF_OPEN

        # Record a failure in the new time
        mock_monotonic.return_value = 112.0
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    @patch("time.monotonic")
    def test_failure_after_one_success_in_half_open(self, mock_monotonic):
        """Failure after partial success in HALF_OPEN reopens circuit."""
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=10,
            success_threshold=3,
        )
        cb.record_failure()
        mock_monotonic.return_value = 111.0
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        cb.record_success()
        # Still HALF_OPEN (need 3 successes)
        assert cb.state == CircuitState.HALF_OPEN

        mock_monotonic.return_value = 112.0
        cb.record_failure()
        assert cb.state == CircuitState.OPEN


class TestShouldAllowRequest:
    """Test the request routing decision."""

    def test_allows_when_closed(self):
        cb = GatewayCircuitBreaker(gateway_url="http://gateway:4000")
        assert cb.should_allow_request() is True

    def test_blocks_when_open(self):
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=1
        )
        cb.record_failure()
        assert cb.should_allow_request() is False

    @patch("time.monotonic")
    def test_allows_when_half_open(self, mock_monotonic):
        mock_monotonic.return_value = 100.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=1,
            recovery_timeout=10,
        )
        cb.record_failure()
        mock_monotonic.return_value = 111.0
        assert cb.should_allow_request() is True


class TestReset:
    """Test manual reset functionality."""

    def test_reset_from_open(self):
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=1
        )
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0
        assert cb.success_count == 0


class TestThreadSafety:
    """Test concurrent access to the circuit breaker."""

    def test_concurrent_failures(self):
        """Multiple threads recording failures should be safe."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=100
        )
        threads = []
        for _ in range(50):
            t = threading.Thread(target=cb.record_failure)
            threads.append(t)
            t.start()
        for t in threads:
            t.join()

        # Should have opened after 100 failures — we only did 50
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 50

    def test_concurrent_mixed_operations(self):
        """Mixed success/failure operations from multiple threads."""
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000", failure_threshold=100
        )
        threads = []
        for i in range(100):
            if i % 2 == 0:
                t = threading.Thread(target=cb.record_failure)
            else:
                t = threading.Thread(target=cb.record_success)
            threads.append(t)
            t.start()
        for t in threads:
            t.join()

        # State should be valid (not corrupted)
        assert cb.state in (CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN)


class TestFullCycle:
    """Test complete circuit breaker lifecycle."""

    @patch("time.monotonic")
    def test_full_lifecycle(self, mock_monotonic):
        """Test CLOSED → OPEN → HALF_OPEN → CLOSED cycle."""
        mock_monotonic.return_value = 0.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=3,
            recovery_timeout=30,
            success_threshold=2,
        )

        # Start CLOSED
        assert cb.state == CircuitState.CLOSED
        assert cb.should_allow_request() is True

        # 3 failures → OPEN
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.should_allow_request() is False

        # Wait for recovery timeout → HALF_OPEN
        mock_monotonic.return_value = 31.0
        assert cb.state == CircuitState.HALF_OPEN
        assert cb.should_allow_request() is True

        # 2 successes → CLOSED
        cb.record_success()
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb.should_allow_request() is True

    @patch("time.monotonic")
    def test_repeated_open_close_cycles(self, mock_monotonic):
        """Test multiple open/close cycles."""
        mock_monotonic.return_value = 0.0
        cb = GatewayCircuitBreaker(
            gateway_url="http://gateway:4000",
            failure_threshold=2,
            recovery_timeout=10,
            success_threshold=1,
        )

        # First cycle: CLOSED → OPEN → HALF_OPEN → CLOSED
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        mock_monotonic.return_value = 11.0
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED

        # Second cycle: CLOSED → OPEN → HALF_OPEN → OPEN (failure in probe)
        mock_monotonic.return_value = 12.0
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        mock_monotonic.return_value = 23.0
        assert cb.state == CircuitState.HALF_OPEN
        mock_monotonic.return_value = 24.0
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
