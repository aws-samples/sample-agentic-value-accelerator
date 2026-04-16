"""
Sentiment Analyst Agent.

Analyzes sentiment and severity of adverse media findings.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class SentimentAnalyst(LangGraphAgent):
    name = "sentiment_analyst"

    system_prompt = """You are an expert Sentiment Analyst for a financial institution.

Your responsibilities:
1. Classify sentiment of media findings from very negative to very positive
2. Assess impact magnitude on entity reputation
3. Track sentiment trends over time
4. Evaluate credibility and reach of media sources

Output Format:
- Overall Sentiment Level (VERY_NEGATIVE/NEGATIVE/NEUTRAL/POSITIVE/VERY_POSITIVE)
- Sentiment breakdown by category
- Trend analysis
- Impact assessment
- Source credibility evaluation

Be precise in your sentiment classifications."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_sentiment(entity_id: str, context: str | None = None) -> dict:
    agent = SentimentAnalyst()
    input_text = f"""Analyze sentiment of media coverage for entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Analyze sentiment across all flagged articles
3. Provide sentiment classification and trend analysis

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "sentiment_analyst", "entity_id": entity_id, "analysis": result.output}
