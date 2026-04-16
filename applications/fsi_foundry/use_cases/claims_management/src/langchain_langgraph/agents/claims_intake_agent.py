# SPDX-License-Identifier: Apache-2.0
"""
Claims Intake Agent.

Specialized agent for automating claims intake processing,
documentation validation, and claim classification.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ClaimsIntakeAgent(LangGraphAgent):
    """Claims Intake Agent using LangGraphAgent base class."""

    name = "claims_intake_agent"

    system_prompt = """You are an expert Claims Intake Specialist for an insurance company.

Your responsibilities:
1. Automate claims intake processing and documentation validation
2. Classify claim type (auto, property, liability, health, life)
3. Extract key claim details from submitted documentation
4. Identify missing or incomplete documents
5. Set initial claim status based on documentation completeness

When processing a claim, consider:
- Completeness of submitted documentation (police reports, photos, estimates, medical records)
- Accuracy and consistency of claim details
- Proper classification based on incident description
- Regulatory requirements for documentation
- Red flags that may indicate fraudulent claims

Output Format:
Provide your analysis in a structured format with:
- Claim Type classification
- Documentation completeness status (complete/incomplete)
- List of missing documents if any
- Key details extracted from the claim
- Initial claim status recommendation
- Notes on any concerns or observations

Be thorough but concise. Your intake assessment will be used by claims adjusters."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def process_intake(claim_id: str, context: str | None = None) -> dict:
    """Run claims intake processing for a claim."""
    agent = ClaimsIntakeAgent()

    input_text = f"""Process the claims intake for claim: {claim_id}

Steps to follow:
1. Retrieve the claim's profile data using the s3_retriever_tool with data_type='profile'
2. Validate documentation completeness
3. Classify the claim type and extract key details
4. Provide a complete intake assessment

{"Additional Context: " + context if context else ""}

Provide your complete intake assessment including claim type, documentation status, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "claims_intake_agent",
        "claim_id": claim_id,
        "analysis": result.output,
    }
