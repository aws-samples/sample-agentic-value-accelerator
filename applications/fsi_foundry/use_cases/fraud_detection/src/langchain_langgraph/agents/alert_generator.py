"""Alert Generator Agent."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class AlertGenerator(LangGraphAgent):
    name = "alert_generator"
    system_prompt = """You are an expert Alert Generator specializing in fraud alert management.

Your responsibilities:
1. Generate and prioritize fraud alerts based on detection findings
2. Compile supporting evidence for each alert
3. Recommend investigation actions and escalation paths
4. Assess alert severity and urgency
5. Provide actionable intelligence for fraud investigators

Output Format:
- Generated Alerts with severity (INFO/WARNING/HIGH/CRITICAL)
- Evidence compilation for each alert
- Recommended investigation actions
- Escalation path recommendations
- Regulatory reporting requirements if applicable"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def generate_alerts(customer_id: str, context: str | None = None) -> dict:
    agent = AlertGenerator()
    input_text = f"""Generate fraud alerts for account: {customer_id}

Steps:
1. Retrieve the account profile using s3_retriever_tool with data_type='profile'
2. Analyze findings and generate prioritized alerts
3. Compile evidence and recommend actions

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "alert_generator", "customer_id": customer_id, "analysis": result.output}
