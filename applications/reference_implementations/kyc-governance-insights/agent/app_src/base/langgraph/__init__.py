"""
LangGraph base classes for agent and orchestrator development.

Usage:
    from base.langgraph import LangGraphAgent, LangGraphOrchestrator
    from base.langgraph import apply_guardrail_to_response
"""

import logging
from typing import Any

from base.langgraph.agent import LangGraphAgent
from base.langgraph.orchestrator import LangGraphOrchestrator

_logger = logging.getLogger(__name__)


async def apply_guardrail_to_response(response_dict: dict) -> dict:
    """
    Apply Bedrock Guardrail post-processing to a response dict.

    Applies guardrail to the 'summary' field and all long string values
    inside 'raw_analysis' (where agent text outputs live).
    Works universally for all use cases.

    Call this on the response.model_dump() result before returning from run_* functions.
    """
    from config.settings import settings

    if not settings.guardrail_id:
        return response_dict

    try:
        import boto3
        client = boto3.client('bedrock-runtime', region_name=settings.aws_region)
    except Exception as e:
        _logger.warning("guardrail_client_init_failed: %s", str(e))
        return response_dict

    def _apply(text: str) -> str:
        if not text or len(text) < 50:
            return text
        try:
            resp = client.apply_guardrail(
                guardrailIdentifier=settings.guardrail_id,
                guardrailVersion=settings.guardrail_version or "DRAFT",
                source="OUTPUT",
                content=[{"text": {"text": text}}],
            )
            if resp.get("action") == "GUARDRAIL_INTERVENED":
                outputs = resp.get("outputs", [])
                if outputs:
                    return outputs[0].get("text", text)
        except Exception:
            pass
        return text

    def _walk_analysis(obj: Any) -> Any:
        """Recursively apply guardrail to string values in analysis dicts."""
        if isinstance(obj, str):
            return _apply(obj)
        if isinstance(obj, dict):
            return {k: _walk_analysis(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_walk_analysis(item) for item in obj]
        return obj

    # Apply guardrail to ALL string fields in the entire response recursively.
    # Skips short strings (<50 chars) like IDs, status codes, timestamps.
    return _walk_analysis(response_dict)


__all__ = ["LangGraphAgent", "LangGraphOrchestrator", "apply_guardrail_to_response"]
