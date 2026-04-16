"""Economic Research Use Case."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_economic_research
    from strands.models import ResearchRequest, ResearchResponse
else:
    from langchain_langgraph.orchestrator import run_economic_research
    from langchain_langgraph.models import ResearchRequest, ResearchResponse
register_agent("economic_research", RegisteredAgent(entry_point=run_economic_research, request_model=ResearchRequest, response_model=ResearchResponse))
__all__ = ["run_economic_research", "ResearchRequest", "ResearchResponse"]
