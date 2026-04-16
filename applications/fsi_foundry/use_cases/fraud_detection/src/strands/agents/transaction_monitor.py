"""Transaction Monitor Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TransactionMonitor(StrandsAgent):
    name = "transaction_monitor"
    system_prompt = """You are an expert Transaction Monitor specializing in real-time fraud detection.

Your responsibilities:
1. Monitor transactions in real-time for suspicious patterns
2. Detect velocity anomalies (unusual frequency or amounts)
3. Identify geographic inconsistencies
4. Flag structuring attempts and round-tripping
5. Assess transaction risk scores

Output Format:
- Risk Score (0-100)
- Suspicious Transactions identified
- Velocity Analysis results
- Geographic Anomalies detected
- Structuring Indicators found
- Recommended immediate actions"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def monitor_transactions(customer_id: str, context: str | None = None) -> dict:
    agent = TransactionMonitor()
    input_text = f"""Monitor transactions for account: {customer_id}

Steps:
1. Retrieve the account profile using s3_retriever_tool with data_type='profile'
2. Analyze transaction patterns for suspicious activity
3. Provide risk assessment with evidence

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "transaction_monitor", "customer_id": customer_id, "analysis": result.output}
