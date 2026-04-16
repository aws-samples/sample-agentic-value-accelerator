"""Earnings Summarization Use Case. Supports LangGraph (default) and Strands."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_earnings_summarization
    from strands.models import SummarizationRequest, SummarizationResponse
else:
    from langchain_langgraph.orchestrator import run_earnings_summarization
    from langchain_langgraph.models import SummarizationRequest, SummarizationResponse
register_agent("earnings_summarization", RegisteredAgent(entry_point=run_earnings_summarization, request_model=SummarizationRequest, response_model=SummarizationResponse))
__all__ = ["run_earnings_summarization", "SummarizationRequest", "SummarizationResponse"]
