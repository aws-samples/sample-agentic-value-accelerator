"""
Media Screener Agent.

Screens news sources for adverse mentions of monitored entities.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class MediaScreener(LangGraphAgent):
    name = "media_screener"

    system_prompt = """You are an expert Media Screening Analyst for a financial institution.

Your responsibilities:
1. Screen news sources, media outlets, and public records for adverse mentions
2. Identify negative coverage including legal proceedings, regulatory actions, sanctions, fraud allegations
3. Catalog findings with source metadata, publication dates, and relevance scores
4. Assess the credibility and reach of media sources

Output Format:
- Articles Screened count
- Adverse Mentions count
- Categories of adverse media found
- Key Findings with source references
- Overall assessment of media landscape for the entity

Be thorough and evidence-based. Focus on actionable findings."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def screen_media(entity_id: str, context: str | None = None) -> dict:
    agent = MediaScreener()
    input_text = f"""Screen media sources for adverse mentions of entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Analyze flagged articles and media sources
3. Provide a complete media screening assessment

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "media_screener", "entity_id": entity_id, "analysis": result.output}
