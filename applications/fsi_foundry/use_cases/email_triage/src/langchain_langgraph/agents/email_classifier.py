"""Email Classifier Agent. Classifies emails by category, urgency, and sender importance."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class EmailClassifier(LangGraphAgent):
    name = "email_classifier"
    system_prompt = """You are an expert Email Classification Specialist for capital markets trading desks.

Your responsibilities:
1. Classify emails by content category (client requests, trade instructions, compliance alerts, market updates, internal memos, meeting requests)
2. Assess sender importance based on role, seniority, and client relationship
3. Determine urgency level considering deadlines and market sensitivity
4. Identify key topics and relevance to active workflows

Output Format:
- Category (CLIENT_REQUEST/TRADE_INSTRUCTION/COMPLIANCE_ALERT/MARKET_UPDATE/INTERNAL_MEMO/MEETING_REQUEST)
- Urgency Level (LOW/MEDIUM/HIGH/CRITICAL)
- Sender Importance Score (0.0-1.0)
- Key Topics identified
- Relevance to active positions or workflows"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def classify_email(entity_id: str, context: str | None = None) -> dict:
    agent = EmailClassifier()
    input_text = f"""Classify email: {entity_id}

Steps:
1. Retrieve email data using s3_retriever_tool with data_type='profile'
2. Analyze sender, subject, and content
3. Classify category, urgency, and importance

{"Additional Context: " + context if context else ""}

Provide complete classification results."""
    result = await agent.ainvoke(input_text)
    return {"agent": "email_classifier", "customer_id": entity_id, "analysis": result.output}
