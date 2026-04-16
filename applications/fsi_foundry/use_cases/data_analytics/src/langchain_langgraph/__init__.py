"""
Data Analytics Use Case.

Data analytics assessment for capital markets including data exploration,
statistical analysis, and insight generation.
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

__all__ = ["DataAnalyticsOrchestrator", "AnalyticsRequest", "AnalyticsResponse", "run_data_analytics"]
