"""Earnings Summarization - Strands Implementation."""
from .orchestrator import EarningsSummarizationOrchestrator, run_earnings_summarization
from .models import SummarizationRequest, SummarizationResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="earnings_summarization", config=RegisteredAgent(entry_point=run_earnings_summarization, request_model=SummarizationRequest, response_model=SummarizationResponse))
__all__ = ["EarningsSummarizationOrchestrator", "run_earnings_summarization", "SummarizationRequest", "SummarizationResponse"]
