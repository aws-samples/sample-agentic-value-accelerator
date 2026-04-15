"""
AI Assistant Use Case - Strands Implementation.

AI-powered employee productivity assistant using the Strands agent framework.
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

__all__ = [
    "AiAssistantOrchestrator",
    "run_ai_assistant",
    "AssistantRequest",
    "AssistantResponse",
]
