"""
Investment Management Use Case - Strands Implementation.

Portfolio optimization through allocation, rebalancing, and performance attribution.
"""

from .orchestrator import InvestmentManagementOrchestrator, run_investment_management
from .models import ManagementRequest, ManagementResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="investment_management",
    config=RegisteredAgent(
        entry_point=run_investment_management,
        request_model=ManagementRequest,
        response_model=ManagementResponse,
    )
)

__all__ = [
    "InvestmentManagementOrchestrator",
    "run_investment_management",
    "ManagementRequest",
    "ManagementResponse",
]
