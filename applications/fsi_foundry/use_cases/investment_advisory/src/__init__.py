"""Investment Advisory Use Case. Supports LangGraph (default) and Strands."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_investment_advisory
    from strands.models import AdvisoryRequest, AdvisoryResponse
else:
    from langchain_langgraph.orchestrator import run_investment_advisory
    from langchain_langgraph.models import AdvisoryRequest, AdvisoryResponse
register_agent("investment_advisory", RegisteredAgent(entry_point=run_investment_advisory, request_model=AdvisoryRequest, response_model=AdvisoryResponse))
__all__ = ["run_investment_advisory", "AdvisoryRequest", "AdvisoryResponse"]
