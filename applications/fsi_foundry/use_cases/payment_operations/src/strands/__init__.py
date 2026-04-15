"""Payment Operations - Strands Implementation."""

from .orchestrator import PaymentOpsOrchestrator, run_payment_operations
from .models import OperationsRequest, OperationsResponse

from base.registry import register_agent, RegisteredAgent

register_agent("payment_operations", RegisteredAgent(
    entry_point=run_payment_operations,
    request_model=OperationsRequest,
    response_model=OperationsResponse,
))

__all__ = ["PaymentOpsOrchestrator", "run_payment_operations", "OperationsRequest", "OperationsResponse"]
