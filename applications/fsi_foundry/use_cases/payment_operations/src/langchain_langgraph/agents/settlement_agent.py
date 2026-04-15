"""Settlement Agent (LangGraph)."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class SettlementAgent(LangGraphAgent):
    name = "settlement_agent"

    system_prompt = """You are a Payment Settlement Specialist in banking operations.

Your responsibilities:
1. Verify settlement readiness and clearing system status
2. Reconcile payment amounts between originator and beneficiary
3. Confirm compliance clearance for settlement
4. Track settlement timelines and flag delays

Output Format:
- Settlement Status (PENDING/SETTLED/FAILED/REQUIRES_ACTION)
- Expected or actual settlement date
- Reconciliation status (reconciled yes/no)
- Notes on any issues or delays
- Recommended next steps"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def process_settlement(customer_id: str, context: str | None = None) -> dict:
    agent = SettlementAgent()
    input_text = f"""Process settlement for payment: {customer_id}

Steps:
1. Retrieve payment data using s3_retriever_tool with data_type='profile'
2. Verify settlement readiness and compliance status
3. Provide settlement assessment

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "settlement_agent", "customer_id": customer_id, "assessment": result.output}
