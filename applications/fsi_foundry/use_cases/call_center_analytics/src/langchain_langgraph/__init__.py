"""
Call Center Analytics Use Case.

Call center performance optimization using LangChain/LangGraph.
"""

from .orchestrator import CallCenterAnalyticsOrchestrator, run_call_center_analytics
from .models import AnalyticsRequest, AnalyticsResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="call_center_analytics",
    config=RegisteredAgent(
        entry_point=run_call_center_analytics,
        request_model=AnalyticsRequest,
        response_model=AnalyticsResponse,
    )
)

__all__ = ["CallCenterAnalyticsOrchestrator", "AnalyticsRequest", "AnalyticsResponse", "run_call_center_analytics"]
