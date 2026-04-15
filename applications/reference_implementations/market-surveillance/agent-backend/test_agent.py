#!/usr/bin/env python3
"""
Simple test script to invoke the agent locally without the dev server.
"""

import asyncio
import os
from agents.coordinator import create_coordinator_agent

# Set environment variables
os.environ["CONFIG_BUCKET"] = "market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>"
os.environ["AWS_REGION"] = "us-east-1"

# Database configuration (update with your values)
os.environ["DB_HOST"] = "your-db-host.rds.amazonaws.com"
os.environ["DB_PORT"] = "1521"
os.environ["DB_SERVICE_NAME"] = "ORCL"
os.environ["DB_USERNAME"] = "db_user"

# Note: Need to assign DB_PASSWORD


async def test_agent():
    """Test the agent with various queries using streaming responses."""
    print("=" * 80)
    print("MARKET SURVEILLANCE AGENT - LOCAL TEST (STREAMING)")
    print("=" * 80)
    
    # Create coordinator agent
    print("\n[1/7] Creating coordinator agent...")
    agent = create_coordinator_agent(
        user_id="test-user",
        session_id="test-session"
    )
    print("✓ Agent created successfully\n")
    
    # Test 1: Ask what analysis the agent can do
    print("=" * 80)
    print("TEST 1: Agent Capabilities")
    print("=" * 80)
    print("\nQuery: What types of analysis can you perform?\n")
    print("Streaming response:")
    print("-" * 80)
    
    async for event in agent.stream_async("What types of analysis can you perform?"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 2: Ask about surveillance rules (test analyst agent awareness)
    print("\n\n" + "=" * 80)
    print("TEST 2: Rules Awareness")
    print("=" * 80)
    print("\nQuery: What rules are involved in investigating a market surveillance alert?\n")
    print("Streaming response:")
    print("-" * 80)

    async for event in agent.stream_async("What rules are involved in investigating a market surveillance alert?"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 3: List all tables
    print("\n\n" + "=" * 80)
    print("TEST 3: List All Tables")
    print("=" * 80)
    print("\nQuery: What tables are in the database?\n")
    print("Streaming response:")
    print("-" * 80)
    
    async for event in agent.stream_async("What tables are in the database?"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 4: Get schema for a specific table
    print("\n\n" + "=" * 80)
    print("TEST 4: Get Table Schema")
    print("=" * 80)
    print("\nQuery: Show me the schema for the Fact_Trade table\n")
    print("Streaming response:")
    print("-" * 80)
    
    async for event in agent.stream_async("Show me the schema for the Fact_Trade table"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 5: Query for data (will show SQL statement)
    print("\n\n" + "=" * 80)
    print("TEST 5: Data Enrichment - Get Sample Data")
    print("=" * 80)
    print("\nQuery: Show me 10 sample trades from the Fact_Trade table\n")
    print("Streaming response:")
    print("-" * 80)
    
    async for event in agent.stream_async("Show me 10 sample trades from the Fact_Trade table"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 6: Complex query with aggregation
    print("\n\n" + "=" * 80)
    print("TEST 6: Complex Query - Count Trades")
    print("=" * 80)
    print("\nQuery: How many trades are in the Fact_Trade table?\n")
    print("Streaming response:")
    print("-" * 80)
    
    async for event in agent.stream_async("How many trades are in the Fact_Trade table?"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Test 7: General knowledge question
    print("\n\n" + "=" * 80)
    print("TEST 7: General Knowledge - Market Surveillance")
    print("=" * 80)
    print("\nQuery: What is market surveillance?\n")
    print("Streaming response:")
    print("-" * 80)

    async for event in agent.stream_async("What is market surveillance?"):
        if "data" in event and event["data"]:
            print(event["data"], end="", flush=True)
    
    print("\n" + "-" * 80)
    
    # Summary
    print("\n\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print("✓ All tests completed successfully with streaming responses!")
    print("\nTested capabilities:")
    print("  1. Agent capabilities awareness (config loading)")
    print("  2. FR rules awareness (FR analyst agent routing)")
    print("  3. Data Contract Agent - List tables (streaming)")
    print("  4. Data Contract Agent - Get table schema (streaming)")
    print("  5. Data Enrichment Agent - Generate SQL queries (streaming)")
    print("  6. Data Enrichment Agent - Count queries (streaming)")
    print("  7. General knowledge responses (streaming)")
    print("\nNote: SQL queries are currently in print-only mode.")
    print("      Enable execution once database tables are created.")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_agent())
