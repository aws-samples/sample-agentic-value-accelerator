# SPDX-License-Identifier: Apache-2.0
"""Trend Analyst Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class TrendAnalyst(LangGraphAgent):
    name = "trend_analyst"
    system_prompt = """You are an expert Economic Trend Analyst. Identify trends across key indicators (GDP, inflation, employment, interest rates, trade balance), detect correlations and leading/lagging relationships, generate forecasts with confidence levels, and flag inflection points."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def analyze_trends(entity_id: str, context: str | None = None) -> dict:
    agent = TrendAnalyst()
    input_text = f"""Analyze economic trends for entity: {entity_id}\n\nSteps:\n1. Retrieve the entity profile using s3_retriever_tool with customer_id set to the entity ID and data_type='profile'\n2. Identify trends and correlations\n3. Provide forecast assessment\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "trend_analyst", "entity_id": entity_id, "trends": result.output}
