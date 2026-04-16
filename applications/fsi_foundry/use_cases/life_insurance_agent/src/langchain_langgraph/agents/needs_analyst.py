"""
Needs Analyst Agent (LangGraph Implementation).

Analyzes customer life insurance needs based on financial situation and life stage.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class NeedsAnalyst(LangGraphAgent):
    """Needs Analyst using LangGraphAgent base class."""

    name = "needs_analyst"

    system_prompt = """You are an expert Life Insurance Needs Analyst.

Your responsibilities:
1. Analyze customer life insurance needs based on financial situation and life stage
2. Assess income replacement requirements for dependents
3. Evaluate existing coverage gaps
4. Consider dependents, financial obligations, and future goals
5. Determine appropriate coverage levels based on debts, mortgage, and education funding needs

When analyzing an applicant, consider:
- Current life stage and family situation
- Annual income and income replacement needs
- Existing coverage from employer or individual policies
- Outstanding debts (mortgage, loans, credit cards)
- Future financial obligations (children's education, spouse retirement)
- Final expense needs

Output Format:
Provide your analysis with:
- Life Stage classification
- Recommended total coverage amount
- Coverage gap (recommended minus existing)
- Income replacement years needed
- Key needs identified
- Detailed analysis notes

Be thorough but concise. Focus on actionable coverage recommendations."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_needs(applicant_id: str, context: str | None = None) -> dict:
    """Run needs analysis for a life insurance applicant."""
    analyst = NeedsAnalyst()

    input_text = f"""Perform a comprehensive life insurance needs analysis for applicant: {applicant_id}

Steps to follow:
1. Retrieve the applicant's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze financial situation, dependents, and existing coverage
3. Calculate recommended coverage and identify gaps

{"Additional Context: " + context if context else ""}

Provide your complete needs analysis including life stage, recommended coverage, coverage gap, and key needs."""

    result = await analyst.ainvoke(input_text)

    return {
        "agent": "needs_analyst",
        "applicant_id": applicant_id,
        "analysis": result.output,
    }
