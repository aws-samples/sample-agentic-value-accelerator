"""
Trading Insights Use Case.

AI-powered trading insights for capital markets professionals.
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
    from strands.orchestrator import run_trading_insights
    from strands.models import InsightsRequest, InsightsResponse

    register_agent("trading_insights", RegisteredAgent(
        entry_point=run_trading_insights,
        request_model=InsightsRequest,
        response_model=InsightsResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_trading_insights
    from langchain_langgraph.models import InsightsRequest, InsightsResponse

    register_agent("trading_insights", RegisteredAgent(
        entry_point=run_trading_insights,
        request_model=InsightsRequest,
        response_model=InsightsResponse,
    ))

__all__ = [
    "run_trading_insights",
    "InsightsRequest",
    "InsightsResponse",
]
