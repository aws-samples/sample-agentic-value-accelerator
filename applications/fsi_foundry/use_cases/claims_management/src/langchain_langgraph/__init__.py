"""
Claims Management Use Case.

This module provides claims management for insurance,
including claims intake, damage assessment, and settlement recommendation.
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

__all__ = ["ClaimsManagementOrchestrator", "run_claims_management", "ClaimRequest", "ClaimResponse"]
