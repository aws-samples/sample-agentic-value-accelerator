"""Govern Knowledge Bases — real Bedrock Knowledge Base inventory, read-through.

Live AWS source:
  - bedrock-agent:ListKnowledgeBases → the account's RAG knowledge bases
  - bedrock-agent:GetKnowledgeBase  → details including embedding model, storage config
  - bedrock-agent:ListDataSources   → data sources feeding each KB

This surfaces the account's RAG infrastructure for governance: what knowledge bases
exist, their embedding models, storage backends (OpenSearch/Pinecone/etc.), and
data sources (S3/Confluence/SharePoint/etc.). Honest live/source/note flags,
graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from models.govern_region_provenance import RegionProvenance


class KnowledgeBaseDataSource(BaseModel):
    """One data source feeding a knowledge base."""

    data_source_id: str
    name: str
    status: str = Field("", description="AVAILABLE | DELETING | DELETE_UNSUCCESSFUL")
    type: str = Field("", description="S3 | CONFLUENCE | SHAREPOINT | SALESFORCE | WEB")
    updated_at: Optional[str] = None


class KnowledgeBaseSummary(BaseModel):
    """One knowledge base from ListKnowledgeBases + GetKnowledgeBase enrichment."""

    knowledge_base_id: str
    name: str
    status: str = Field("", description="CREATING | ACTIVE | DELETING | UPDATING | FAILED | DELETE_UNSUCCESSFUL")
    description: Optional[str] = None
    embedding_model_arn: Optional[str] = Field(None, description="Embedding model ARN or short name")
    storage_type: Optional[str] = Field(None, description="OPENSEARCH_SERVERLESS | PINECONE | RDS | REDIS_ENTERPRISE_CLOUD | MONGO_DB_ATLAS")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    data_source_count: int = 0
    data_sources: List[KnowledgeBaseDataSource] = Field(default_factory=list)


class KnowledgeBasesResponse(BaseModel):
    """The account's Bedrock Knowledge Bases inventory."""

    knowledge_bases: List[KnowledgeBaseSummary] = Field(default_factory=list)
    total: int = 0
    active: int = 0
    by_storage_type: dict = Field(default_factory=dict, description="Count per storage backend")
    by_embedding_model: dict = Field(default_factory=dict, description="Count per embedding model")
    total_data_sources: int = 0
    live: bool
    source: str
    note: Optional[str] = None
    regions: Optional[RegionProvenance] = Field(
        default=None,
        description=(
            "Which governed regions this aggregate covers. When `unreachable` is "
            "non-empty every total here is a floor, not a count."
        ),
    )
