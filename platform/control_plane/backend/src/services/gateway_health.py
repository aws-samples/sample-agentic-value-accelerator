# =============================================================================
# Gateway Health Check Validation Module
# =============================================================================
# Provides a client for verifying LiteLLM gateway health endpoints:
#   - GET /health  → status, uptime, DB connectivity, Redis connectivity
#   - GET /ready   → 200 only when all dependencies are healthy
#   - GET /metrics → Prometheus-compatible metrics endpoint
#
# This module is used by:
#   - The deployment flow to validate gateway is healthy after updates
#   - The Circuit Breaker client for health probing
#   - Integration tests for smoke testing the gateway
#
# Task: 7.3
# Requirements: 9.1, 9.2, 9.3, 9.6
# =============================================================================

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import time
import logging

import httpx

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Gateway health status values."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class DependencyStatus(str, Enum):
    """Individual dependency connection status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result from the /health endpoint (Requirement 9.1).

    LiteLLM /health returns JSON with:
      - status: overall health status
      - uptime: seconds since container start
      - db_connectivity: PostgreSQL connection state
      - redis_connectivity: Redis connection state
    """

    status: HealthStatus
    uptime_seconds: float
    db_connectivity: DependencyStatus
    redis_connectivity: DependencyStatus
    response_time_ms: float
    raw_response: Optional[dict] = field(default=None, repr=False)


@dataclass
class ReadinessCheckResult:
    """Result from the /ready endpoint (Requirement 9.2).

    Returns 200 only when ALL dependencies are confirmed healthy:
      - RDS PostgreSQL
      - ElastiCache Redis
      - Bedrock connectivity
    """

    is_ready: bool
    status_code: int
    response_time_ms: float
    raw_response: Optional[dict] = field(default=None, repr=False)


@dataclass
class MetricsCheckResult:
    """Result from the /metrics endpoint (Requirement 9.6).

    Verifies the Prometheus-compatible metrics endpoint is exposed.
    """

    is_available: bool
    content_type: str
    has_prometheus_format: bool
    response_time_ms: float
    sample_metrics: list = field(default_factory=list)


@dataclass
class GatewayHealthReport:
    """Complete health report combining all endpoint checks."""

    health: Optional[HealthCheckResult] = None
    readiness: Optional[ReadinessCheckResult] = None
    metrics: Optional[MetricsCheckResult] = None
    overall_healthy: bool = False
    checked_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        """Compute overall health from individual checks."""
        if self.health and self.readiness and self.metrics:
            self.overall_healthy = (
                self.health.status == HealthStatus.HEALTHY
                and self.readiness.is_ready
                and self.metrics.is_available
            )


class GatewayHealthClient:
    """Client for validating LiteLLM gateway health endpoints.

    Configuration matches ECS health check parameters (Requirement 9.3):
      - Interval: 30 seconds (caller's responsibility to schedule)
      - Timeout: 5 seconds (configurable via timeout_seconds)
      - Retries: 3 (configurable via max_retries)

    Usage:
        client = GatewayHealthClient("http://gateway-alb:4000")
        report = client.full_health_check()
        if report.overall_healthy:
            print("Gateway is fully operational")
    """

    # Default ECS health check configuration (Requirement 9.3)
    DEFAULT_TIMEOUT_SECONDS = 5.0
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_INTERVAL_SECONDS = 30

    def __init__(
        self,
        gateway_url: str,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        """Initialize health client.

        Args:
            gateway_url: Base URL of the LiteLLM gateway (e.g., http://alb:4000)
            timeout_seconds: Request timeout matching ECS config (default: 5s)
            max_retries: Number of retries matching ECS config (default: 3)
        """
        self.gateway_url = gateway_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def check_health(self) -> HealthCheckResult:
        """Check the /health endpoint (Requirement 9.1).

        Returns JSON with status, uptime, database and Redis connectivity.
        This is the same endpoint used by ECS container health checks and
        ALB target group health checks.

        Returns:
            HealthCheckResult with parsed health data.
        """
        url = f"{self.gateway_url}/health"
        start_time = time.time()

        try:
            response = httpx.get(url, timeout=self.timeout_seconds)
            response_time_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                data = response.json()
                return HealthCheckResult(
                    status=self._parse_health_status(data),
                    uptime_seconds=data.get("uptime", 0.0),
                    db_connectivity=self._parse_dependency_status(
                        data, "db"
                    ),
                    redis_connectivity=self._parse_dependency_status(
                        data, "redis"
                    ),
                    response_time_ms=response_time_ms,
                    raw_response=data,
                )
            else:
                return HealthCheckResult(
                    status=HealthStatus.UNHEALTHY,
                    uptime_seconds=0.0,
                    db_connectivity=DependencyStatus.UNKNOWN,
                    redis_connectivity=DependencyStatus.UNKNOWN,
                    response_time_ms=response_time_ms,
                )
        except (httpx.RequestError, httpx.TimeoutException) as e:
            response_time_ms = (time.time() - start_time) * 1000
            logger.warning(f"Health check failed: {e}")
            return HealthCheckResult(
                status=HealthStatus.UNHEALTHY,
                uptime_seconds=0.0,
                db_connectivity=DependencyStatus.UNKNOWN,
                redis_connectivity=DependencyStatus.UNKNOWN,
                response_time_ms=response_time_ms,
            )

    def check_readiness(self) -> ReadinessCheckResult:
        """Check the /ready endpoint (Requirement 9.2).

        Returns HTTP 200 only when ALL dependencies are confirmed healthy:
          - RDS PostgreSQL connection
          - ElastiCache Redis connection
          - Bedrock connectivity

        Returns:
            ReadinessCheckResult indicating if all deps are healthy.
        """
        url = f"{self.gateway_url}/ready"
        start_time = time.time()

        try:
            response = httpx.get(url, timeout=self.timeout_seconds)
            response_time_ms = (time.time() - start_time) * 1000

            data = None
            if response.headers.get("content-type", "").startswith(
                "application/json"
            ):
                try:
                    data = response.json()
                except Exception:
                    pass

            return ReadinessCheckResult(
                is_ready=(response.status_code == 200),
                status_code=response.status_code,
                response_time_ms=response_time_ms,
                raw_response=data,
            )
        except (httpx.RequestError, httpx.TimeoutException) as e:
            response_time_ms = (time.time() - start_time) * 1000
            logger.warning(f"Readiness check failed: {e}")
            return ReadinessCheckResult(
                is_ready=False,
                status_code=0,
                response_time_ms=response_time_ms,
            )

    def check_metrics(self) -> MetricsCheckResult:
        """Check the /metrics endpoint (Requirement 9.6).

        Verifies the Prometheus-compatible metrics endpoint is exposed.
        Prometheus format uses text/plain content type with metric lines
        in the format: metric_name{labels} value timestamp

        Returns:
            MetricsCheckResult with availability and format validation.
        """
        url = f"{self.gateway_url}/metrics"
        start_time = time.time()

        try:
            response = httpx.get(url, timeout=self.timeout_seconds)
            response_time_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                content_type = response.headers.get("content-type", "")
                body = response.text

                # Prometheus metrics use text/plain or
                # application/openmetrics-text content type
                has_prometheus_format = self._is_prometheus_format(
                    content_type, body
                )

                # Extract a few sample metric names for validation
                sample_metrics = self._extract_sample_metrics(body)

                return MetricsCheckResult(
                    is_available=True,
                    content_type=content_type,
                    has_prometheus_format=has_prometheus_format,
                    response_time_ms=response_time_ms,
                    sample_metrics=sample_metrics,
                )
            else:
                return MetricsCheckResult(
                    is_available=False,
                    content_type="",
                    has_prometheus_format=False,
                    response_time_ms=response_time_ms,
                )
        except (httpx.RequestError, httpx.TimeoutException) as e:
            response_time_ms = (time.time() - start_time) * 1000
            logger.warning(f"Metrics check failed: {e}")
            return MetricsCheckResult(
                is_available=False,
                content_type="",
                has_prometheus_format=False,
                response_time_ms=response_time_ms,
            )

    def full_health_check(self) -> GatewayHealthReport:
        """Run all health checks and return a complete report.

        Checks /health, /ready, and /metrics endpoints in sequence.
        Computes overall_healthy as True only if all checks pass.

        Returns:
            GatewayHealthReport with results from all endpoints.
        """
        health = self.check_health()
        readiness = self.check_readiness()
        metrics = self.check_metrics()

        return GatewayHealthReport(
            health=health,
            readiness=readiness,
            metrics=metrics,
        )

    def check_health_with_retries(self) -> HealthCheckResult:
        """Check /health with retry logic matching ECS configuration.

        Retries up to max_retries times (default 3) before reporting
        unhealthy. This mirrors ECS health check behavior (Requirement 9.3).

        Returns:
            HealthCheckResult from the last attempt.
        """
        last_result = None
        for attempt in range(self.max_retries + 1):
            result = self.check_health()
            last_result = result

            if result.status == HealthStatus.HEALTHY:
                return result

            if attempt < self.max_retries:
                logger.info(
                    f"Health check attempt {attempt + 1}/{self.max_retries + 1} "
                    f"failed, retrying..."
                )

        return last_result  # type: ignore[return-value]

    @staticmethod
    def _parse_health_status(data: dict) -> HealthStatus:
        """Parse health status from response data."""
        status = data.get("status", "").lower()
        if status in ("healthy", "ok", "running"):
            return HealthStatus.HEALTHY
        elif status in ("degraded", "partial"):
            return HealthStatus.DEGRADED
        return HealthStatus.UNHEALTHY

    @staticmethod
    def _parse_dependency_status(data: dict, dep_key: str) -> DependencyStatus:
        """Parse individual dependency status from health response.

        LiteLLM health response may include connectivity info in various
        formats. We check common patterns.
        """
        # Check for direct connectivity field
        connectivity_key = f"{dep_key}_connectivity"
        if connectivity_key in data:
            val = str(data[connectivity_key]).lower()
            if val in ("connected", "ok", "true", "healthy"):
                return DependencyStatus.CONNECTED
            elif val in ("disconnected", "false", "unhealthy", "error"):
                return DependencyStatus.DISCONNECTED
            return DependencyStatus.UNKNOWN

        # Check for nested health_checks structure
        health_checks = data.get("health_checks", {})
        if dep_key in health_checks:
            val = str(health_checks[dep_key]).lower()
            if val in ("connected", "ok", "true", "healthy", "pass"):
                return DependencyStatus.CONNECTED
            return DependencyStatus.DISCONNECTED

        return DependencyStatus.UNKNOWN

    @staticmethod
    def _is_prometheus_format(content_type: str, body: str) -> bool:
        """Determine if response is in Prometheus exposition format.

        Prometheus format indicators:
          - Content-Type: text/plain or application/openmetrics-text
          - Lines matching: metric_name{label="value"} numeric_value
          - HELP and TYPE comments
        """
        # Check content type
        prometheus_types = [
            "text/plain",
            "application/openmetrics-text",
            "text/plain; charset=utf-8",
        ]
        is_prometheus_type = any(
            ct in content_type.lower() for ct in prometheus_types
        )

        # Check body for Prometheus format indicators
        has_help_lines = "# HELP" in body
        has_type_lines = "# TYPE" in body
        has_metric_lines = any(
            line.strip()
            and not line.startswith("#")
            and (" " in line.strip())
            for line in body.split("\n")[:20]
            if line.strip()
        )

        return is_prometheus_type and (
            has_help_lines or has_type_lines or has_metric_lines
        )

    @staticmethod
    def _extract_sample_metrics(body: str) -> list:
        """Extract a few sample metric names from Prometheus output."""
        metrics = []
        for line in body.split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                # Extract metric name (before { or space)
                name = line.split("{")[0].split(" ")[0]
                if name and name not in metrics:
                    metrics.append(name)
                if len(metrics) >= 5:
                    break
        return metrics


# =============================================================================
# ECS Health Check Configuration Constants
# =============================================================================
# These constants document the ECS health check configuration applied in
# Terraform (main.tf) for cross-reference by tests and deployment scripts.
# =============================================================================

ECS_HEALTH_CHECK_CONFIG = {
    "endpoint": "/health",
    "interval_seconds": 30,
    "timeout_seconds": 5,
    "retries": 3,
    "start_period_seconds": 60,
    "command": "curl -f http://localhost:4000/health || exit 1",
}

ECS_DEPLOYMENT_CIRCUIT_BREAKER_CONFIG = {
    "enabled": True,
    "rollback": True,
    "rollback_window_minutes": 5,
    "minimum_healthy_percent": 50,
    "maximum_percent": 200,
    "health_check_grace_period_seconds": 60,
}

LITELLM_HEALTH_ENDPOINTS = {
    "health": {
        "path": "/health",
        "method": "GET",
        "description": "Status, uptime, DB/Redis connectivity",
        "requirement": "9.1",
    },
    "ready": {
        "path": "/ready",
        "method": "GET",
        "description": "200 only when all deps (RDS, Redis, Bedrock) healthy",
        "requirement": "9.2",
    },
    "metrics": {
        "path": "/metrics",
        "method": "GET",
        "description": "Prometheus-compatible metrics endpoint",
        "requirement": "9.6",
    },
}
