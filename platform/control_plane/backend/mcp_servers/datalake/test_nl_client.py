"""Natural language test client — ask questions about the data lake.

Uses Strands Agent with MCP tools from the Gateway endpoint.

Usage:
    uv run test_nl_client.py
    uv run test_nl_client.py "Your custom question here"
"""
# /// script
# dependencies = ["strands-agents", "mcp"]
# ///

import sys

from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamable_http_client

GATEWAY_URL = "PLACEHOLDER"

SAMPLE_QUESTIONS = [
    "What databases and tables are available?",
    "What are the top 5 most traded symbols by total notional value?",
    "How many high severity alerts are currently open?",
    "What is the average trade price for AAPL?",
    "Show me the total exposure by counterparty, sorted by gross exposure descending, limit 5",
]

mcp_client = MCPClient(lambda: streamable_http_client(GATEWAY_URL))

with mcp_client:
    tools = mcp_client.list_tools_sync()

    agent = Agent(
        model=BedrockModel(model_id="us.anthropic.claude-opus-4-6-v1"),
        system_prompt="""You are a data analyst with access to a financial data lake.
Use the available tools to discover databases, tables, schemas, and query data.
Always check the schema before writing SQL queries.
When querying, use fully qualified table names (database.table).""",
        tools=tools,
    )

    # Use custom question or run all samples
    if len(sys.argv) > 1:
        questions = [" ".join(sys.argv[1:])]
    else:
        questions = SAMPLE_QUESTIONS

    for question in questions:
        print(f"\n{'='*60}")
        print(f"Question: {question}")
        print(f"{'='*60}\n")
        result = agent(question)
        print(f"\nAnswer: {result.message}\n")
