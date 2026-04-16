"""
Customer Chatbot Use Case.

AI-powered customer chatbot for 24/7 banking support with natural language
understanding for account management, transfers, and general inquiries.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation

The use case is automatically registered with the AVA registry on import.
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_customer_chatbot
    from strands.models import ChatRequest, ChatResponse

    register_agent("customer_chatbot", RegisteredAgent(
        entry_point=run_customer_chatbot,
        request_model=ChatRequest,
        response_model=ChatResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_customer_chatbot
    from langchain_langgraph.models import ChatRequest, ChatResponse

    register_agent("customer_chatbot", RegisteredAgent(
        entry_point=run_customer_chatbot,
        request_model=ChatRequest,
        response_model=ChatResponse,
    ))

__all__ = [
    "run_customer_chatbot",
    "ChatRequest",
    "ChatResponse",
]
