"""
Adverse Media Curation Use Case.

Automated adverse media screening with sentiment analysis and risk signal extraction.
Supports multiple agent frameworks: LangGraph (default) and Strands.
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_adverse_media
    from strands.models import ScreeningRequest, ScreeningResponse

    register_agent("adverse_media", RegisteredAgent(
        entry_point=run_adverse_media,
        request_model=ScreeningRequest,
        response_model=ScreeningResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_adverse_media
    from langchain_langgraph.models import ScreeningRequest, ScreeningResponse

    register_agent("adverse_media", RegisteredAgent(
        entry_point=run_adverse_media,
        request_model=ScreeningRequest,
        response_model=ScreeningResponse,
    ))

__all__ = [
    "run_adverse_media",
    "ScreeningRequest",
    "ScreeningResponse",
]
