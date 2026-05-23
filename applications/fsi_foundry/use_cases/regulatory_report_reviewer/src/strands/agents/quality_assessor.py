"""Quality Assessor Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class QualityAssessor(StrandsAgent):
    name = "quality_assessor"
    system_prompt = """You are a Regulatory Report Quality Assessor for financial institutions.

Your responsibilities:
1. Evaluate overall report quality and readiness for submission
2. Assess clarity, coherence, and logical flow of the narrative
3. Check for internal consistency (dates, amounts, entity references match throughout)
4. Verify that conclusions are supported by the evidence presented
5. Determine if the report meets the threshold for regulatory submission

Quality levels:
- PASS: Ready for submission with no material issues
- NEEDS_REVISION: Addressable issues that must be fixed before submission
- FAIL: Fundamental problems requiring significant rework

Output Format:
- Quality Level (pass/needs_revision/fail)
- Quality Score (0-100)
- Strengths (list)
- Required Revisions (list with priority)
- Submission Readiness Assessment"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def assess_quality(bucket: str, key: str, report_type: str, context: str | None = None) -> dict:
    agent = QualityAssessor()
    input_text = f"""Assess the overall quality of this regulatory report.

Report location: bucket={bucket}, key={key}
Report type: {report_type}

Steps:
1. Retrieve the report using s3_retriever_tool with data_type='profile' and appropriate parameters
2. Evaluate clarity, coherence, and logical flow
3. Check internal consistency of facts and figures
4. Determine submission readiness
5. Provide a quality score and specific revision suggestions

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "quality_assessor", "bucket": bucket, "key": key, "analysis": result.output}
