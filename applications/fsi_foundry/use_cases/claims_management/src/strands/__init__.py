"""
Claims Management Use Case - Strands Implementation.

Claims management for insurance using the Strands agent framework.
The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import ClaimsManagementOrchestrator, run_claims_management
from .models import ClaimRequest, ClaimResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="claims_management",
    config=RegisteredAgent(
        entry_point=run_claims_management,
        request_model=ClaimRequest,
        response_model=ClaimResponse,
    )
)

__all__ = [
    "ClaimsManagementOrchestrator",
    "run_claims_management",
    "ClaimRequest",
    "ClaimResponse",
]
