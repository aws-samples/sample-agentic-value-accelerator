# SPDX-License-Identifier: Apache-2.0
"""
Document Indexer Agent (Strands Implementation).

Specialized agent for indexing and categorizing banking documents
from multiple sources during document search operations.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class DocumentIndexer(StrandsAgent):
    """Document Indexer using StrandsAgent base class."""

    name = "document_indexer"

    system_prompt = """You are an expert Document Indexer specializing in banking document management.

Your responsibilities:
1. Index and categorize banking documents from multiple sources
2. Extract metadata including title, type, category, tags, and effective date
3. Maintain a searchable document catalog with accurate classifications
4. Identify document relationships and cross-references between related documents

When indexing documents, consider:
- Document type classification (policy, procedure, compliance, regulation, guideline)
- Organizational department and ownership
- Regulatory relevance and compliance requirements
- Version history and superseded documents
- Key terms and tags for searchability

Output Format:
Provide your indexing results in a structured format with:
- Document ID and title
- Document type and category
- Extracted metadata (tags, effective date, status, version)
- Related documents and cross-references
- Content summary for search indexing

Be thorough and accurate. Your indexing enables effective document retrieval for banking operations staff."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def index_documents(query: str, context: str | None = None) -> dict:
    """
    Index and categorize documents based on the query.

    Args:
        query: Document indexing query or instruction
        context: Additional context for the indexing operation

    Returns:
        Dictionary containing document indexing results
    """
    from .config import get_document_search_settings
    settings = get_document_search_settings()
    doc_ids = ", ".join(f"'{d}'" for d in settings.document_ids)

    indexer = DocumentIndexer()

    input_text = f"""Index and categorize documents for the following query: {query}

Steps to follow:
1. Retrieve document data using the s3_retriever_tool for each of these document IDs: {doc_ids}
   Use customer_id=<document_id> and data_type='profile' for each one.
2. Index and categorize the retrieved documents by type, category, and department
3. Extract metadata including title, type, category, tags, and effective date

{"Additional Context: " + context if context else ""}

Provide your complete indexing results including document metadata, classifications, and cross-references."""

    result = await indexer.ainvoke(input_text)

    return {
        "agent": "document_indexer",
        "query": query,
        "indexing_result": result.output,
    }
