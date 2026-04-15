"""
Data Analytics Use Case - Strands Implementation.

Data analytics assessment for capital markets using the Strands agent framework.
"""

from .orchestrator import DataAnalyticsOrchestrator, run_data_analytics
from .models import AnalyticsRequest, AnalyticsResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="data_analytics",
    config=RegisteredAgent(
        entry_point=run_data_analytics,
        request_model=AnalyticsRequest,
        response_model=AnalyticsResponse,
    )
)

__all__ = [
    "DataAnalyticsOrchestrator",
    "run_data_analytics",
    "AnalyticsRequest",
    "AnalyticsResponse",
]
