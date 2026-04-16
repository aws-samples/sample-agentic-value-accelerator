"""
Customer Engagement Use Case - Strands Implementation.

AI-powered customer engagement for insurance to improve retention through
churn prediction, personalized outreach, and policy optimization
using the Strands agent framework.

The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import CustomerEngagementOrchestrator, run_customer_engagement
from .models import EngagementRequest, EngagementResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

# Register the customer engagement use case as an agent using the async entry point
register_agent(
    name="customer_engagement",
    config=RegisteredAgent(
        entry_point=run_customer_engagement,
        request_model=EngagementRequest,
        response_model=EngagementResponse,
    )
)

__all__ = [
    "CustomerEngagementOrchestrator",
    "run_customer_engagement",
    "EngagementRequest",
    "EngagementResponse",
]
