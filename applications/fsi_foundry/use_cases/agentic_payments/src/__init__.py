"""
Agentic Payments Use Case.

Comprehensive payment processing with validation, routing, and reconciliation.
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
    from strands.orchestrator import run_agentic_payments
    from strands.models import PaymentRequest, PaymentResponse

    # Register Strands implementation
    register_agent("agentic_payments", RegisteredAgent(
        entry_point=run_agentic_payments,
        request_model=PaymentRequest,
        response_model=PaymentResponse,
    ))
else:
    # Default to LangChain/LangGraph
    from langchain_langgraph.orchestrator import run_agentic_payments
    from langchain_langgraph.models import PaymentRequest, PaymentResponse

    # Register LangGraph implementation
    register_agent("agentic_payments", RegisteredAgent(
        entry_point=run_agentic_payments,
        request_model=PaymentRequest,
        response_model=PaymentResponse,
    ))

__all__ = [
    "run_agentic_payments",
    "PaymentRequest",
    "PaymentResponse",
]
