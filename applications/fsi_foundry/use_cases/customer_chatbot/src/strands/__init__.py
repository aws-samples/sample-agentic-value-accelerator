"""
Customer Chatbot Use Case - Strands Implementation.

AI-powered customer chatbot for 24/7 banking support
using the Strands agent framework.

The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import CustomerChatbotOrchestrator, run_customer_chatbot
from .models import ChatRequest, ChatResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="customer_chatbot",
    config=RegisteredAgent(
        entry_point=run_customer_chatbot,
        request_model=ChatRequest,
        response_model=ChatResponse,
    )
)

__all__ = [
    "CustomerChatbotOrchestrator",
    "run_customer_chatbot",
    "ChatRequest",
    "ChatResponse",
]
