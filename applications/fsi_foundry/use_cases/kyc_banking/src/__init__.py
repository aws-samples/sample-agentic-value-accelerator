"""
KYC (Know Your Customer) Use Case.

Comprehensive KYC risk assessment for corporate banking onboarding.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation

The use case is automatically registered with the AVA registry on import.
"""

import os
from base.registry import register_agent, RegisteredAgent

# Get framework selection from environment
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

# Import and register based on framework selection
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_kyc_assessment
    from strands.models import AssessmentRequest, AssessmentResponse
    
    # Register Strands implementation
    register_agent("kyc_banking", RegisteredAgent(
        entry_point=run_kyc_assessment,
        request_model=AssessmentRequest,
        response_model=AssessmentResponse,
    ))
else:
    # Default to LangChain/LangGraph
    from langchain_langgraph.orchestrator import run_kyc_assessment
    from langchain_langgraph.models import AssessmentRequest, AssessmentResponse
    
    # Register LangGraph implementation
    register_agent("kyc_banking", RegisteredAgent(
        entry_point=run_kyc_assessment,
        request_model=AssessmentRequest,
        response_model=AssessmentResponse,
    ))

__all__ = [
    "run_kyc_assessment",
    "AssessmentRequest", 
    "AssessmentResponse",
]
