# SPDX-License-Identifier: Apache-2.0
"""
Ticket Classifier Agent (Strands Implementation).

Specialized agent for classifying support tickets by category,
urgency, and required expertise.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TicketClassifier(StrandsAgent):
    """Ticket Classifier using StrandsAgent base class."""

    name = "ticket_classifier"

    system_prompt = """You are an expert Ticket Classifier for a banking customer support system.

Your responsibilities:
1. Classify support tickets by category (billing, technical, account, general)
2. Assess urgency level (low, medium, high, critical)
3. Identify required expertise areas for resolution
4. Tag tickets for efficient routing

When classifying a ticket, consider:
- Customer account type and history
- Nature of the issue described
- Impact on customer operations
- Time sensitivity and SLA requirements
- Previous similar tickets and their resolutions

Output Format:
Provide your classification with:
- Category: GENERAL / BILLING / TECHNICAL / ACCOUNT
- Urgency: LOW / MEDIUM / HIGH / CRITICAL
- Required Expertise: List of expertise areas needed
- Tags: Relevant classification tags
- Routing Recommendation: Suggested team or queue

Be accurate and consistent. Your classification drives ticket routing."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def classify_ticket(customer_id: str, context: str | None = None) -> dict:
    """
    Run ticket classification for a customer support request.

    Args:
        customer_id: Customer identifier
        context: Additional context for classification

    Returns:
        Dictionary containing ticket classification results
    """
    classifier = TicketClassifier()

    input_text = f"""Classify the support ticket for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the ticket context and customer history
3. Provide a complete ticket classification

{"Additional Context: " + context if context else ""}

Provide your complete classification including category, urgency, required expertise, and tags."""

    result = await classifier.ainvoke(input_text)

    return {
        "agent": "ticket_classifier",
        "customer_id": customer_id,
        "classification": result.output,
    }
