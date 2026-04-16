"""
Life Insurance Agent Use Case - LangGraph Implementation.

AI-powered life insurance advisory using LangChain/LangGraph.
"""

from .orchestrator import LifeInsuranceAgentOrchestrator, run_life_insurance_agent
from .models import InsuranceRequest, InsuranceResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="life_insurance_agent",
    config=RegisteredAgent(
        entry_point=run_life_insurance_agent,
        request_model=InsuranceRequest,
        response_model=InsuranceResponse,
    )
)

__all__ = [
    "LifeInsuranceAgentOrchestrator",
    "run_life_insurance_agent",
    "InsuranceRequest",
    "InsuranceResponse",
]
