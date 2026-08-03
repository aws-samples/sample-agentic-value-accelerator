"""Knowledge Base handler — retrieve, RAG, status, and sync tools."""

import json
import os
from typing import Annotated, Optional

from mcp.server.fastmcp import Context, FastMCP
from mcp.types import CallToolResult, TextContent
from pydantic import Field

from ..utils.aws_helper import get_bedrock_agent_client, get_bedrock_agent_runtime_client

KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
DATA_SOURCE_ID = os.environ.get("DATA_SOURCE_ID", "")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-opus-4-6-v1")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")


class KnowledgeBaseHandler:
    """Handler for Amazon Bedrock Knowledge Base operations."""

    def __init__(self, mcp: FastMCP):
        self.mcp = mcp
        self.runtime_client = get_bedrock_agent_runtime_client()
        self.agent_client = get_bedrock_agent_client()

        self.mcp.tool(name="retrieve")(self.retrieve)
        self.mcp.tool(name="retrieve_and_generate")(self.retrieve_and_generate)
        self.mcp.tool(name="get_status")(self.get_status)
        self.mcp.tool(name="sync")(self.sync)

    async def retrieve(
        self,
        ctx: Context,
        query: Annotated[str, Field(description="Natural language query to search the knowledge base")],
        num_results: Annotated[Optional[int], Field(description="Number of results to return (1-25, default 5)")] = 5,
    ) -> CallToolResult:
        """Semantic search over the knowledge base.

        Returns relevant document chunks with source citations and relevance scores.
        Use this when you need exact source text and want to see where information comes from.

        ## Example
        ```
        response = await retrieve(query="What is the refund policy?", num_results=5)
        ```

        Args:
            ctx: MCP context
            query: Natural language search query
            num_results: Number of results (default 5, max 25)

        Returns:
            Document chunks with content, source location, and relevance score
        """
        if not KNOWLEDGE_BASE_ID:
            return CallToolResult(isError=True, content=[TextContent(type="text", text="KNOWLEDGE_BASE_ID not configured")])

        num_results = min(max(num_results or 5, 1), 25)

        try:
            response = self.runtime_client.retrieve(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                retrievalQuery={"text": query},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {
                        "numberOfResults": num_results,
                    }
                },
            )

            results = response.get("retrievalResults", [])
            documents = []
            for result in results:
                content = result.get("content", {})
                if content.get("type") == "IMAGE":
                    continue
                documents.append({
                    "content": content.get("text", ""),
                    "location": result.get("location", {}),
                    "score": result.get("score", 0),
                })

            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Found {len(documents)} result(s)"),
                    TextContent(type="text", text=json.dumps(documents, indent=2)),
                ],
            )
        except Exception as e:
            return CallToolResult(isError=True, content=[TextContent(type="text", text=f"Retrieve error: {e}")])

    async def retrieve_and_generate(
        self,
        ctx: Context,
        query: Annotated[str, Field(description="Natural language question to answer using the knowledge base")],
    ) -> CallToolResult:
        """RAG — retrieves relevant documents and generates a synthesized answer.

        Returns an LLM-generated answer grounded in the knowledge base, with citations
        pointing to the source documents.

        ## Example
        ```
        response = await retrieve_and_generate(query="What are the AML reporting thresholds?")
        ```

        Args:
            ctx: MCP context
            query: Natural language question

        Returns:
            Synthesized answer with citations to source documents
        """
        if not KNOWLEDGE_BASE_ID:
            return CallToolResult(isError=True, content=[TextContent(type="text", text="KNOWLEDGE_BASE_ID not configured")])

        try:
            # For retrieve_and_generate, pass the model ID directly.
            # Claude 4+ models require inference profile IDs (e.g., us.anthropic.claude-opus-4-20250514-v1:0)
            # Older models accept bare model IDs (e.g., anthropic.claude-3-haiku-20240307-v1:0)
            # The API accepts both formats in the modelArn field.
            model_arn = MODEL_ID

            response = self.runtime_client.retrieve_and_generate(
                input={"text": query},
                retrieveAndGenerateConfiguration={
                    "type": "KNOWLEDGE_BASE",
                    "knowledgeBaseConfiguration": {
                        "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                        "modelArn": model_arn,
                    },
                },
            )

            output = response.get("output", {}).get("text", "")
            citations = []
            for citation in response.get("citations", []):
                for ref in citation.get("retrievedReferences", []):
                    citations.append({
                        "content": ref.get("content", {}).get("text", "")[:200],
                        "location": ref.get("location", {}),
                    })

            result = {
                "answer": output,
                "citations": citations,
            }

            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=output),
                    TextContent(type="text", text=json.dumps(result, indent=2)),
                ],
            )
        except Exception as e:
            return CallToolResult(isError=True, content=[TextContent(type="text", text=f"RAG error: {e}")])

    async def get_status(self, ctx: Context) -> CallToolResult:
        """Get knowledge base status, last sync time, and data source information.

        Returns:
            KB status, description, and data source sync details
        """
        if not KNOWLEDGE_BASE_ID:
            return CallToolResult(isError=True, content=[TextContent(type="text", text="KNOWLEDGE_BASE_ID not configured")])

        try:
            kb_resp = self.agent_client.get_knowledge_base(knowledgeBaseId=KNOWLEDGE_BASE_ID)
            kb = kb_resp.get("knowledgeBase", {})

            # Get data sources
            ds_resp = self.agent_client.list_data_sources(knowledgeBaseId=KNOWLEDGE_BASE_ID)
            data_sources = []
            for ds in ds_resp.get("dataSourceSummaries", []):
                data_sources.append({
                    "id": ds.get("dataSourceId"),
                    "name": ds.get("name"),
                    "status": ds.get("status"),
                })

            status = {
                "knowledge_base_id": KNOWLEDGE_BASE_ID,
                "name": kb.get("name", ""),
                "description": kb.get("description", ""),
                "status": kb.get("status", ""),
                "updated_at": str(kb.get("updatedAt", "")),
                "data_sources": data_sources,
            }

            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"KB '{status['name']}' is {status['status']}"),
                    TextContent(type="text", text=json.dumps(status, indent=2)),
                ],
            )
        except Exception as e:
            return CallToolResult(isError=True, content=[TextContent(type="text", text=f"Status error: {e}")])

    async def sync(self, ctx: Context) -> CallToolResult:
        """Trigger a re-sync of the knowledge base data source.

        Starts an ingestion job that processes new/updated documents in the S3 bucket.

        Returns:
            Ingestion job ID and status
        """
        if not KNOWLEDGE_BASE_ID:
            return CallToolResult(isError=True, content=[TextContent(type="text", text="KNOWLEDGE_BASE_ID not configured")])

        # Find data source ID if not configured
        ds_id = DATA_SOURCE_ID
        if not ds_id:
            try:
                ds_resp = self.agent_client.list_data_sources(knowledgeBaseId=KNOWLEDGE_BASE_ID)
                sources = ds_resp.get("dataSourceSummaries", [])
                if sources:
                    ds_id = sources[0].get("dataSourceId", "")
            except Exception:
                pass

        if not ds_id:
            return CallToolResult(isError=True, content=[TextContent(type="text", text="No data source found for this knowledge base")])

        try:
            response = self.agent_client.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=ds_id,
            )

            job = response.get("ingestionJob", {})
            result = {
                "ingestion_job_id": job.get("ingestionJobId", ""),
                "status": job.get("status", ""),
                "knowledge_base_id": KNOWLEDGE_BASE_ID,
                "data_source_id": ds_id,
            }

            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Sync started: {result['status']}"),
                    TextContent(type="text", text=json.dumps(result, indent=2)),
                ],
            )
        except Exception as e:
            return CallToolResult(isError=True, content=[TextContent(type="text", text=f"Sync error: {e}")])
