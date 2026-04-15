"""
Research Credit Memo Use Case.

AI-powered research and credit memo generation for capital markets.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_research_credit_memo
    from strands.models import MemoRequest, MemoResponse

    register_agent("research_credit_memo", RegisteredAgent(
        entry_point=run_research_credit_memo,
        request_model=MemoRequest,
        response_model=MemoResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_research_credit_memo
    from langchain_langgraph.models import MemoRequest, MemoResponse

    register_agent("research_credit_memo", RegisteredAgent(
        entry_point=run_research_credit_memo,
        request_model=MemoRequest,
        response_model=MemoResponse,
    ))

__all__ = [
    "run_research_credit_memo",
    "MemoRequest",
    "MemoResponse",
]
