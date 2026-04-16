"""
Life Insurance Agent Use Case.

AI-powered life insurance advisory with needs analysis, product matching,
and underwriting assistance. Supports multiple agent frameworks.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_life_insurance_agent
    from strands.models import InsuranceRequest, InsuranceResponse

    register_agent("life_insurance_agent", RegisteredAgent(
        entry_point=run_life_insurance_agent,
        request_model=InsuranceRequest,
        response_model=InsuranceResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_life_insurance_agent
    from langchain_langgraph.models import InsuranceRequest, InsuranceResponse

    register_agent("life_insurance_agent", RegisteredAgent(
        entry_point=run_life_insurance_agent,
        request_model=InsuranceRequest,
        response_model=InsuranceResponse,
    ))

__all__ = [
    "run_life_insurance_agent",
    "InsuranceRequest",
    "InsuranceResponse",
]
