# SPDX-License-Identifier: Apache-2.0
"""
Inquiry Handler Agent (Strands Implementation).

Specialized agent for classifying and routing customer inquiries,
handling FAQ-style questions, and providing initial responses.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class InquiryHandler(StrandsAgent):
    """Inquiry Handler using StrandsAgent base class."""

    name = "inquiry_handler"

    system_prompt = """You are an expert Customer Inquiry Handler for a banking institution.

Your responsibilities:
1. Classify customer inquiries by type and urgency
2. Route complex inquiries to appropriate specialists
3. Handle FAQ-style questions directly with accurate answers
4. Provide initial responses and set customer expectations

When handling a customer inquiry, consider:
- Nature of the inquiry (account, transaction, product, general)
- Urgency and priority level based on customer context
- Customer history and account standing
- Whether the inquiry can be resolved immediately or needs escalation
- Relevant banking policies and procedures

Output Format:
Provide your assessment with:
- Inquiry Classification (type and sub-type)
- Priority Level (LOW/MEDIUM/HIGH/URGENT)
- Initial Response or FAQ answer if applicable
- Routing Recommendation if specialist needed
- Estimated resolution timeframe

Be helpful, professional, and empathetic in your responses."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def handle_inquiry(customer_id: str, context: str | None = None) -> dict:
    """
    Handle a customer inquiry.

    Args:
        customer_id: Customer identifier
        context: Additional context for the inquiry

    Returns:
        Dictionary containing inquiry handling results
    """
    handler = InquiryHandler()

    input_text = f"""Handle the customer inquiry for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve service history using the s3_retriever_tool with data_type='service_history'
3. Classify the inquiry and provide routing recommendation

{"Additional Context: " + context if context else ""}

Provide your complete assessment including classification, priority, and routing recommendation."""

    result = await handler.ainvoke(input_text)

    return {
        "agent": "inquiry_handler",
        "customer_id": customer_id,
        "analysis": result.output,
    }
