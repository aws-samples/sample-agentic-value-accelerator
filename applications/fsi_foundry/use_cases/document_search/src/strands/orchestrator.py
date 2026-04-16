"""
Document Search Orchestrator (Strands Implementation).

Orchestrates specialist agents (Document Indexer, Search Agent)
for comprehensive document search in banking operations.
"""

import json
import re
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import DocumentIndexer, SearchAgent
from .agents.document_indexer import index_documents
from .agents.search_agent import search_documents
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    SearchRequest,
    SearchResponse,
    SearchResult,
    DocumentType,
    RelevanceLevel,
    DocumentStatus,
)


class DocumentSearchOrchestrator(StrandsOrchestrator):
    """
    Document Search Orchestrator using StrandsOrchestrator base class.

    Coordinates Document Indexer and Search Agent for
    comprehensive document search and retrieval.
    """

    name = "document_search_orchestrator"

    system_prompt = """You are a Senior Document Search Coordinator for a banking institution.

Your role is to:
1. Coordinate specialist agents (Document Indexer, Search Agent)
2. Synthesize their findings into a comprehensive, ranked search response
3. Ensure document searches return the most relevant and up-to-date results

When creating the final summary, consider:
- Relevance of results to the original query
- Document currency and status (active vs. archived/superseded)
- Document type alignment with the requested category
- Cross-references between related documents
- Clear ranking rationale for the returned results

Be concise but thorough. Your summary will be used by banking operations staff to quickly locate policies, procedures, and compliance documents."""

    def __init__(self):
        super().__init__(
            agents={
                "document_indexer": DocumentIndexer(),
                "search_agent": SearchAgent(),
            }
        )

    def run_assessment(
        self,
        query: str,
        document_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the document search workflow.

        Args:
            query: Search query string
            document_type: Type of document to search (full, policy, procedure, etc.)
            context: Additional context for the search

        Returns:
            Dictionary with search results
        """
        indexer_result = None
        search_result = None

        input_text = self._build_input_text(query, context)

        if document_type == "full":
            # Run both agents in parallel
            results = self.run_parallel(
                ["document_indexer", "search_agent"],
                input_text
            )
            indexer_result = {
                "agent": "document_indexer",
                "query": query,
                "indexing_result": results["document_indexer"].output,
            }
            search_result = {
                "agent": "search_agent",
                "query": query,
                "search_result": results["search_agent"].output,
            }
        else:
            # Specific document type - still run both agents with type filter
            type_input = f"{input_text}\n\nFilter results to document type: {document_type}"
            results = self.run_parallel(
                ["document_indexer", "search_agent"],
                type_input
            )
            indexer_result = {
                "agent": "document_indexer",
                "query": query,
                "indexing_result": results["document_indexer"].output,
            }
            search_result = {
                "agent": "search_agent",
                "query": query,
                "search_result": results["search_agent"].output,
            }

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(indexer_result, search_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "query": query,
            "document_indexer_result": indexer_result,
            "search_agent_result": search_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        query: str,
        document_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.

        Args:
            query: Search query string
            document_type: Type of document to search (full, policy, procedure, etc.)
            context: Additional context for the search

        Returns:
            Dictionary with search results
        """
        import asyncio

        indexer_result = None
        search_result = None

        if document_type == "full":
            # Run both agents in parallel using the standalone functions
            indexer_result, search_result = await asyncio.gather(
                index_documents(query, context),
                search_documents(query, context)
            )
        else:
            # Specific document type - still run both agents with type filter
            type_context = f"{context or ''}\nFilter results to document type: {document_type}".strip()
            indexer_result, search_result = await asyncio.gather(
                index_documents(query, type_context),
                search_documents(query, type_context)
            )

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(indexer_result, search_result)

        # Run synthesis in executor since Strands is synchronous
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "query": query,
            "document_indexer_result": indexer_result,
            "search_agent_result": search_result,
            "final_summary": summary,
        }

    def _build_input_text(self, query: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive document search for: {query}

Steps to follow:
1. Retrieve document data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant document metadata and content
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        indexer_result: Dict[str, Any] | None,
        search_result: Dict[str, Any] | None
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if indexer_result:
            sections.append(f"## Document Indexing Results\n{json.dumps(indexer_result, indent=2)}")
        if search_result:
            sections.append(f"## Search Results\n{json.dumps(search_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final document search summary:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Total number of relevant documents found
2. Top ranked results with relevance scores
3. Document type distribution in results
4. Key findings and recommendations
5. Suggestions for refining the search if applicable"""



async def run_document_search(request):
    """Run the assessment workflow."""
    orchestrator = DocumentSearchOrchestrator()
    final_state = await orchestrator.arun_assessment(
        query=request.query,
        document_type=request.document_type.value if hasattr(request.document_type, 'value') else str(request.document_type),
        context=getattr(request, 'additional_context', None))

    results = []; relevance_scores = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        results = []
        titles = structured.get("result_titles", [])
        snippets = structured.get("result_snippets", [])
        for i, title in enumerate(titles):
            results.append({"document_id": f"DOC{i+1:03d}", "title": title,
                "snippet": snippets[i] if i < len(snippets) else "", "relevance": "high", "document_type": "general", "status": "active"})
        relevance_scores = structured.get("relevance_scores", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return SearchResponse(
        query=request.query, search_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), results=results, relevance_scores=relevance_scores,
        summary=summary,
        raw_analysis={"document_indexer": final_state.get("document_indexer_result"), "search_agent": final_state.get("search_agent_result")},
    )
