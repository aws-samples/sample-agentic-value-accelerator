"""
Claims Management Use Case.

AI-powered claims management for insurance companies.
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
    from strands.orchestrator import run_claims_management
    from strands.models import ClaimRequest, ClaimResponse

    register_agent("claims_management", RegisteredAgent(
        entry_point=run_claims_management,
        request_model=ClaimRequest,
        response_model=ClaimResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_claims_management
    from langchain_langgraph.models import ClaimRequest, ClaimResponse

    register_agent("claims_management", RegisteredAgent(
        entry_point=run_claims_management,
        request_model=ClaimRequest,
        response_model=ClaimResponse,
    ))

__all__ = [
    "run_claims_management",
    "ClaimRequest",
    "ClaimResponse",
]
