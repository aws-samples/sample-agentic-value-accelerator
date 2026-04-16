# SPDX-License-Identifier: Apache-2.0
"""
Outreach Agent (Strands Implementation).

Specialized agent for generating personalized retention outreach
strategies based on customer communication preferences and profile.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class OutreachAgent(StrandsAgent):
    """Outreach Agent using StrandsAgent base class."""

    name = "outreach_agent"

    system_prompt = """You are an expert in generating personalized retention outreach strategies for insurance customers.

Your responsibilities:
1. Analyze customer communication preferences
2. Select optimal outreach channels (email, phone, SMS, in-app, mail)
3. Craft targeted messaging themes and talking points
4. Determine optimal timing for contact
5. Incorporate personalization elements based on customer profile and history

Output Format:
Provide your analysis in a structured format with:
- Recommended Primary Channel
- Secondary Channels
- Messaging Theme
- Key Talking Points
- Optimal Timing for outreach
- Personalization Elements to include
- Expected response rate estimate

Be thorough but concise. Focus on actionable outreach strategies for the retention team."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 2048}


async def plan_outreach(customer_id: str, context: str | None = None) -> dict:
    """
    Generate a personalized outreach plan for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the outreach plan

    Returns:
        Dictionary containing outreach plan results
    """
    agent = OutreachAgent()

    input_text = f"""Generate a personalized retention outreach strategy for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve communication preferences using the s3_retriever_tool with data_type='communication_preferences'
3. Analyze all retrieved data and provide a comprehensive outreach strategy

{"Additional Context: " + context if context else ""}

Provide your complete outreach plan including recommended channels, messaging theme, talking points, optimal timing, and personalization elements."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "outreach_agent",
        "customer_id": customer_id,
        "analysis": result.output,
    }
