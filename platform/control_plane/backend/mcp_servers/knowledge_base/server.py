"""AVA Knowledge Base MCP Server.

A production-ready MCP server for querying Amazon Bedrock Knowledge Bases.
Designed for deployment on Amazon Bedrock AgentCore Runtime (Streamable HTTP transport).

Tools:
    - retrieve: Semantic search — returns relevant document chunks with citations
    - retrieve_and_generate: RAG — LLM-synthesized answer grounded in the knowledge base
    - get_status: Get KB status, last sync time, and data source info
    - sync: Trigger a re-sync of the data source

Environment Variables:
    - KNOWLEDGE_BASE_ID: Bedrock Knowledge Base ID (required)
    - DATA_SOURCE_ID: Data Source ID for sync operations (optional)
    - MODEL_ID: Model for retrieve_and_generate (default: us.anthropic.claude-sonnet-4-20250514-v2:0)
    - AWS_REGION: AWS region (default: us-east-1)
    - LOG_LEVEL: Logging level (default: INFO)

Transport:
    Streamable HTTP on 0.0.0.0:8000/mcp (AgentCore Runtime contract)
"""

import logging
import os

from mcp.server.fastmcp import FastMCP

from src.handlers.kb_handler import KnowledgeBaseHandler

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("kb-mcp")

# Server instructions (visible to LLM agents connecting to this server)
SERVER_INSTRUCTIONS = """# AVA Knowledge Base MCP Server

This server provides access to an Amazon Bedrock Knowledge Base for semantic search
and retrieval-augmented generation (RAG).

## Available Tools

1. **retrieve** — Semantic search over the knowledge base. Returns relevant document
   chunks with source citations and relevance scores.
2. **retrieve_and_generate** — Full RAG pipeline. Searches the knowledge base and
   synthesizes a natural language answer grounded in the retrieved documents.
3. **get_status** — Get the knowledge base status, last sync time, and data source info.
4. **sync** — Trigger a re-sync of the data source to ingest new/updated documents.

## Workflow

1. Use `retrieve` for factual lookups where you need exact source text and citations.
2. Use `retrieve_and_generate` when you need a synthesized answer from multiple sources.
3. Use `get_status` to check if the knowledge base is up to date.
4. Use `sync` after uploading new documents to make them searchable.

## Constraints

- Results are scoped to the knowledge base configured at deployment time.
- `retrieve_and_generate` uses the model configured at deployment time for synthesis.
"""

# Create server
mcp = FastMCP(
    "ava-kb-mcp-server",
    instructions=SERVER_INSTRUCTIONS,
    host="0.0.0.0",
    stateless_http=True,
)

# Register handlers
KnowledgeBaseHandler(mcp)

logger.info(
    "Knowledge Base MCP Server initialized | kb_id=%s | region=%s | model=%s",
    os.environ.get("KNOWLEDGE_BASE_ID", "(not set)"),
    os.environ.get("AWS_REGION", "us-east-1"),
    os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v2:0"),
)

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
