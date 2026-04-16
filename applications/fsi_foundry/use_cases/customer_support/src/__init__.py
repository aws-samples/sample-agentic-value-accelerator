"""
Customer Support Use Case.

AI-powered customer support for banking with ticket classification,
resolution suggestions, and escalation management.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation

The use case is automatically registered with the AVA registry on import.
"""

import os
from base.registry import register_agent, RegisteredAgent

# Get framework selection from environment
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

# Import and register based on framework selection
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_customer_support
    from strands.models import SupportRequest, SupportResponse

    register_agent("customer_support", RegisteredAgent(
        entry_point=run_customer_support,
        request_model=SupportRequest,
        response_model=SupportResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_customer_support
    from langchain_langgraph.models import SupportRequest, SupportResponse

    register_agent("customer_support", RegisteredAgent(
        entry_point=run_customer_support,
        request_model=SupportRequest,
        response_model=SupportResponse,
    ))

__all__ = [
    "run_customer_support",
    "SupportRequest",
    "SupportResponse",
]
