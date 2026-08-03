"""AVA Data Lake MCP Server.

A production-ready MCP server for querying AWS Glue-cataloged data lakes via Athena.
Designed for deployment on Amazon Bedrock AgentCore Runtime (Streamable HTTP transport).

Tools:
    - list_databases: Discover available Glue databases
    - list_tables: List tables in a database
    - describe_table: Get table schema and metadata
    - query: Execute SQL queries via Athena

Environment Variables:
    - AWS_REGION: AWS region (default: us-east-1)
    - GLUE_DATABASES: Comma-separated list of allowed databases (empty = all)
    - ATHENA_WORKGROUP: Athena workgroup for query execution (default: primary)

Transport:
    Streamable HTTP on 0.0.0.0:8000/mcp (AgentCore Runtime contract)
"""

import logging
import os

from mcp.server.fastmcp import FastMCP

from src.handlers.glue_handler import GlueCatalogHandler
from src.handlers.athena_handler import AthenaQueryHandler

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("datalake-mcp")

# Server instructions (visible to LLM agents connecting to this server)
SERVER_INSTRUCTIONS = """# AVA Data Lake MCP Server

This server provides read-only access to an AWS Glue-cataloged data lake.

## Available Tools

1. **list_databases** — Discover which databases are available
2. **list_tables** — See what tables exist in a database
3. **describe_table** — Get the full schema (column names and types) for a table
4. **query** — Execute SQL queries via Amazon Athena (SELECT only)

## Workflow

1. Start by calling `list_databases` to see what's available
2. Call `list_tables` for a database of interest
3. Call `describe_table` to understand the schema before querying
4. Use `query` to run SQL against the tables

## Constraints

- Only SELECT queries are allowed (no INSERT, UPDATE, DELETE, DROP)
- Results are limited to 1000 rows maximum
- Access is scoped to specific databases configured at deployment time
"""

# Create server
mcp = FastMCP(
    "ava-datalake-mcp-server",
    instructions=SERVER_INSTRUCTIONS,
    host="0.0.0.0",
    stateless_http=True,
)

# Register handlers
GlueCatalogHandler(mcp)
AthenaQueryHandler(mcp)

logger.info(
    "Data Lake MCP Server initialized | region=%s | databases=%s | workgroup=%s",
    os.environ.get("AWS_REGION", "us-east-1"),
    os.environ.get("GLUE_DATABASES", "(all)"),
    os.environ.get("ATHENA_WORKGROUP", "primary"),
)

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
