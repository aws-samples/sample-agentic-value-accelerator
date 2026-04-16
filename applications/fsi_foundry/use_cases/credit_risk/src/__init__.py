"""Credit Risk Assessment Use Case."""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_credit_risk
    from strands.models import AssessmentRequest, AssessmentResponse
    register_agent("credit_risk", RegisteredAgent(entry_point=run_credit_risk, request_model=AssessmentRequest, response_model=AssessmentResponse))
else:
    from langchain_langgraph.orchestrator import run_credit_risk
    from langchain_langgraph.models import AssessmentRequest, AssessmentResponse
    register_agent("credit_risk", RegisteredAgent(entry_point=run_credit_risk, request_model=AssessmentRequest, response_model=AssessmentResponse))

__all__ = ["run_credit_risk", "AssessmentRequest", "AssessmentResponse"]
