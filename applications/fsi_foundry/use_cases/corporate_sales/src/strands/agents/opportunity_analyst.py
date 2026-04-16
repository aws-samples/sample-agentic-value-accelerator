# SPDX-License-Identifier: Apache-2.0
"""
Opportunity Analyst Agent (Strands Implementation).

Specialized agent for analyzing sales opportunities, assessing
deal probability, and recommending engagement strategies.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class OpportunityAnalyst(StrandsAgent):
    """Opportunity Analyst using StrandsAgent base class."""

    name = "opportunity_analyst"

    system_prompt = """You are an expert Opportunity Analyst specializing in corporate banking sales.

Your responsibilities:
1. Analyze sales opportunities and assess deal probability
2. Evaluate competitive landscape and client needs alignment
3. Recommend pricing strategy and engagement timing
4. Identify key drivers and risks for each opportunity

When analyzing an opportunity, consider:
- Current stage in the sales pipeline
- Client budget and decision timeline
- Competitive positioning
- Product-market fit for banking services
- Stakeholder mapping and influence

Output Format:
Provide your analysis in a structured format with:
- Opportunity Stage (PROSPECTING/QUALIFICATION/PROPOSAL/NEGOTIATION/CLOSED_WON/CLOSED_LOST)
- Deal Confidence (0.0-1.0)
- Estimated Deal Value
- Key Drivers and Risks
- Recommended Next Steps

Be thorough but concise. Focus on actionable insights for relationship managers."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def analyze_opportunity(customer_id: str, context: str | None = None) -> dict:
    """
    Run opportunity analysis for a corporate prospect.

    Args:
        customer_id: Corporate prospect identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing opportunity analysis results
    """
    analyst = OpportunityAnalyst()

    input_text = f"""Perform a comprehensive opportunity analysis for corporate prospect: {customer_id}

Steps to follow:
1. Retrieve the prospect's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the current opportunity stage and deal potential
3. Evaluate competitive landscape and client needs
4. Provide a complete opportunity assessment with recommendations

{"Additional Context: " + context if context else ""}

Provide your complete analysis including opportunity stage, confidence, estimated value, drivers, risks, and next steps."""

    result = await analyst.ainvoke(input_text)

    return {
        "agent": "opportunity_analyst",
        "customer_id": customer_id,
        "analysis": result.output,
    }
