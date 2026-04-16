"""Compliance Investigation Use Case. Dual-framework support via AGENT_FRAMEWORK env var."""
import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_compliance_investigation
    from strands.models import InvestigationRequest, InvestigationResponse
else:
    from langchain_langgraph.orchestrator import run_compliance_investigation
    from langchain_langgraph.models import InvestigationRequest, InvestigationResponse

register_agent("compliance_investigation", RegisteredAgent(
    entry_point=run_compliance_investigation, request_model=InvestigationRequest, response_model=InvestigationResponse))

__all__ = ["run_compliance_investigation", "InvestigationRequest", "InvestigationResponse"]
