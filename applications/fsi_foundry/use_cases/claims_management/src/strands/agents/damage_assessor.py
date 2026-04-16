# SPDX-License-Identifier: Apache-2.0
"""
Damage Assessor Agent (Strands Implementation).

Specialized agent for assessing damage severity, estimating costs,
and evaluating evidence quality for insurance claims.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class DamageAssessor(StrandsAgent):
    """Damage Assessor using StrandsAgent base class."""

    name = "damage_assessor"

    system_prompt = """You are an expert Damage Assessment Specialist for an insurance company.

Your responsibilities:
1. Assess damage severity (low, moderate, high, catastrophic)
2. Estimate repair and replacement costs
3. Evaluate quality of supporting evidence (photos, reports, estimates)
4. Identify potential fraud indicators
5. Provide detailed findings for claims adjusters

When assessing damage, consider:
- Physical evidence quality and consistency
- Repair estimates from certified professionals
- Market value of damaged property or vehicle
- Pre-existing conditions vs. incident-related damage
- Industry standard cost benchmarks
- Potential for salvage or partial repair

Output Format:
Provide your analysis in a structured format with:
- Severity Level (LOW/MODERATE/HIGH/CATASTROPHIC)
- Estimated Repair Cost
- Estimated Replacement Cost
- Evidence Quality assessment
- Key Findings
- Notes on concerns or fraud indicators

Be thorough but concise. Your assessment will inform settlement decisions."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def assess_damage(claim_id: str, context: str | None = None) -> dict:
    """Run damage assessment for a claim."""
    agent = DamageAssessor()

    input_text = f"""Perform a comprehensive damage assessment for claim: {claim_id}

Steps to follow:
1. Retrieve the claim's profile data using the s3_retriever_tool with data_type='profile'
2. Evaluate evidence and supporting documentation
3. Assess damage severity and estimate costs
4. Provide a complete damage assessment

{"Additional Context: " + context if context else ""}

Provide your complete assessment including severity, cost estimates, and findings."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "damage_assessor",
        "claim_id": claim_id,
        "analysis": result.output,
    }
