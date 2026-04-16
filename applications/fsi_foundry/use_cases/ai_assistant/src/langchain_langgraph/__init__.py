"""
AI Assistant Use Case.

AI-powered employee productivity assistant using LangChain/LangGraph.
"""

from .orchestrator import AiAssistantOrchestrator, run_ai_assistant
from .models import AssistantRequest, AssistantResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="ai_assistant",
    config=RegisteredAgent(
        entry_point=run_ai_assistant,
        request_model=AssistantRequest,
        response_model=AssistantResponse,
    )
)

__all__ = ["AiAssistantOrchestrator", "AssistantRequest", "AssistantResponse", "run_ai_assistant"]
