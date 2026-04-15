"""Credit Risk - Strands Implementation."""

from .orchestrator import CreditRiskOrchestrator, run_credit_risk
from .models import AssessmentRequest, AssessmentResponse
from base.registry import register_agent, RegisteredAgent

register_agent(name="credit_risk", config=RegisteredAgent(
    entry_point=run_credit_risk, request_model=AssessmentRequest, response_model=AssessmentResponse))

__all__ = ["CreditRiskOrchestrator", "run_credit_risk", "AssessmentRequest", "AssessmentResponse"]
