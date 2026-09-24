"""Guardrail tools — Bedrock guardrails inspection.

Wraps GovernGuardrailsService for use as LangChain tools.
"""

import json
from langchain_core.tools import tool

from services.govern_guardrails_service import GovernGuardrailsService


def _get_service(region: str = "us-east-1") -> GovernGuardrailsService:
    return GovernGuardrailsService(region=region)


@tool
def list_guardrails_tool(region: str = "us-east-1", days: int = 30) -> str:
    """List all Bedrock guardrails with telemetry data.

    Returns guardrails with their invocation counts and intervention rates.
    Use this to audit guardrail coverage and effectiveness.

    Args:
        region: AWS region to query (default: us-east-1)
        days: Number of days of telemetry to include (default: 30)

    Returns:
        JSON with guardrail list, telemetry, and counts
    """
    svc = _get_service(region)
    result = svc.get_telemetry(days=days)

    return json.dumps({
        "guardrails": [g.model_dump() for g in result.guardrails],
        "total_guardrails": result.total_guardrails,
        "total_invocations": result.total_invocations,
        "total_interventions": result.total_interventions,
        "window_days": result.window_days,
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)


@tool
def get_guardrail_tool(guardrail_id: str, region: str = "us-east-1") -> str:
    """Get telemetry for a specific guardrail.

    Returns the guardrail's invocation and intervention metrics.
    For full configuration details, use the Bedrock console or API directly.

    Args:
        guardrail_id: The guardrail ID to retrieve
        region: AWS region to query (default: us-east-1)

    Returns:
        JSON with guardrail telemetry
    """
    svc = _get_service(region)
    result = svc.get_telemetry(days=30)

    # Find the specific guardrail
    for gr in result.guardrails:
        if gr.guardrail_id == guardrail_id:
            return json.dumps(gr.model_dump(), indent=2, default=str)

    return json.dumps({
        "error": f"Guardrail {guardrail_id} not found",
        "guardrail_id": guardrail_id,
        "available_guardrails": [g.guardrail_id for g in result.guardrails],
    })
