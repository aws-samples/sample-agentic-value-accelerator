"""
AI Assistant Use Case.

AI-powered employee productivity assistant for banking operations.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_ai_assistant
    from strands.models import AssistantRequest, AssistantResponse

    register_agent("ai_assistant", RegisteredAgent(
        entry_point=run_ai_assistant,
        request_model=AssistantRequest,
        response_model=AssistantResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_ai_assistant
    from langchain_langgraph.models import AssistantRequest, AssistantResponse

    register_agent("ai_assistant", RegisteredAgent(
        entry_point=run_ai_assistant,
        request_model=AssistantRequest,
        response_model=AssistantResponse,
    ))

__all__ = [
    "run_ai_assistant",
    "AssistantRequest",
    "AssistantResponse",
]
