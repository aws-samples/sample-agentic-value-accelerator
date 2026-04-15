"""
Call Center Analytics Use Case - Strands Implementation.

Call center performance optimization using the Strands agent framework.
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

__all__ = [
    "CallCenterAnalyticsOrchestrator",
    "run_call_center_analytics",
    "AnalyticsRequest",
    "AnalyticsResponse",
]
