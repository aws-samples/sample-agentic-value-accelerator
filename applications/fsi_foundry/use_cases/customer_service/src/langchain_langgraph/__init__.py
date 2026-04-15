"""
Customer Service Use Case.

This module provides AI-powered customer service for banking support,
including inquiry handling, transaction investigation, and product advisory.
"""

from .orchestrator import CustomerServiceOrchestrator, run_customer_service
from .models import ServiceRequest, ServiceResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

# Register the customer service use case as an agent using the async entry point
register_agent(
    name="customer_service",
    config=RegisteredAgent(
        entry_point=run_customer_service,
        request_model=ServiceRequest,
        response_model=ServiceResponse,
    )
)

__all__ = ["CustomerServiceOrchestrator", "ServiceRequest", "ServiceResponse", "run_customer_service"]
