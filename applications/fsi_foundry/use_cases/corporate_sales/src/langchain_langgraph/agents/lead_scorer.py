# SPDX-License-Identifier: Apache-2.0
"""
Lead Scorer Agent.

Specialized agent for scoring and prioritizing corporate leads
based on firmographic and behavioral data.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class LeadScorer(LangGraphAgent):
    """Lead Scorer using LangGraphAgent base class."""

    name = "lead_scorer"

    system_prompt = """You are an expert Lead Scoring Analyst specializing in corporate banking sales.

Your responsibilities:
1. Score and prioritize corporate leads based on firmographic data
2. Analyze behavioral signals such as website visits and content engagement
3. Evaluate relationship history and product fit indicators
4. Provide tier classifications and engagement recommendations

When scoring a corporate lead, consider:
- Industry sector and market position
- Annual revenue and employee count
- Existing product relationships
- Engagement history and recency
- Decision-maker accessibility

Output Format:
Provide your analysis in a structured format with:
- Lead Score (0-100, where 100 is highest priority)
- Lead Tier (HOT/WARM/COLD/UNQUALIFIED)
- Key Scoring Factors identified
- Engagement Recommendations
- Priority level and suggested timeline

Be thorough but concise. Focus on actionable insights for the sales team."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def score_lead(customer_id: str, context: str | None = None) -> dict:
    """
    Run lead scoring for a corporate prospect.

    Args:
        customer_id: Corporate prospect identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing lead scoring results
    """
    scorer = LeadScorer()

    input_text = f"""Perform a comprehensive lead scoring analysis for corporate prospect: {customer_id}

Steps to follow:
1. Retrieve the prospect's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze firmographic data (industry, revenue, employee count)
3. Evaluate engagement history and behavioral signals
4. Provide a complete lead score and tier classification

{"Additional Context: " + context if context else ""}

Provide your complete analysis including lead score, tier, key factors, and recommendations."""

    result = await scorer.ainvoke(input_text)

    return {
        "agent": "lead_scorer",
        "customer_id": customer_id,
        "analysis": result.output,
    }
