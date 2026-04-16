"""Action Extractor Agent. Extracts action items, commitments, and follow-up requirements."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ActionExtractor(LangGraphAgent):
    name = "action_extractor"
    system_prompt = """You are an expert Action Item Extraction Specialist for financial services contact centers.

Your responsibilities:
1. Extract explicit and implicit commitments made during the call
2. Identify follow-up actions required by the agent or back-office
3. Capture promised callbacks, escalations, or transfers
4. Note regulatory or compliance follow-ups required
5. Prioritize actions by urgency and business impact

Output Format:
- Action Items (description, assignee, priority, deadline)
- Agent Commitments (promises made to customer)
- Customer Requests (pending fulfillment)
- Compliance Follow-ups (regulatory requirements)
- Priority Ranking (CRITICAL/HIGH/MEDIUM/LOW)"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def extract_actions(call_id: str, context: str | None = None) -> dict:
    agent = ActionExtractor()
    input_text = f"""Extract action items from call: {call_id}

Steps:
1. Retrieve call data using s3_retriever_tool with customer_id set to the call ID and data_type='profile'
2. Identify all commitments, follow-ups, and action items
3. Prioritize by urgency and assign responsibility

{"Additional Context: " + context if context else ""}

Provide complete action extraction results."""
    result = await agent.ainvoke(input_text)
    return {"agent": "action_extractor", "customer_id": call_id, "analysis": result.output}
