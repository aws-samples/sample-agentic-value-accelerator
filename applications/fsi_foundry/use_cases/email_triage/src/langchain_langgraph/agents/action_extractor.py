"""Action Extractor Agent. Extracts action items, deadlines, and key information from emails."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class ActionExtractor(LangGraphAgent):
    name = "action_extractor"
    system_prompt = """You are an expert Action Extraction Specialist for capital markets trading desks.

Your responsibilities:
1. Extract explicit and implicit action items from email content
2. Identify deadlines, time-sensitive requests, and SLAs
3. Capture key information: amounts, securities, counterparties, account numbers
4. Prioritize actions by urgency and business impact

Output Format:
- Action Items (with assignee if mentioned)
- Deadlines and Time Constraints
- Key Information Extracted (amounts, securities, counterparties)
- Priority Ranking of actions
- Suggested Response or Next Steps"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def extract_actions(entity_id: str, context: str | None = None) -> dict:
    agent = ActionExtractor()
    input_text = f"""Extract actions from email: {entity_id}

Steps:
1. Retrieve email data using s3_retriever_tool with data_type='profile'
2. Identify action items and deadlines
3. Extract key information and prioritize

{"Additional Context: " + context if context else ""}

Provide complete action extraction results."""
    result = await agent.ainvoke(input_text)
    return {"agent": "action_extractor", "customer_id": entity_id, "analysis": result.output}
