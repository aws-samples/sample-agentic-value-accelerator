# SPDX-License-Identifier: Apache-2.0
"""
Routing Agent (Strands Implementation).

Specialized agent for determining optimal payment rails and routing
for each transaction based on cost, speed, and requirements.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class RoutingAgent(StrandsAgent):
    """Routing Agent using StrandsAgent base class."""

    name = "routing_agent"

    system_prompt = """You are an expert Payment Routing Specialist with deep knowledge of payment rails and transaction routing.

Your responsibilities:
1. Determine the optimal payment rail for each transaction
2. Evaluate routing options based on cost, speed, and reliability
3. Consider payment type, amount, currency, and destination
4. Estimate settlement times and processing costs
5. Provide alternative routing options when applicable

Available Payment Rails:
- Fedwire: High-value, real-time, irrevocable (USD domestic)
- ACH: Batch processing, lower cost, 1-3 business days (USD domestic)
- RTP: Real-Time Payments network, instant settlement (USD domestic)
- SWIFT: International wire transfers, 1-5 business days
- SEPA: European payments, euro-denominated

When routing a payment, consider:
- Transaction amount and urgency
- Payment type (wire, ACH, real-time, international, domestic)
- Currency and geographic destination
- Cost optimization vs. speed requirements
- Cut-off times and processing windows
- Counterparty capabilities and preferences
- Regulatory and compliance requirements

Output Format:
Provide your routing decision in a structured format with:
- Selected Rail (primary payment rail to use)
- Alternative Rails (backup options if available)
- Estimated Settlement Time (timeframe for completion)
- Routing Cost (estimated processing fees)
- Routing Rationale (explanation of rail selection)

Optimize for reliability and cost-effectiveness while meeting the transaction requirements."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def route_payment(payment_id: str, context: str | None = None) -> dict:
    """
    Determine optimal routing for a payment transaction.

    Args:
        payment_id: Payment identifier
        context: Additional context for routing decision

    Returns:
        Dictionary containing payment routing decision
    """
    router = RoutingAgent()

    input_text = f"""Determine optimal payment routing for payment: {payment_id}

Steps to follow:
1. Retrieve the payment profile data using the s3_retriever_tool with customer_id='{payment_id}' and data_type='profile'
2. Analyze payment type, amount, currency, and destination
3. Evaluate available payment rails (Fedwire, ACH, RTP, SWIFT, SEPA)
4. Consider cost, speed, and reliability tradeoffs
5. Provide complete routing recommendation

{"Additional Context: " + context if context else ""}

Provide your complete routing decision including selected rail, alternatives, settlement time, cost, and rationale."""

    result = await router.ainvoke(input_text)

    return {
        "agent": "routing_agent",
        "payment_id": payment_id,
        "routing": result.output,
    }
