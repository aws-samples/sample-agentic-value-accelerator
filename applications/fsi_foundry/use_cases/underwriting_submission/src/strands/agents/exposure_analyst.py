# SPDX-License-Identifier: Apache-2.0
"""
Exposure Analyst Agent (Strands Implementation).

Specialized agent for quantifying how much the insurer could lose on a
commercial submission: aggregate insured value, geographic and peril
concentration across the property schedule, and what the applicant's prior
claims history says about expected future losses.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class ExposureAnalyst(StrandsAgent):
    """Exposure analyst using StrandsAgent base class."""

    name = "exposure_analyst"

    system_prompt = """You are an expert Commercial Property Exposure Analyst.

Your responsibilities:
1. Aggregate total insured value across the whole property schedule
2. Identify geographic and peril concentrations that could produce simultaneous losses
3. Assess the applicant's prior claims history for frequency, severity and trend
4. Rate overall exposure severity and evidence the rating

How to quantify exposure:
- Total insured value for a location is its building value plus its contents value.
  Total insured value for the submission is the sum across every location.
- Compute concentration as a share of total insured value, grouped by catastrophe zone.
  State the zone, the value in it, and the percentage.
- A concentration matters only for the peril the zone is actually exposed to. Each location
  carries flags describing its catastrophe exposure. Group and report only locations whose
  flags indicate exposure to the peril in question. Do not count a location toward a peril
  it is not flagged for, and do not treat the mere presence of a catastrophe zone label as
  exposure to every peril.
- Where a location's data is incomplete, say which field is missing and how it limits the
  assessment. Do not silently assume a default.

How to assess loss history:
- Distinguish frequency (how often) from severity (how large). Comment on both.
- Separate closed claims from open claims. An open claim carries a reserve, which is an
  estimate and may develop. Say so where reserves are material.
- Compare the applicant's loss ratio against the premium they paid. A loss ratio approaching
  or exceeding 1.0 means claims have cost more than the premium collected.
- Note where the number of years of loss data supplied is less than the number needed for a
  credible view, and reflect that in your confidence rather than ignoring it.
- Link claims to locations where the data allows it. A single location generating repeated
  claims is a materially different risk from the same claim count spread evenly.
- Weigh physical risk features - construction type, sprinkler protection, building and roof
  age, protective systems, and the quality of the applicant's risk management - as mitigating
  or aggravating factors.

Output Format:
Provide your analysis in a structured format with:
- total_insured_value: aggregate insured value across all locations
- exposure_severity: one of low, moderate, high, critical
- concentration_flags: list of concentrations, each stating zone, value and percentage of total
- loss_history_summary: narrative assessment of frequency, severity, trend and open claims
- findings: list of exposure findings supporting your severity rating
- notes: data limitations, missing fields, and assumptions made

Be quantitative. Show the arithmetic behind every figure so an underwriter can check it."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def analyze_exposure(submission_id: str, context: str | None = None) -> dict:
    """
    Analyze aggregate exposure and loss history for a submission.

    Args:
        submission_id: Submission identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing exposure assessment results
    """
    agent = ExposureAnalyst()

    input_text = f"""Analyze the exposure presented by the following commercial insurance submission: {submission_id}

Steps to follow:
1. Retrieve the submission using the s3_retriever_tool with data_type='profile'. The
   'property_schedule' key holds one entry per location with its values, construction,
   protection, age, and catastrophe exposure flags.
2. Retrieve the applicant's prior claims history using the s3_retriever_tool with
   data_type='credit_history'. This holds the loss runs: individual claims, a reconciled
   summary, the expiring program and premium, and the applicant's financials.
3. Aggregate total insured value and compute concentration by catastrophe zone.
4. Assess claims frequency, severity, trend and open reserves.
5. Rate overall exposure severity and evidence it.

{"Additional Context: " + context if context else ""}

Provide your complete exposure assessment including total_insured_value, exposure_severity, concentration_flags, loss_history_summary, findings, and notes."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "exposure_analyst",
        "submission_id": submission_id,
        "analysis": result.output,
    }
