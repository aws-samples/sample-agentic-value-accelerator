"""
Customer Service Use Case.

AI-powered customer service for banking support, handling account inquiries,
transaction investigation, and product advisory.
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
    from strands.orchestrator import run_customer_service
    from strands.models import ServiceRequest, ServiceResponse

    # Register Strands implementation
    register_agent("customer_service", RegisteredAgent(
        entry_point=run_customer_service,
        request_model=ServiceRequest,
        response_model=ServiceResponse,
    ))
else:
    # Default to LangChain/LangGraph
    from langchain_langgraph.orchestrator import run_customer_service
    from langchain_langgraph.models import ServiceRequest, ServiceResponse

    # Register LangGraph implementation
    register_agent("customer_service", RegisteredAgent(
        entry_point=run_customer_service,
        request_model=ServiceRequest,
        response_model=ServiceResponse,
    ))

__all__ = [
    "run_customer_service",
    "ServiceRequest",
    "ServiceResponse",
]
