"""
Agentic Payments Use Case - Strands Implementation.

Comprehensive payment processing with validation, routing, and reconciliation
using the Strands agent framework.

The use case is automatically registered with the AVA registry on import.
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

__all__ = [
    "AgenticPaymentsOrchestrator",
    "run_agentic_payments",
    "PaymentRequest",
    "PaymentResponse",
]
