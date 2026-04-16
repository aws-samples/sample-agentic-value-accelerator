"""
Payment Operations Use Case.

Payment exception handling and settlement operations.
Supports langchain_langgraph and strands frameworks.
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_payment_operations
    from strands.models import OperationsRequest, OperationsResponse

    register_agent("payment_operations", RegisteredAgent(
        entry_point=run_payment_operations,
        request_model=OperationsRequest,
        response_model=OperationsResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_payment_operations
    from langchain_langgraph.models import OperationsRequest, OperationsResponse

    register_agent("payment_operations", RegisteredAgent(
        entry_point=run_payment_operations,
        request_model=OperationsRequest,
        response_model=OperationsResponse,
    ))

__all__ = ["run_payment_operations", "OperationsRequest", "OperationsResponse"]
