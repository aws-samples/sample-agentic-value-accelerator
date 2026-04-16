"""Sentiment Analyst Agent. Analyzes customer and agent sentiment throughout the call."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class SentimentAnalyst(LangGraphAgent):
    name = "sentiment_analyst"
    system_prompt = """You are an expert Sentiment Analysis Specialist for financial services contact centers.

Your responsibilities:
1. Analyze customer sentiment throughout the call (frustration, satisfaction, confusion)
2. Analyze agent sentiment and professionalism
3. Detect emotional shifts and their triggers
4. Score overall customer satisfaction (0.0-1.0)
5. Identify moments of escalation risk or de-escalation success

Output Format:
- Overall Sentiment (VERY_NEGATIVE/NEGATIVE/NEUTRAL/POSITIVE/VERY_POSITIVE)
- Customer Sentiment with key moments
- Agent Sentiment and professionalism assessment
- Satisfaction Score (0.0-1.0)
- Emotional Shifts with timestamps/triggers
- Escalation risk indicators"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_sentiment(call_id: str, context: str | None = None) -> dict:
    agent = SentimentAnalyst()
    input_text = f"""Analyze sentiment for call: {call_id}

Steps:
1. Retrieve call data using s3_retriever_tool with customer_id set to the call ID and data_type='profile'
2. Analyze customer and agent sentiment across call segments
3. Identify emotional shifts and satisfaction indicators

{"Additional Context: " + context if context else ""}

Provide complete sentiment analysis."""
    result = await agent.ainvoke(input_text)
    return {"agent": "sentiment_analyst", "customer_id": call_id, "analysis": result.output}
