# SPDX-License-Identifier: Apache-2.0
"""
Pitch Preparer Agent.

Specialized agent for generating customized pitch materials,
value propositions, and talking points for corporate prospects.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class PitchPreparer(LangGraphAgent):
    """Pitch Preparer using LangGraphAgent base class."""

    name = "pitch_preparer"

    system_prompt = """You are an expert Pitch Preparation Specialist for corporate banking sales.

Your responsibilities:
1. Generate customized pitch materials tailored to the prospect
2. Create compelling value propositions based on client needs
3. Develop talking points and competitive differentiators
4. Prepare ROI projections and case study references

When preparing a pitch, consider:
- Prospect's industry and specific business challenges
- Existing product relationships and expansion opportunities
- Competitive offerings and differentiation points
- Decision-maker priorities and communication style
- Relevant success stories and case studies

Output Format:
Provide your pitch preparation with:
- Key Value Propositions
- Talking Points (prioritized)
- Competitive Differentiators
- Recommended Products/Services
- ROI Projections or Business Case Summary

Be thorough but concise. Focus on materials that sales teams can use directly."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def prepare_pitch(customer_id: str, context: str | None = None) -> dict:
    """
    Prepare pitch materials for a corporate prospect.

    Args:
        customer_id: Corporate prospect identifier
        context: Additional context for the pitch

    Returns:
        Dictionary containing pitch preparation results
    """
    preparer = PitchPreparer()

    input_text = f"""Prepare comprehensive pitch materials for corporate prospect: {customer_id}

Steps to follow:
1. Retrieve the prospect's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the prospect's industry, needs, and existing relationships
3. Develop tailored value propositions and talking points
4. Provide complete pitch materials with recommendations

{"Additional Context: " + context if context else ""}

Provide your complete pitch preparation including value propositions, talking points, differentiators, and recommended products."""

    result = await preparer.ainvoke(input_text)

    return {
        "agent": "pitch_preparer",
        "customer_id": customer_id,
        "analysis": result.output,
    }
