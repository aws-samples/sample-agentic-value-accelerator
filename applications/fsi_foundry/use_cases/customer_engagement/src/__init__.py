"""
Customer Engagement Use Case.

AI-powered customer engagement for insurance to improve retention through
churn prediction, personalized outreach, and policy optimization.
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
    from strands.orchestrator import run_customer_engagement
    from strands.models import EngagementRequest, EngagementResponse

    # Register Strands implementation
    register_agent("customer_engagement", RegisteredAgent(
        entry_point=run_customer_engagement,
        request_model=EngagementRequest,
        response_model=EngagementResponse,
    ))
else:
    # Default to LangChain/LangGraph
    from langchain_langgraph.orchestrator import run_customer_engagement
    from langchain_langgraph.models import EngagementRequest, EngagementResponse

    # Register LangGraph implementation
    register_agent("customer_engagement", RegisteredAgent(
        entry_point=run_customer_engagement,
        request_model=EngagementRequest,
        response_model=EngagementResponse,
    ))

__all__ = [
    "run_customer_engagement",
    "EngagementRequest",
    "EngagementResponse",
]
