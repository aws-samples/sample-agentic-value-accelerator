# SPDX-License-Identifier: Apache-2.0
"""Research Writer Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class ResearchWriter(LangGraphAgent):
    name = "research_writer"
    system_prompt = """You are an expert Economic Research Writer. Generate structured research reports, synthesize data and trend analysis into coherent narratives, produce actionable insights and investment implications, and format output for capital markets analysts."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def write_research(entity_id: str, context: str | None = None) -> dict:
    agent = ResearchWriter()
    input_text = f"""Write economic research report for entity: {entity_id}\n\nSteps:\n1. Retrieve the entity profile using s3_retriever_tool with customer_id set to the entity ID and data_type='profile'\n2. Synthesize findings into research report\n3. Provide actionable insights\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "research_writer", "entity_id": entity_id, "report": result.output}
