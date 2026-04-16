"""
Research Credit Memo Use Case - Strands Implementation.

Credit memo generation for capital markets using the Strands agent framework.
"""

from .orchestrator import ResearchCreditMemoOrchestrator, run_research_credit_memo
from .models import MemoRequest, MemoResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="research_credit_memo",
    config=RegisteredAgent(
        entry_point=run_research_credit_memo,
        request_model=MemoRequest,
        response_model=MemoResponse,
    )
)

__all__ = [
    "ResearchCreditMemoOrchestrator",
    "run_research_credit_memo",
    "MemoRequest",
    "MemoResponse",
]
