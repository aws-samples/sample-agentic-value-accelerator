"""LiteLLM custom logger for emitting CloudWatch metrics.

This module provides a LiteLLM-compatible custom logger class that emits
gateway operational metrics to CloudWatch on every request completion.
It is configured as a callback in LiteLLM's config.yaml via the
`custom_callback_class` or `success_callback` mechanism.

The logger emits:
- requests_per_second: Count of requests (aggregated in CloudWatch)
- latency_p50/p95/p99: Request latency in milliseconds (uses CloudWatch
  percentile statistics on the raw latency values)
- error_rate_by_type: Count of errors with error type dimension
- active_virtual_keys: Periodic count of active keys
- cache_hit_ratio: Count with cache result dimension (hit/miss)

Requirements: 9.4
"""

import logging
import time
from typing import Any, Dict, Optional

from gateway_client.cloudwatch_metrics import (
    GatewayMetricsEmitter,
    MetricData,
    MetricDimension,
    MetricUnit,
)

logger = logging.getLogger(__name__)


class LiteLLMMetricsLogger:
    """Custom callback class for LiteLLM that emits CloudWatch metrics.

    This class follows the LiteLLM custom callback interface with
    `log_success_event` and `log_failure_event` methods. It can be
    referenced in litellm_settings.callbacks or instantiated directly.

    Usage in LiteLLM config.yaml:
        litellm_settings:
          success_callback: ["langfuse", "custom_callback"]
          failure_callback: ["langfuse", "custom_callback"]

    Or instantiated programmatically:
        from gateway_client.litellm_metrics_logger import LiteLLMMetricsLogger
        litellm.callbacks = [LiteLLMMetricsLogger()]

    Args:
        metrics_emitter: An optional GatewayMetricsEmitter instance.
            Created with defaults if not provided.
        gateway_id: Gateway identifier for metric dimensions.
        aws_region: AWS region for the CloudWatch client.
    """

    def __init__(
        self,
        metrics_emitter: Optional[GatewayMetricsEmitter] = None,
        gateway_id: str = "ava-litellm",
        aws_region: str = "us-east-2",
    ):
        self._emitter = metrics_emitter or GatewayMetricsEmitter(
            gateway_id=gateway_id,
            aws_region=aws_region,
        )

    @property
    def emitter(self) -> GatewayMetricsEmitter:
        """The underlying metrics emitter instance."""
        return self._emitter

    def log_success_event(
        self,
        kwargs: Dict[str, Any],
        response_obj: Any,
        start_time: float,
        end_time: float,
    ) -> None:
        """Log a successful LLM request and emit CloudWatch metrics.

        Called by LiteLLM after a successful request completion.

        Args:
            kwargs: The original request kwargs (model, messages, etc.).
            response_obj: The response object from the LLM provider.
            start_time: Unix timestamp when the request started.
            end_time: Unix timestamp when the request completed.
        """
        try:
            model = kwargs.get("model", "unknown")
            latency_ms = (end_time - start_time) * 1000.0

            # Detect cache hit from response metadata
            cache_hit = self._is_cache_hit(kwargs, response_obj)

            self._emitter.emit_request_metric(
                latency_ms=latency_ms,
                model=model,
                status_code=200,
                cache_hit=cache_hit,
            )
        except Exception as e:
            logger.debug("Error in metrics success callback: %s", e)

    def log_failure_event(
        self,
        kwargs: Dict[str, Any],
        response_obj: Any,
        start_time: float,
        end_time: float,
    ) -> None:
        """Log a failed LLM request and emit CloudWatch metrics.

        Called by LiteLLM after a failed request.

        Args:
            kwargs: The original request kwargs (model, messages, etc.).
            response_obj: The error/exception object.
            start_time: Unix timestamp when the request started.
            end_time: Unix timestamp when the request completed.
        """
        try:
            model = kwargs.get("model", "unknown")
            latency_ms = (end_time - start_time) * 1000.0
            status_code = self._extract_status_code(response_obj)

            self._emitter.emit_request_metric(
                latency_ms=latency_ms,
                model=model,
                status_code=status_code,
                cache_hit=False,
            )
        except Exception as e:
            logger.debug("Error in metrics failure callback: %s", e)

    @staticmethod
    def _is_cache_hit(kwargs: Dict[str, Any], response_obj: Any) -> bool:
        """Determine if a response was served from cache.

        LiteLLM sets cache-related metadata in kwargs or the response
        when a cached result is returned.

        Args:
            kwargs: The request kwargs.
            response_obj: The response object.

        Returns:
            True if the response was a cache hit.
        """
        # Check litellm's cache metadata in kwargs
        litellm_params = kwargs.get("litellm_params", {})
        if litellm_params.get("cache_hit", False):
            return True

        # Check metadata field
        metadata = kwargs.get("metadata", {})
        if metadata.get("cache_hit", False):
            return True

        # Check response object for cache indicators
        if hasattr(response_obj, "_hidden_params"):
            hidden = getattr(response_obj, "_hidden_params", {})
            if isinstance(hidden, dict) and hidden.get("cache_hit", False):
                return True

        return False

    @staticmethod
    def _extract_status_code(response_obj: Any) -> int:
        """Extract the HTTP status code from an error response.

        Args:
            response_obj: The error/exception object.

        Returns:
            The HTTP status code, or 500 if not determinable.
        """
        if hasattr(response_obj, "status_code"):
            return int(response_obj.status_code)

        if isinstance(response_obj, Exception):
            # Try to extract from common exception attributes
            if hasattr(response_obj, "response"):
                resp = getattr(response_obj, "response", None)
                if hasattr(resp, "status_code"):
                    return int(resp.status_code)

        return 500
