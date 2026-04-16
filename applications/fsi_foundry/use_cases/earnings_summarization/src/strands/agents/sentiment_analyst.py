"""Sentiment Analyst Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class SentimentAnalyst(StrandsAgent):
    name = "sentiment_analyst"
    system_prompt = """You are a Sentiment Analyst for earnings call analysis.

Responsibilities:
1. Analyze management tone and confidence levels
2. Detect sentiment shifts between prepared remarks and Q&A
3. Assess language patterns indicating optimism or concern
4. Compare sentiment against prior quarter calls

Output: Sentiment rating, confidence assessment, tone shifts, and notable language patterns."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def analyze_sentiment(entity_id: str, context: str | None = None) -> dict:
    agent = SentimentAnalyst()
    input_text = f"""Analyze sentiment from earnings call for: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Analyze management tone and sentiment indicators
3. Provide sentiment rating with confidence

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "sentiment_analyst", "entity_id": entity_id, "sentiment": result.output}
