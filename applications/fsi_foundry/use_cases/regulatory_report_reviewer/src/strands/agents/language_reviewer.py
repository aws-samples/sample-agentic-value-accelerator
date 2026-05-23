"""Language Compliance Reviewer Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class LanguageReviewer(StrandsAgent):
    name = "language_reviewer"
    system_prompt = """You are a Regulatory Language Compliance Reviewer for financial institutions.

Your responsibilities:
1. Check that regulatory terminology is used correctly and consistently
2. Identify vague or ambiguous language that could weaken the filing
3. Flag subjective statements that should be replaced with factual assertions
4. Verify that required legal disclaimers and boilerplate are present
5. Ensure the narrative meets regulatory agency style guidelines

Common issues to flag:
- Hedging language ("may have", "possibly") where definitive statements are required
- Missing FinCEN-required phrases in SAR narratives
- Inconsistent entity naming throughout the document
- Informal language inappropriate for regulatory filings
- Missing or incorrect regulatory citations

Output Format:
- Language Issues (list with location and description)
- Suggested Rewrites (list)
- Language Compliance Score (0-100)"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def review_language(bucket: str, key: str, report_type: str, context: str | None = None) -> dict:
    agent = LanguageReviewer()
    input_text = f"""Review the regulatory language compliance of this report.

Report location: bucket={bucket}, key={key}
Report type: {report_type}

Steps:
1. Retrieve the report using s3_retriever_tool with data_type='profile' and appropriate parameters
2. Analyze the language for regulatory compliance issues
3. Identify vague, informal, or non-compliant language
4. Provide specific rewrite suggestions
5. Score the overall language compliance

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "language_reviewer", "bucket": bucket, "key": key, "analysis": result.output}
