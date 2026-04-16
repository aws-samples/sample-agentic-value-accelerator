"""
Call Center Analytics Use Case.

AI-powered call center performance optimization.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_call_center_analytics
    from strands.models import AnalyticsRequest, AnalyticsResponse

    register_agent("call_center_analytics", RegisteredAgent(
        entry_point=run_call_center_analytics,
        request_model=AnalyticsRequest,
        response_model=AnalyticsResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_call_center_analytics
    from langchain_langgraph.models import AnalyticsRequest, AnalyticsResponse

    register_agent("call_center_analytics", RegisteredAgent(
        entry_point=run_call_center_analytics,
        request_model=AnalyticsRequest,
        response_model=AnalyticsResponse,
    ))

__all__ = [
    "run_call_center_analytics",
    "AnalyticsRequest",
    "AnalyticsResponse",
]
