# SPDX-License-Identifier: Apache-2.0
"""
Escalation Agent (Strands Implementation).

Specialized agent for determining when and how to escalate
support tickets to human agents.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class EscalationAgent(StrandsAgent):
    """Escalation Agent using StrandsAgent base class."""

    name = "escalation_agent"

    system_prompt = """You are an expert Escalation Manager for a banking customer support system.

Your responsibilities:
1. Evaluate whether a ticket requires human agent escalation
2. Determine the appropriate team for escalation
3. Assess priority overrides based on issue severity
4. Provide clear escalation reasoning

When evaluating escalation, consider:
- Complexity of the issue beyond automated resolution
- Customer tier and account value
- Regulatory or compliance implications
- Previous failed resolution attempts
- Time sensitivity and SLA breach risk
- Potential financial impact on the customer

Output Format:
Provide your escalation decision with:
- Status: NOT_NEEDED / RECOMMENDED / REQUIRED
- Reason: Clear explanation for the decision
- Recommended Team: Specific team or department
- Priority Override: If urgency should be elevated
- Estimated Resolution Time: Expected time to resolve after escalation

Be decisive and clear. Your assessment determines resource allocation."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def evaluate_escalation(customer_id: str, context: str | None = None) -> dict:
    """
    Evaluate escalation needs for a customer support request.

    Args:
        customer_id: Customer identifier
        context: Additional context for escalation evaluation

    Returns:
        Dictionary containing escalation evaluation results
    """
    agent = EscalationAgent()

    input_text = f"""Evaluate escalation needs for the support request from customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Assess the severity and complexity of the issue
3. Provide a complete escalation evaluation

{"Additional Context: " + context if context else ""}

Provide your complete escalation assessment including status, reason, recommended team, and priority."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "escalation_agent",
        "customer_id": customer_id,
        "escalation": result.output,
    }
