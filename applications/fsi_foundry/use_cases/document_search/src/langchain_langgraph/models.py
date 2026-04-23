"""
Document Search Use Case Models.

Pydantic models for document search requests and responses.
All models are specific to the Document Search use case.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class DocumentType(str, Enum):
    """Type of document to search."""
    FULL = "full"
    POLICY = "policy"
    PROCEDURE = "procedure"
    COMPLIANCE = "compliance"
    REGULATION = "regulation"
    GUIDELINE = "guideline"


class RelevanceLevel(str, Enum):
    """Relevance level for search results."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DocumentStatus(str, Enum):
    """Status of a document in the corpus."""
    ACTIVE = "active"
    ARCHIVED = "archived"
    DRAFT = "draft"
    SUPERSEDED = "superseded"


class SearchRequest(BaseModel):
    """Request model for document search interaction."""
    query: str = Field(..., description="Search query string")
    document_type: DocumentType = Field(
        default=DocumentType.FULL,
        description="Type of document to search for"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context to refine the search"
    )


class SearchResult(BaseModel):
    """Individual search result entry."""
    document_id: str = Field(..., description="Unique document identifier")
    title: str = Field(..., description="Document title")
    snippet: str = Field(..., description="Relevant content snippet")
    relevance: str | None = Field(default=None, description="Relevance level")
    document_type: str | None = Field(default=None, description="Type of document")
    status: str | None = Field(default=None, description="Document status")


class SearchResponse(BaseModel):
    """Response model for document search interaction."""
    query: str = Field(..., description="Original search query")
    search_id: str = Field(..., description="Unique search interaction identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Search timestamp")
    results: list[SearchResult] = Field(default_factory=list, description="Ranked search results")
    relevance_scores: list[float] = Field(default_factory=list, description="Relevance scores for results")
    summary: str = Field(..., description="Executive summary of search results")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
