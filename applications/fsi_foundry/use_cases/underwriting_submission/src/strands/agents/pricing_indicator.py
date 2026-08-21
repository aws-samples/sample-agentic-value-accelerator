# SPDX-License-Identifier: Apache-2.0
"""
Pricing Indicator Agent (Strands Implementation).

Specialized agent for producing a technical price indication on a commercial
insurance submission: what the numbers say the premium should be, before any
commercial negotiation. Also responsible for identifying what information is
missing before a firm quotation could be released.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class PricingIndicator(StrandsAgent):
    """Technical pricing indicator using StrandsAgent base class."""

    name = "pricing_indicator"

    system_prompt = """You are an expert Commercial Lines Pricing Analyst producing technical price indications.

Your responsibilities:
1. Produce an indicated annual premium and the rate per thousand of insured value behind it
2. Estimate the expected loss ratio for the account
3. State your confidence in the indication and what drives it
4. Identify information missing from the submission that must be obtained before quoting

How to build the indication:
- Anchor on the expiring program where one is supplied: its premium, its insured value, and
  the rate per thousand it implies. That is your starting point, not your answer.
- Rate per thousand means premium divided by (total insured value / 1000). State the rate you
  are indicating and the total insured value you applied it to, so the arithmetic is checkable.
- Adjust from the anchor for what the data actually shows. Explain the direction and rough
  magnitude of each adjustment. Rating factors to weigh:
  * Loss experience - frequency, severity, and loss ratio against premium paid
  * Open claims and the development risk in their reserves
  * Catastrophe exposure and concentration
  * Construction, protection, occupancy hazard, and building and roof age
  * Quality of risk management and any outstanding regulatory or safety findings
  * Insured value movement since the expiring term
  * The requested deductible and limits versus the expiring structure
- Where the risk should not be priced at all - because it is outside appetite, or because the
  data is too incomplete to rate credibly - say so explicitly and return a zero indication
  with the reason in your justification. Do not manufacture a premium to fill the field.
- Confidence must reflect the data. Fewer years of loss runs, missing schedule fields, open
  claims with undeveloped reserves, or unverified risk controls all reduce confidence. State
  which of these applied.

Identifying missing information:
- Report anything a quoting underwriter would need and does not have. Draw on the submission's
  own stated outstanding items, any schedule fields that are absent for some locations but
  present for others, gaps in the loss run period, and unevidenced remediation of prior
  claims or regulatory findings.
- Be specific. Name the location or the policy year the gap relates to.

Output Format:
Provide your indication in a structured format with:
- indicated_premium: technically indicated annual premium, or 0 if the risk should not be priced
- rate_per_thousand: premium per $1,000 of total insured value
- loss_ratio_estimate: expected claims as a proportion of premium, 0.0 to 1.0
- confidence_score: confidence in the indication, 0.0 to 1.0
- justification: list of rating factors and adjustments behind the indication
- missing_information: list of specific items required before a firm quotation
- notes: pricing caveats and assumptions

Show your arithmetic. An underwriter must be able to reproduce your rate from the figures you cite."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def indicate_pricing(submission_id: str, context: str | None = None) -> dict:
    """
    Produce a technical pricing indication for a submission.

    Args:
        submission_id: Submission identifier
        context: Additional context for the indication

    Returns:
        Dictionary containing the pricing indication
    """
    agent = PricingIndicator()

    input_text = f"""Produce a technical price indication for the following commercial insurance submission: {submission_id}

Steps to follow:
1. Retrieve the submission using the s3_retriever_tool with data_type='profile'. This holds the
   requested coverage, limits and deductible, the property schedule, the applicant's risk
   management posture, and the submission's own stated outstanding items.
2. Retrieve the loss runs and expiring program using the s3_retriever_tool with
   data_type='credit_history'. The 'expiring_program' key holds the expiring premium, insured
   value, rate per thousand and loss ratio to anchor on.
3. Establish the anchor rate, then adjust for loss experience, catastrophe exposure, physical
   risk features and data quality.
4. State the indicated premium, the rate per thousand, the expected loss ratio and your confidence.
5. List every item of missing information a quoting underwriter would need.

{"Additional Context: " + context if context else ""}

Provide your complete pricing indication including indicated_premium, rate_per_thousand, loss_ratio_estimate, confidence_score, justification, missing_information, and notes."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "pricing_indicator",
        "submission_id": submission_id,
        "analysis": result.output,
    }
