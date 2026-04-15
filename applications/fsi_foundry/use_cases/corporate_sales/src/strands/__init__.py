"""
Corporate Sales Use Case - Strands Implementation.

Corporate sales assessment for banking using the Strands agent framework.
The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import CorporateSalesOrchestrator, run_corporate_sales
from .models import SalesRequest, SalesResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="corporate_sales",
    config=RegisteredAgent(
        entry_point=run_corporate_sales,
        request_model=SalesRequest,
        response_model=SalesResponse,
    )
)

__all__ = [
    "CorporateSalesOrchestrator",
    "run_corporate_sales",
    "SalesRequest",
    "SalesResponse",
]
