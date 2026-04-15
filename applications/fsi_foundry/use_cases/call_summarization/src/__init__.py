"""Call Summarization Use Case. Supports LangGraph (default) and Strands frameworks."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_call_summarization
    from strands.models import SummarizationRequest, SummarizationResponse
else:
    from langchain_langgraph.orchestrator import run_call_summarization
    from langchain_langgraph.models import SummarizationRequest, SummarizationResponse
register_agent("call_summarization", RegisteredAgent(
    entry_point=run_call_summarization, request_model=SummarizationRequest, response_model=SummarizationResponse))
__all__ = ["run_call_summarization", "SummarizationRequest", "SummarizationResponse"]
