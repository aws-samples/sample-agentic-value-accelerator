"""
Document Search Use Case - Strands Implementation.

AI-powered document search for banking operations using the Strands agent framework.
Indexes, categorizes, and semantically searches banking policies, procedures,
and compliance documents.

The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import DocumentSearchOrchestrator, run_document_search
from .models import SearchRequest, SearchResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

# Register the document search use case as an agent using the async entry point
register_agent(
    name="document_search",
    config=RegisteredAgent(
        entry_point=run_document_search,
        request_model=SearchRequest,
        response_model=SearchResponse,
    )
)

__all__ = [
    "DocumentSearchOrchestrator",
    "run_document_search",
    "SearchRequest",
    "SearchResponse",
]
