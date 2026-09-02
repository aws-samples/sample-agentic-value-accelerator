# SPDX-License-Identifier: Apache-2.0
"""
Appetite Screener Agent (Strands Implementation).

Specialized agent for screening a commercial insurance submission against the
insurer's written risk appetite ruleset. This is the first question an
underwriter asks: is this something we are willing to write at all?

The appetite ruleset is data, not prompt. It is carried in the submission's
compliance record so that rules can change without a code or prompt change,
and so that every finding can cite the rule it came from.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class AppetiteScreener(StrandsAgent):
    """Risk appetite screener using StrandsAgent base class."""

    name = "appetite_screener"

    system_prompt = """You are an expert Commercial Lines Underwriting Assistant specializing in risk appetite screening.

Your responsibilities:
1. Evaluate a submission against every rule in the insurer's written appetite ruleset
2. Determine whether the risk is inside appetite, outside appetite, or requires referral
3. Cite the specific rule behind every finding so an underwriter can audit your reasoning
4. Identify prohibited occupancy or business classes present anywhere in the submission

How to evaluate the ruleset:
- The ruleset is supplied with the submission. Apply EVERY rule in it. Never rely on
  appetite rules you remember from elsewhere, and never invent a rule.
- Reference each rule by its rule_id (for example APP-01) in your findings.
- Each rule declares a `type`. Treat them differently:
  * prohibition - a breach means the risk cannot be written
  * referral - a breach means a senior underwriter must review, but the risk is still writable
  * limit - a breach of the stated numeric threshold is a prohibition
  * requirement - the stated condition must be satisfied
  * referral_and_prohibition - the rule carries TWO thresholds. Evaluate both. The stricter
    threshold produces a prohibition; the looser one produces only a referral. Report which
    locations fall into which band. Do not treat a referral-band location as prohibited.
- Only evaluate a rule against the locations and attributes it actually scopes. If a rule
  names a qualifying attribute - an occupancy category, an exposure flag, a value threshold,
  a story count - then anything not meeting that qualifier is OUT OF SCOPE for that rule and
  must NOT be reported as a failure. Check the qualifier before checking the threshold.
- A rule fails only when the data breaches its stated threshold. Do not infer a failure from
  the general character of the risk, from the industry, or from an adjacent rule.
- Check occupancy at BOTH the applicant level and every individual location. A prohibited
  class at any single location is a finding.
- Rules that are satisfied, and rules that do not apply, both belong in checks_passed. Say
  which of the two applies in your notes.

Deriving the overall status:
- If ANY prohibition, limit, or requirement rule is breached -> out_of_appetite
- Else if ANY referral rule or referral band is triggered -> referral_required
- Else -> in_appetite

Output Format:
Provide your screening in a structured format with:
- appetite_status: one of in_appetite, out_of_appetite, referral_required
- checks_passed: list of rule_ids satisfied or not applicable, each with a brief reason
- checks_failed: list of rule_ids breached, each with the specific data that breached it
- prohibited_classes_triggered: list of prohibited occupancy or business classes found
- notes: referral rationale, licensing and sanctions observations, and any rule you could
  not evaluate because the data was absent

Be precise and auditable. An underwriter must be able to check every finding against the
rule and the data without re-reading the whole submission."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def screen_appetite(submission_id: str, context: str | None = None) -> dict:
    """
    Screen a submission against the insurer's risk appetite ruleset.

    Args:
        submission_id: Submission identifier
        context: Additional context for the screening, e.g. broker commentary

    Returns:
        Dictionary containing appetite screening results
    """
    agent = AppetiteScreener()

    input_text = f"""Screen the following commercial insurance submission against the insurer's risk appetite: {submission_id}

Steps to follow:
1. Retrieve the submission using the s3_retriever_tool with data_type='profile'. This contains
   the applicant, the requested coverage, and the property schedule with one entry per location.
2. Retrieve the appetite ruleset and regulatory record using the s3_retriever_tool with
   data_type='compliance'. The ruleset is under the 'appetite_rules' key; licensing, sanctions
   screening and regulatory checks are alongside it.
3. Retrieve the loss runs using the s3_retriever_tool with data_type='credit_history'. Some
   appetite rules are claims-based - for example a referral threshold on the size of any single
   open claim - and cannot be evaluated without the individual claim records. Each claim carries
   a status and a total_incurred; the 'summary' key also reports open_claim_count and
   largest_single_claim.
4. Apply every rule in the ruleset to the submission, location by location where the rule is
   location-scoped, and at applicant level where it is not. A rule you have the data to evaluate
   must be evaluated - do not report a rule as unevaluable if the records above contain what it
   needs.
5. Derive the overall appetite status and report your findings with rule_id citations.

{"Additional Context: " + context if context else ""}

Provide your complete appetite screening including appetite_status, checks_passed, checks_failed, prohibited_classes_triggered, and notes."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "appetite_screener",
        "submission_id": submission_id,
        "analysis": result.output,
    }
