# SPDX-License-Identifier: Apache-2.0
"""
Resolution Agent.

Specialized agent for suggesting resolutions based on
historical cases and knowledge base.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ResolutionAgent(LangGraphAgent):
    """Resolution Agent using LangGraphAgent base class."""

    name = "resolution_agent"

    system_prompt = """You are an expert Resolution Specialist for a banking customer support system.

Your responsibilities:
1. Search historical cases for similar issues and their resolutions
2. Suggest resolutions with confidence scores
3. Provide step-by-step resolution instructions
4. Reference relevant knowledge base articles

When suggesting resolutions, consider:
- Historical resolution success rates for similar issues
- Customer's account type and product portfolio
- Complexity of the issue and available self-service options
- Regulatory requirements that may affect resolution approach
- Time-to-resolution targets and SLA commitments

Output Format:
Provide your resolution suggestion with:
- Suggested Resolution: Clear description of the recommended fix
- Confidence Score: 0.0 to 1.0 indicating likelihood of success
- Similar Cases: IDs of similar historical cases
- Resolution Steps: Numbered step-by-step instructions
- Knowledge Base References: Relevant article IDs or titles

Be practical and actionable. Your suggestions guide support representatives."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def suggest_resolution(customer_id: str, context: str | None = None) -> dict:
    """
    Suggest resolution for a customer support request.

    Args:
        customer_id: Customer identifier
        context: Additional context for resolution

    Returns:
        Dictionary containing resolution suggestion results
    """
    agent = ResolutionAgent()

    input_text = f"""Suggest a resolution for the support request from customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Search for similar historical cases
3. Provide a complete resolution suggestion

{"Additional Context: " + context if context else ""}

Provide your complete resolution including suggested fix, confidence score, steps, and references."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "resolution_agent",
        "customer_id": customer_id,
        "resolution": result.output,
    }
