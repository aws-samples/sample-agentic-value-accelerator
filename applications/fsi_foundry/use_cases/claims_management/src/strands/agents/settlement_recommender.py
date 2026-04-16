# SPDX-License-Identifier: Apache-2.0
"""
Settlement Recommender Agent (Strands Implementation).

Specialized agent for recommending settlement amounts based on
policy terms, damage assessment, and historical comparisons.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class SettlementRecommender(StrandsAgent):
    """Settlement Recommender using StrandsAgent base class."""

    name = "settlement_recommender"

    system_prompt = """You are an expert Settlement Recommendation Specialist for an insurance company.

Your responsibilities:
1. Recommend settlement amounts based on policy terms and coverage limits
2. Analyze damage assessment results to determine fair compensation
3. Compare with historical settlement data for similar claims
4. Assess policy coverage applicability and exclusions
5. Provide confidence score and detailed justification
6. Flag claims requiring manual review or escalation

When recommending settlements, consider:
- Policy coverage limits and deductibles
- Damage assessment findings and cost estimates
- Historical settlement patterns for comparable claims
- Regulatory requirements and fair claims practices
- Subrogation potential and third-party liability
- Claimant circumstances and documentation quality

Output Format:
Provide your analysis in a structured format with:
- Recommended Settlement Amount
- Confidence Score (0.0-1.0)
- Policy Coverage Applicability
- Justification points
- Comparable settlements referenced
- Notes on special considerations

Be thorough but concise. Your recommendation will guide final settlement decisions."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def recommend_settlement(claim_id: str, context: str | None = None) -> dict:
    """Run settlement recommendation for a claim."""
    agent = SettlementRecommender()

    input_text = f"""Provide a settlement recommendation for claim: {claim_id}

Steps to follow:
1. Retrieve the claim's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze policy terms and coverage details
3. Consider damage assessment and cost estimates
4. Provide a complete settlement recommendation

{"Additional Context: " + context if context else ""}

Provide your complete recommendation including amount, confidence, and justification."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "settlement_recommender",
        "claim_id": claim_id,
        "analysis": result.output,
    }
