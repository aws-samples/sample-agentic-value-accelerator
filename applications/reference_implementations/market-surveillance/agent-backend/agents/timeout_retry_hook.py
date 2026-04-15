"""
Strands hook that retries model calls on ReadTimeoutError.

Strands only retries ModelThrottledException by default. ReadTimeoutError
(from urllib3 when Bedrock takes too long before the first token) is raised
immediately without retry. This hook intercepts AfterModelCallEvent, detects
timeout errors, and sets event.retry = True so Strands re-invokes the model.

Usage:
    from agents.timeout_retry_hook import ReadTimeoutRetryHook

    agent = Agent(
        ...,
        hooks=[ReadTimeoutRetryHook(max_retries=3)],
    )
"""

import logging
import time
from urllib3.exceptions import ReadTimeoutError

from strands.hooks import AfterModelCallEvent, HookProvider, HookRegistry

logger = logging.getLogger(__name__)


class ReadTimeoutRetryHook(HookProvider):
    """Retries model calls that fail with ReadTimeoutError."""

    def __init__(self, max_retries: int = 2, backoff_seconds: int = 5):
        self._max_retries = max_retries
        self._backoff_seconds = backoff_seconds
        self._attempt_count = 0

    def register_hooks(self, registry: HookRegistry, **kwargs) -> None:
        registry.add_callback(AfterModelCallEvent, self._on_after_model_call)

    def _on_after_model_call(self, event: AfterModelCallEvent, **kwargs) -> None:
        exc = event.exception
        if exc is None:
            # Success — reset counter
            self._attempt_count = 0
            return

        is_timeout = isinstance(exc, ReadTimeoutError) or "Read timed out" in str(exc)
        if not is_timeout:
            return

        self._attempt_count += 1
        if self._attempt_count <= self._max_retries:
            logger.warning(
                "[TimeoutRetryHook] ReadTimeoutError caught (attempt %d/%d), "
                "retrying in %ds...",
                self._attempt_count,
                self._max_retries,
                self._backoff_seconds,
            )
            time.sleep(self._backoff_seconds)
            event.retry = True
        else:
            logger.error(
                "[TimeoutRetryHook] ReadTimeoutError — exhausted %d retries, raising",
                self._max_retries,
            )
            self._attempt_count = 0
