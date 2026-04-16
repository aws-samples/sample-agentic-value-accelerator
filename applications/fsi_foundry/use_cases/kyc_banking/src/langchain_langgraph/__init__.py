"""
KYC Risk Assessment Use Case.

This module provides Know Your Customer risk assessment for corporate banking,
including credit analysis and compliance checks.
"""

from .orchestrator import KYCOrchestrator, run_kyc_assessment
from .models import AssessmentRequest, AssessmentResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

# Register the KYC use case as an agent using the async entry point
register_agent(
    name="kyc_banking",
    config=RegisteredAgent(
        entry_point=run_kyc_assessment,
        request_model=AssessmentRequest,
        response_model=AssessmentResponse,
    )
)

__all__ = ["KYCOrchestrator", "AssessmentRequest", "AssessmentResponse", "run_kyc_assessment"]
