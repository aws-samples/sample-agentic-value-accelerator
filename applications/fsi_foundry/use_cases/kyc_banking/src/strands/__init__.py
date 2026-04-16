"""
KYC (Know Your Customer) Use Case - Strands Implementation.

Comprehensive KYC risk assessment for corporate banking onboarding
using the Strands agent framework.

The use case is automatically registered with the AVA registry on import.
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

__all__ = [
    "KYCOrchestrator",
    "run_kyc_assessment",
    "AssessmentRequest",
    "AssessmentResponse",
]
