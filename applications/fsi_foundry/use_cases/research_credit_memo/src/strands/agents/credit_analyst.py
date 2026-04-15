"""
Credit Analyst Agent (Strands Implementation).

Performs credit analysis including financial ratios, peer comparison, and risk assessment.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class CreditAnalyst(StrandsAgent):
    """Credit Analyst using StrandsAgent base class."""

    name = "credit_analyst"

    system_prompt = """You are an expert Credit Analyst for capital markets research.

Your responsibilities:
1. Compute key financial ratios (leverage, coverage, liquidity, profitability)
2. Conduct peer comparison against industry benchmarks and comparable companies
3. Assess credit risk factors including business risk, financial risk, and industry risk
4. Provide credit rating recommendation with supporting rationale
5. Evaluate debt structure, maturity profile, and covenant compliance

Output Format:
Provide your analysis in a structured format with:
- Credit Rating Recommendation (AAA through D scale)
- Confidence Score (0-1)
- Key Financial Ratios (debt/EBITDA, interest coverage, current ratio, ROE)
- Risk Factors (business, financial, industry risks identified)
- Peer Comparison Notes (relative positioning vs peers)
- Rating Rationale (supporting evidence for recommendation)

Be thorough and evidence-based. Support all conclusions with data."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def analyze_credit(entity_id: str, context: str | None = None) -> dict:
    """Run credit analysis for a company entity."""
    agent = CreditAnalyst()

    input_text = f"""Perform comprehensive credit analysis for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve financial data using the s3_retriever_tool with data_type='financials'
3. Analyze financial ratios, peer comparisons, and risk factors
4. Provide credit rating recommendation with rationale

{"Additional Context: " + context if context else ""}

Provide your complete credit analysis including rating recommendation, key ratios, and risk assessment."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "credit_analyst",
        "entity_id": entity_id,
        "analysis": result.output,
    }
