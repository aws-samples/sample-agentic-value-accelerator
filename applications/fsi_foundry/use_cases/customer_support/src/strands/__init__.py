"""
Customer Support Use Case - Strands Implementation.

AI-powered customer support for banking with ticket classification,
resolution suggestions, and escalation management using the Strands agent framework.

The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import CustomerSupportOrchestrator, run_customer_support
from .models import SupportRequest, SupportResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="customer_support",
    config=RegisteredAgent(
        entry_point=run_customer_support,
        request_model=SupportRequest,
        response_model=SupportResponse,
    )
)

__all__ = [
    "CustomerSupportOrchestrator",
    "run_customer_support",
    "SupportRequest",
    "SupportResponse",
]
