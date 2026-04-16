"""
Document Search Orchestrator.

Orchestrates specialist agents (Document Indexer, Search Agent)
for comprehensive document search in banking operations.
"""

import json
import re
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.document_search.agents import DocumentIndexer, SearchAgent
from use_cases.document_search.agents.document_indexer import index_documents
from use_cases.document_search.agents.search_agent import search_documents
from use_cases.document_search.models import (
    SearchRequest,
    SearchResponse,
    SearchResult,
    DocumentType,
    RelevanceLevel,
    DocumentStatus,
)

from pydantic import BaseModel, Field

class DocumentSearchSynthesisSchema(BaseModel):
    """Structured synthesis output schema for document_search."""
    result_titles: list[str] = Field(default_factory=list, description="Titles of found documents")
    result_snippets: list[str] = Field(default_factory=list, description="Relevant content snippets")
    relevance_scores: list[float] = Field(default_factory=list, description="Relevance scores 0 to 1")
    summary: str = Field(..., description="Executive summary of search results")



class DocumentSearchState(TypedDict):
    """State managed by the document search orchestrator graph."""
    messages: Annotated[list, add_messages]
    query: str
    document_type: str
    document_indexer_result: dict | None
    search_agent_result: dict | None
    final_summary: str | None


class DocumentSearchOrchestrator(LangGraphOrchestrator):
    """
    Document Search Orchestrator using LangGraphOrchestrator base class.

    Coordinates Document Indexer and Search Agent for
    comprehensive document search and retrieval.
    """

    name = "document_search_orchestrator"
    state_schema = DocumentSearchState

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

    def build_graph(self) -> StateGraph:
        """Build the document search workflow graph."""
        workflow = StateGraph(DocumentSearchState)

        # Add nodes
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("document_indexer", self._document_indexer_node)
        workflow.add_node("search_agent", self._search_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # Set conditional entry point
        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "document_indexer": "document_indexer",
                "search_agent": "search_agent",
            },
        )

        # Define edges
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "document_indexer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "search_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: DocumentSearchState) -> Literal["parallel_assessment", "document_indexer", "search_agent", "synthesize"]:
        """Route to the next node based on current state."""
        document_type = state.get("document_type", "full")
        indexer_done = state.get("document_indexer_result") is not None
        search_done = state.get("search_agent_result") is not None

        # Full search - run both agents in parallel
        if document_type == "full":
            if not indexer_done and not search_done:
                return "parallel_assessment"
            return "synthesize"

        # Specific document type - still run both agents with type filter
        if not indexer_done and not search_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: DocumentSearchState) -> DocumentSearchState:
        """Execute both agents in parallel using base class helper."""
        query = state["query"]
        context = self._extract_context(state)


        # Also run the standalone functions for backward compatibility
        indexer_result, search_result = await self._run_searches_parallel(query, context)

        return {
            **state,
            "document_indexer_result": indexer_result,
            "search_agent_result": search_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Document Indexing Complete: {json.dumps(indexer_result, indent=2)}"),
                AIMessage(content=f"Search Complete: {json.dumps(search_result, indent=2)}"),
            ],
        }

    async def _run_searches_parallel(self, query: str, context: str | None):
        """Run document indexing and search in parallel."""
        import asyncio
        indexer_task = index_documents(query, context)
        search_task = search_documents(query, context)
        return await asyncio.gather(indexer_task, search_task)

    async def _document_indexer_node(self, state: DocumentSearchState) -> DocumentSearchState:
        """Execute document indexing."""
        query = state["query"]
        context = self._extract_context(state)
        result = await index_documents(query, context)

        return {
            **state,
            "document_indexer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Document Indexing Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _search_agent_node(self, state: DocumentSearchState) -> DocumentSearchState:
        """Execute document search."""
        query = state["query"]
        context = self._extract_context(state)
        result = await search_documents(query, context)

        return {
            **state,
            "search_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Search Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "query", "document_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(DocumentSearchSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: DocumentSearchState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_document_search(request):
    """Run the assessment workflow."""
    orchestrator = DocumentSearchOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.query}")],
        "query": request.query,
        "document_type": request.document_type.value if hasattr(request.document_type, 'value') else str(request.document_type),
    }
    for key in [k for k in DocumentSearchState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    results = []; relevance_scores = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
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
