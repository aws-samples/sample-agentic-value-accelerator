"""LLM Gateway (LiteLLM) integration helpers.

Resolves the gateway virtual key from Secrets Manager (preferred) or a
direct env var fallback. Cached so we don't hit Secrets Manager on every
LLM construction.

Provides gateway URL and model-ID helpers used by the framework base classes:
  * base/langgraph/agent.py + orchestrator.py — ChatLiteLLM factory branch
  * base/strands/agent.py + orchestrator.py — LiteLLMModel factory branch
  * utils/evaluation.py — shadow eval mirror

When settings.use_llm_gateway is False, this module is unused — all
existing direct-Bedrock paths keep working without changes.

Fail-closed behavior:
  When the gateway is enabled (use_llm_gateway=True) but the virtual key
  cannot be resolved, production callers (LOCAL_MODE unset) MUST raise
  GatewayConfigurationError. Dev/local callers (LOCAL_MODE=true) may fall
  back to direct Bedrock with a warning. This prevents silent bypass of
  the governance/audit chokepoint in production.
"""

import json
import logging
import warnings
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)


class GatewayConfigurationError(Exception):
    """Raised when gateway is enabled but misconfigured.

    Examples:
      - use_llm_gateway=True but LLM_GATEWAY_BASE_URL is empty
      - Gateway URL configured but no virtual key can be resolved (production)
    """

    pass


@lru_cache(maxsize=1)
def resolve_gateway_api_key() -> Optional[str]:
    """Fetch the LLM Gateway virtual key.

    Resolution order:
      1. settings.llm_gateway_api_key_secret_arn — Secrets Manager (preferred)
      2. settings.llm_gateway_api_key — direct env var (dev/local only)
      3. None — production callers must fail closed; dev callers may fall back

    Returns:
        The virtual key string, or None if no source is configured / fetch fails.
    """
    from config.settings import settings

    if not settings.use_llm_gateway:
        return None

    if settings.llm_gateway_api_key_secret_arn:
        try:
            import boto3

            client = boto3.client("secretsmanager", region_name=settings.aws_region)
            resp = client.get_secret_value(SecretId=settings.llm_gateway_api_key_secret_arn)
            secret_str = resp.get("SecretString", "")
            try:
                # LiteLLM virtual keys are stored as JSON {"key": "sk-..."}
                # to match the LiteLLM admin /key/generate response shape
                data = json.loads(secret_str)
                key = data.get("key") or data.get("api_key") or data.get("master_key")
            except json.JSONDecodeError:
                # Plain string fallback
                key = secret_str.strip()

            if key:
                logger.info("llm_gateway_key_resolved_from_secrets_manager")
                return key
            logger.warning("llm_gateway_secret_returned_empty_value")
        except Exception as exc:
            logger.warning(
                "llm_gateway_secret_fetch_failed",
                extra={"secret_arn": settings.llm_gateway_api_key_secret_arn, "error": str(exc)},
            )

    if settings.llm_gateway_api_key:
        logger.info("llm_gateway_key_resolved_from_env")
        return settings.llm_gateway_api_key

    logger.warning("llm_gateway_enabled_but_no_key_configured")
    return None


def gateway_base_url() -> str:
    """The LiteLLM gateway base URL (no /v1 suffix).

    ChatLiteLLM and LiteLLMModel append the path themselves, so callers
    should NOT append /v1.

    Returns:
        The gateway URL (e.g., 'http://gateway:4000').

    Raises:
        GatewayConfigurationError: If gateway mode is disabled or URL is empty.
    """
    from config.settings import settings

    if not settings.use_llm_gateway:
        raise GatewayConfigurationError("gateway_base_url called but use_llm_gateway is False")
    url = settings.llm_gateway_base_url.rstrip("/")
    if not url:
        raise GatewayConfigurationError("LLM_GATEWAY_BASE_URL is empty")
    return url


def gateway_model_id(model_id: str) -> str:
    """Prefix model_id for gateway routing.

    Adds 'litellm_proxy/' prefix exactly once. Handles cases where
    model_id might already be prefixed (e.g., in tests or manual config).

    Args:
        model_id: Raw Bedrock model ID or display alias
                  (e.g., 'us.anthropic.claude-haiku-4-5-20251001-v1:0' or 'Claude Haiku 4.5')

    Returns:
        Prefixed model ID (e.g., 'litellm_proxy/us.anthropic.claude-haiku-4-5-20251001-v1:0')
    """
    if model_id.startswith("litellm_proxy/"):
        return model_id
    return f"litellm_proxy/{model_id}"


def gateway_openai_base_url() -> Optional[str]:
    """Deprecated: use gateway_base_url() instead.

    This function appends /v1 which is incorrect for ChatLiteLLM and
    LiteLLMModel adapters. Kept for backward compatibility with any
    code that still uses the old ChatOpenAI path.
    """
    warnings.warn(
        "gateway_openai_base_url() is deprecated. Use gateway_base_url() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    from config.settings import settings

    if not settings.use_llm_gateway:
        return None
    return f"{settings.llm_gateway_base_url.rstrip('/')}/v1"
