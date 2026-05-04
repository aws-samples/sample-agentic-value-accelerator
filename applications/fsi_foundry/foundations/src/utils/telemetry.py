"""
Telemetry Utilities Module.

Provides centralized OTEL + Langfuse tracing setup for all agent frameworks.
Fetches Langfuse API keys from AWS Secrets Manager and configures OpenTelemetry
exporters to send traces to a self-hosted Langfuse instance.

The Langfuse host URL and secret name are injected from Terraform outputs
via the control plane (${LANGFUSE_HOST}, ${LANGFUSE_SECRET_NAME}).
"""

import os
import json
import base64
from typing import Optional

import boto3

from config.settings import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# Module-level state
_tracing_initialized = False


def _fetch_langfuse_keys(secret_name: str, region: str) -> dict:
    """Fetch Langfuse API keys from AWS Secrets Manager."""
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])


def setup_tracing() -> bool:
    """
    Configure OTEL tracing with Langfuse as the backend.

    Reads langfuse_host and langfuse_secret_name from settings (populated
    from Terraform outputs). Fetches API keys from Secrets Manager and
    sets OTEL environment variables.

    For Strands agents, also calls StrandsTelemetry().setup_otlp_exporter().

    Returns:
        True if tracing was successfully initialized, False otherwise.
    """
    global _tracing_initialized

    if _tracing_initialized:
        return True

    if not settings.enable_tracing:
        logger.info("tracing_disabled", reason="enable_tracing is False")
        return False

    if not settings.langfuse_host or not settings.langfuse_secret_name:
        logger.warning(
            "tracing_disabled",
            reason="langfuse_host or langfuse_secret_name not configured",
        )
        return False

    try:
        # Fetch API keys from Secrets Manager
        keys = _fetch_langfuse_keys(settings.langfuse_secret_name, settings.aws_region)
        public_key = keys.get("langfuse_public_key", "")
        secret_key = keys.get("langfuse_secret_key", "")

        if not public_key or not secret_key:
            logger.error("tracing_disabled", reason="API keys missing from secret")
            return False

        # Set env vars for Langfuse SDK and OTEL exporter
        os.environ["LANGFUSE_HOST"] = settings.langfuse_host
        os.environ["LANGFUSE_PUBLIC_KEY"] = public_key
        os.environ["LANGFUSE_SECRET_KEY"] = secret_key

        # Configure OTEL exporter to point at Langfuse's OTEL endpoint
        # This matches the moxbank pattern: set env vars, then let StrandsTelemetry handle it
        langfuse_auth = base64.b64encode(
            f"{public_key}:{secret_key}".encode()
        ).decode()
        os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = f"{settings.langfuse_host}/api/public/otel"
        os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = f"Authorization=Basic {langfuse_auth}"

        # Initialize Strands OTEL exporter (for Strands agents)
        try:
            from strands.telemetry import StrandsTelemetry
            StrandsTelemetry().setup_otlp_exporter()
            logger.info("strands_otel_exporter_initialized")
        except ImportError:
            logger.debug("strands_telemetry_not_available")

        # Initialize LangChain OTEL instrumentor (for LangGraph/LangChain agents)
        try:
            from opentelemetry.instrumentation.langchain import LangchainInstrumentor
            LangchainInstrumentor().instrument()
            logger.info("langchain_otel_instrumentor_initialized")
        except ImportError:
            logger.debug("langchain_otel_instrumentor_not_available")
        except Exception as le:
            logger.debug("langchain_otel_instrumentor_failed", error=str(le))

        # Initialize Langfuse v4 client (auto-registers as OTEL span processor
        # for LangGraph/LangChain agents via @observe or manual tracing)
        try:
            from langfuse import get_client
            _langfuse_client = get_client()
            if _langfuse_client.auth_check():
                logger.info("langfuse_client_initialized")
            else:
                logger.warning("langfuse_auth_check_failed")
        except Exception as le:
            logger.debug("langfuse_client_init_skipped", detail=str(le))

        _tracing_initialized = True
        logger.info("tracing_enabled", langfuse_host=settings.langfuse_host)
        return True

    except Exception as e:
        logger.error("tracing_setup_failed", error=str(e))
        return False


def build_trace_attributes(
    agent_name: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    tags: Optional[list] = None,
) -> dict:
    """
    Build trace attributes dict for Strands agents.

    Args:
        agent_name: Name of the agent (used for filtering in Langfuse UI)
        session_id: Session identifier for grouping conversation turns
        user_id: User identifier
        tags: List of tags for filtering

    Returns:
        Dict of trace attributes to pass to Agent(trace_attributes=...)
    """
    attrs = {
        "langfuse.tags": tags or [settings.use_case_id, agent_name],
        "model.id": settings.effective_bedrock_model_id,
        "environment": settings.app_env,
        "agent.name": agent_name,
        "use_case": settings.use_case_id,
    }
    if session_id:
        attrs["session.id"] = session_id
    if user_id:
        attrs["user.id"] = user_id
    return attrs


def get_langfuse_callback_handler():
    """
    Get a Langfuse callback handler for LangChain/LangGraph agents.

    Supports both Langfuse v3 (langfuse.callback.CallbackHandler)
    and v4 (OTEL-native, no callback handler needed).

    Returns:
        CallbackHandler instance, or None if tracing is not enabled or using v4 OTEL.
    """
    if not _tracing_initialized:
        if not setup_tracing():
            return None

    # Langfuse v3: uses CallbackHandler
    try:
        from langfuse.callback import CallbackHandler
        return CallbackHandler()
    except ImportError:
        pass

    # Langfuse v4: OTEL-native, no callback handler needed.
    # Tracing is handled via OTEL env vars + opentelemetry-instrument wrapper.
    logger.info("langfuse_v4_otel_mode", detail="Using OTEL-native tracing (no callback handler)")
    return None
