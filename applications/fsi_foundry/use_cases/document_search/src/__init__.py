"""
Document Search Use Case.

AI-powered document search for banking operations to find policies,
procedures, and compliance documents quickly.
Supports multiple agent frameworks: LangGraph (default) and Strands.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- langchain_langgraph (default): Uses LangChain/LangGraph implementation
- strands: Uses Strands agent framework implementation

The use case is automatically registered with the AVA registry on import.
"""

import os
from base.registry import register_agent, RegisteredAgent

# Get framework selection from environment
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

# Import and register based on framework selection
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_document_search
    from strands.models import SearchRequest, SearchResponse

    # Register Strands implementation
    register_agent("document_search", RegisteredAgent(
        entry_point=run_document_search,
        request_model=SearchRequest,
        response_model=SearchResponse,
    ))
else:
    # Default to LangChain/LangGraph
    from langchain_langgraph.orchestrator import run_document_search
    from langchain_langgraph.models import SearchRequest, SearchResponse

    # Register LangGraph implementation
    register_agent("document_search", RegisteredAgent(
        entry_point=run_document_search,
        request_model=SearchRequest,
        response_model=SearchResponse,
    ))

__all__ = [
    "run_document_search",
    "SearchRequest",
    "SearchResponse",
]
