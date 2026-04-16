"""
Customer Chatbot Use Case.

AI-powered customer chatbot for 24/7 banking support
with natural language understanding for account management,
transfers, and general inquiries.
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

__all__ = ["CustomerChatbotOrchestrator", "ChatRequest", "ChatResponse", "run_customer_chatbot"]
