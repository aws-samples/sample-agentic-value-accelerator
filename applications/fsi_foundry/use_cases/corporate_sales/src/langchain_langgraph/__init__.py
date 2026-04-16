"""
Corporate Sales Use Case.

This module provides corporate sales assessment for banking,
including lead scoring, opportunity analysis, and pitch preparation.
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

__all__ = ["CorporateSalesOrchestrator", "run_corporate_sales", "SalesRequest", "SalesResponse"]
