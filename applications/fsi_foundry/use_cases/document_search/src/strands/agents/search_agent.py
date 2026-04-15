# SPDX-License-Identifier: Apache-2.0
"""
Search Agent (Strands Implementation).

Specialized agent for performing semantic search across the banking
document corpus and returning ranked, relevant results.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class SearchAgent(StrandsAgent):
    """Search Agent using StrandsAgent base class."""

    name = "search_agent"

    system_prompt = """You are an expert Document Search Specialist for a banking institution.

Your responsibilities:
1. Perform semantic search across the document corpus to find relevant documents
2. Rank results by relevance to the query, considering content match and context
3. Provide contextual snippets highlighting the most relevant matching content
4. Filter results by document type and status to ensure accuracy

When searching documents, consider:
- Semantic similarity between the query and document content
- Document type alignment with the search intent
- Document status (prioritize active over archived or superseded)
- Recency and version currency of documents
- Cross-references that may lead to additional relevant results

Output Format:
Provide your search results in a structured format with:
- Ranked list of matching documents with relevance scores
- Contextual snippets from each matching document
- Document metadata (type, status, effective date)
- Search summary explaining the ranking rationale
- Suggestions for related searches if applicable

Be precise and relevant. Banking operations staff rely on your results to quickly locate critical policies and procedures."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def search_documents(query: str, context: str | None = None) -> dict:
    """
    Perform semantic search across the document corpus.

    Args:
        query: Search query string
        context: Additional context to refine the search

    Returns:
        Dictionary containing ranked search results
    """
    from .config import get_document_search_settings
    settings = get_document_search_settings()
    doc_ids = ", ".join(f"'{d}'" for d in settings.document_ids)

    searcher = SearchAgent()

    input_text = f"""Perform a semantic search for the following query: {query}

Steps to follow:
1. Retrieve documents using the s3_retriever_tool for each of these document IDs: {doc_ids}
   Use customer_id=<document_id> and data_type='profile' for each one.
2. Perform semantic search across the retrieved documents
3. Rank results by relevance to the query

{"Additional Context: " + context if context else ""}

Provide your complete search results including ranked documents, relevance scores, contextual snippets, and a search summary."""

    result = await searcher.ainvoke(input_text)

    return {
        "agent": "search_agent",
        "query": query,
        "search_result": result.output,
    }
