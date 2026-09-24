"""
KYC (Know Your Customer) Use Case.
Comprehensive KYC risk assessment for corporate banking onboarding.

LangGraph is the only implementation. The Strands variant was removed from this
reference implementation — offering a framework whose code is not shipped meant a
deploy could select it and produce a runtime that fails to start. FSI Foundry's
use cases keep their dual-framework layout; this one does not.

The use case is automatically registered with the AVA registry on import.
"""
from base.registry import register_agent, RegisteredAgent

from langchain_langgraph.orchestrator import run_kyc_assessment
from langchain_langgraph.models import AssessmentRequest, AssessmentResponse

register_agent("kyc_governance_insights", RegisteredAgent(
    entry_point=run_kyc_assessment,
    request_model=AssessmentRequest,
    response_model=AssessmentResponse,
))

__all__ = [
    "run_kyc_assessment",
    "AssessmentRequest",
    "AssessmentResponse",
]
