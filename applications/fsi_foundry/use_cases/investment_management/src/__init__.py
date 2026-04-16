"""
Investment Management Use Case.

AI-powered investment management for portfolio optimization.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_investment_management
    from strands.models import ManagementRequest, ManagementResponse

    register_agent("investment_management", RegisteredAgent(
        entry_point=run_investment_management,
        request_model=ManagementRequest,
        response_model=ManagementResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_investment_management
    from langchain_langgraph.models import ManagementRequest, ManagementResponse

    register_agent("investment_management", RegisteredAgent(
        entry_point=run_investment_management,
        request_model=ManagementRequest,
        response_model=ManagementResponse,
    ))

__all__ = [
    "run_investment_management",
    "ManagementRequest",
    "ManagementResponse",
]
