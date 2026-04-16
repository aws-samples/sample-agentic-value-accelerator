"""Call Summarization - Strands Implementation."""
from .orchestrator import CallSummarizationOrchestrator, run_call_summarization
from .models import SummarizationRequest, SummarizationResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="call_summarization", config=RegisteredAgent(
    entry_point=run_call_summarization, request_model=SummarizationRequest, response_model=SummarizationResponse))
__all__ = ["CallSummarizationOrchestrator", "run_call_summarization", "SummarizationRequest", "SummarizationResponse"]
