"""Test client for the Data Lake MCP Server.

Usage:
    uv run --with mcp python test_mcp_client.py
"""

import asyncio

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

GATEWAY_URL = "PLACEHOLDER"


async def main():
    print(f"Connecting to: {GATEWAY_URL}\n")

    async with streamable_http_client(GATEWAY_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("✓ Session initialized\n")

            # List tools and build name map
            tools = await session.list_tools()
            print(f"Available tools ({len(tools.tools)}):")
            tool_names = {}
            for tool in tools.tools:
                # Extract the short name (after ___)
                short_name = tool.name.split("___")[-1] if "___" in tool.name else tool.name
                tool_names[short_name] = tool.name
                print(f"  - {tool.name}")
            print()

            # Helper to call tool by short name
            async def call(short_name, **kwargs):
                full_name = tool_names.get(short_name, short_name)
                print(f"--- {short_name} ---")
                result = await session.call_tool(full_name, arguments=kwargs)
                for content in result.content:
                    if hasattr(content, "text"):
                        print(content.text)
                print()

            # Test all tools
            await call("list_databases")
            await call("list_tables", database="fsi_trading")
            await call("describe_table", database="fsi_trading", table="trades")
            await call("query", sql="SELECT symbol, COUNT(*) as cnt FROM fsi_trading.trades GROUP BY symbol LIMIT 5", max_rows=5)


if __name__ == "__main__":
    asyncio.run(main())
