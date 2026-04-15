"""
Corporate Sales Use Case.

AI-powered corporate sales assessment for banking professionals.
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
    from strands.orchestrator import run_corporate_sales
    from strands.models import SalesRequest, SalesResponse

    register_agent("corporate_sales", RegisteredAgent(
        entry_point=run_corporate_sales,
        request_model=SalesRequest,
        response_model=SalesResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_corporate_sales
    from langchain_langgraph.models import SalesRequest, SalesResponse

    register_agent("corporate_sales", RegisteredAgent(
        entry_point=run_corporate_sales,
        request_model=SalesRequest,
        response_model=SalesResponse,
    ))

__all__ = [
    "run_corporate_sales",
    "SalesRequest",
    "SalesResponse",
]
