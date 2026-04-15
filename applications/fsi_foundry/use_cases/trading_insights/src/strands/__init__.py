"""
Trading Insights Use Case - Strands Implementation.

Trading insights assessment for capital markets using the Strands agent framework.
The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import TradingInsightsOrchestrator, run_trading_insights
from .models import InsightsRequest, InsightsResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="trading_insights",
    config=RegisteredAgent(
        entry_point=run_trading_insights,
        request_model=InsightsRequest,
        response_model=InsightsResponse,
    )
)

__all__ = [
    "TradingInsightsOrchestrator",
    "run_trading_insights",
    "InsightsRequest",
    "InsightsResponse",
]
