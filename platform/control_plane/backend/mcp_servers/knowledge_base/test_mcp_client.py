"""Test client for the Knowledge Base MCP Server.

Usage:
    uv run test_mcp_client.py
"""
# /// script
# dependencies = ["mcp"]
# ///

import asyncio

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

GATEWAY_URL = "https://ava-knowledge-033a8ac7-gateway-bvbbkvgiz8.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"


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
                short_name = tool.name.split("___")[-1] if "___" in tool.name else tool.name
                tool_names[short_name] = tool.name
                print(f"  - {tool.name}")
            print()

            # Helper
            async def call(short_name, **kwargs):
                full_name = tool_names.get(short_name, short_name)
                print(f"--- {short_name} ---")
                result = await session.call_tool(full_name, arguments=kwargs)
                for content in result.content:
                    if hasattr(content, "text"):
                        print(content.text)
                print()

            # Test get_status
            await call("get_status")

            # Test retrieve
            await call("retrieve", query="Amazon board members?", num_results=3)

            # Test retrieve_and_generate
            await call("retrieve_and_generate", query="Who are the key amazon board members")

            # Test sync
            # await call("sync")


if __name__ == "__main__":
    asyncio.run(main())
