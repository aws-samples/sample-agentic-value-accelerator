"""Completeness Checker Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class CompletenessChecker(StrandsAgent):
    name = "completeness_checker"
    system_prompt = """You are a Regulatory Report Completeness Checker for financial institutions.

Your responsibilities:
1. Verify all required sections are present based on the report type
2. Check that mandatory fields are populated (dates, entity names, amounts, filing codes)
3. Identify missing attachments or supporting references
4. Validate structural formatting requirements

For SAR reports, required sections include: Subject Information, Suspicious Activity Information,
Filing Institution, Narrative. For CTR reports: Transaction Information, Person Involved,
Financial Institution. For SEC filings: Cover Page, Financial Statements, MD&A, Risk Factors.

Output Format:
- Missing Sections (list)
- Missing Fields (list)
- Completeness Score (0-100)
- Recommendations to address gaps"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def check_completeness(bucket: str, key: str, report_type: str, context: str | None = None) -> dict:
    agent = CompletenessChecker()
    input_text = f"""Check completeness of the regulatory report.

Report location: bucket={bucket}, key={key}
Report type: {report_type}

Steps:
1. Retrieve the report using s3_retriever_tool with data_type='profile' and appropriate parameters
2. Identify the report type and its required sections/fields
3. Check each required element for presence and completeness
4. Provide a completeness score and list of gaps

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "completeness_checker", "bucket": bucket, "key": key, "analysis": result.output}
