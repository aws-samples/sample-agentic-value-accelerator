# SPDX-License-Identifier: Apache-2.0
"""
Telemetry setup — Langfuse + OpenTelemetry.

Called early in main.py so OTEL env vars are set before any LLM client
auto-instruments. Fails silently if Langfuse is not configured.
"""

import logging
import os

logger = logging.getLogger(__name__)


def setup_tracing() -> bool:
    """
    Configure Langfuse tracing via environment variables.

    Returns True if tracing was successfully initialized, False otherwise.
    """
    from config.settings import settings

    if not settings.enable_tracing:
        logger.info("Tracing disabled via ENABLE_TRACING=false")
        return False

    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        logger.info(
            "Langfuse keys not configured — tracing skipped. "
            "Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable."
        )
        return False

    try:
        # Set environment variables that the Langfuse SDK and OTEL exporter read.
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
        if settings.langfuse_host:
            os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)

        from langfuse import Langfuse

        _client = Langfuse()
        logger.info(
            "Langfuse tracing initialized (host=%s)",
            settings.langfuse_host or "cloud.langfuse.com",
        )
        return True

    except Exception as e:
        logger.warning("Failed to initialize Langfuse tracing: %s", e)
        return False
