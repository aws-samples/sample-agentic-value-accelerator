"""
Trading Insights Use Case.

This module provides trading insights assessment for capital markets,
including signal generation, cross-asset analysis, and scenario modeling.
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

__all__ = ["TradingInsightsOrchestrator", "run_trading_insights", "InsightsRequest", "InsightsResponse"]
