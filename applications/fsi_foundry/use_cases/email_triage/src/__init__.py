"""Email Triage Use Case. Dual-framework support via AGENT_FRAMEWORK env var."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_email_triage
    from strands.models import TriageRequest, TriageResponse
else:
    from langchain_langgraph.orchestrator import run_email_triage
    from langchain_langgraph.models import TriageRequest, TriageResponse
register_agent("email_triage", RegisteredAgent(entry_point=run_email_triage, request_model=TriageRequest, response_model=TriageResponse))
__all__ = ["run_email_triage", "TriageRequest", "TriageResponse"]
