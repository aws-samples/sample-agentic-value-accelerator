"""
Agentic Payments Use Case.

This module provides payment processing with validation, routing, and reconciliation,
including fraud detection and compliance checks.
"""

from .orchestrator import AgenticPaymentsOrchestrator, run_agentic_payments
from .models import PaymentRequest, PaymentResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

# Register the agentic_payments use case as an agent using the async entry point
register_agent(
    name="agentic_payments",
    config=RegisteredAgent(
        entry_point=run_agentic_payments,
        request_model=PaymentRequest,
        response_model=PaymentResponse,
    )
)

__all__ = ["AgenticPaymentsOrchestrator", "PaymentRequest", "PaymentResponse", "run_agentic_payments"]
