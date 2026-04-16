# SPDX-License-Identifier: Apache-2.0
"""Data Aggregator Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class DataAggregator(LangGraphAgent):
    name = "data_aggregator"
    system_prompt = """You are an expert Economic Data Aggregator. Aggregate economic data from multiple sources, normalize datasets across formats and time periods, identify data quality issues, and prepare structured summaries for trend analysis."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def aggregate_data(entity_id: str, context: str | None = None) -> dict:
    agent = DataAggregator()
    input_text = f"""Aggregate economic data for entity: {entity_id}\n\nSteps:\n1. Retrieve the entity profile using s3_retriever_tool with customer_id set to the entity ID and data_type='profile'\n2. Aggregate and normalize data\n3. Provide structured summary\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "data_aggregator", "entity_id": entity_id, "aggregation": result.output}
