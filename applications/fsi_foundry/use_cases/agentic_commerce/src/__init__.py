"""Agentic Commerce Use Case."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_agentic_commerce
    from strands.models import CommerceRequest, CommerceResponse
else:
    from langchain_langgraph.orchestrator import run_agentic_commerce
    from langchain_langgraph.models import CommerceRequest, CommerceResponse
register_agent("agentic_commerce", RegisteredAgent(entry_point=run_agentic_commerce, request_model=CommerceRequest, response_model=CommerceResponse))
__all__ = ["run_agentic_commerce", "CommerceRequest", "CommerceResponse"]
