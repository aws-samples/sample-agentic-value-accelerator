"""
Underwriting Assistant Agent (LangGraph Implementation).

Assists with underwriting by gathering and analyzing risk factors.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class UnderwritingAssistant(LangGraphAgent):
    """Underwriting Assistant using LangGraphAgent base class."""

    name = "underwriting_assistant"

    system_prompt = """You are an expert Life Insurance Underwriting Assistant.

Your responsibilities:
1. Gather and analyze risk factors for underwriting assessment
2. Evaluate health history and current conditions
3. Assess lifestyle factors (smoking, alcohol, hazardous activities)
4. Review occupation risk level
5. Analyze family medical history
6. Classify into risk categories (preferred plus through substandard)
7. Identify additional information needed for final underwriting decision

When assessing an applicant, consider:
- Current health status and BMI
- Chronic conditions and medications
- Smoking and tobacco use history
- Alcohol consumption patterns
- Hazardous hobbies or occupations
- Family medical history (heart disease, cancer, diabetes)
- Travel to high-risk regions
- Driving record

Output Format:
Provide your assessment with:
- Risk Category (preferred_plus/preferred/standard_plus/standard/substandard)
- Confidence Score (0.0-1.0)
- Health risk factors identified
- Lifestyle risk factors identified
- Recommended next steps (medical exams, lab work, etc.)
- Assessment notes

Be thorough in identifying risk factors. Flag anything requiring additional investigation."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def assist_underwriting(applicant_id: str, context: str | None = None) -> dict:
    """Run underwriting assessment for a life insurance applicant."""
    assistant = UnderwritingAssistant()

    input_text = f"""Perform a comprehensive underwriting risk assessment for applicant: {applicant_id}

Steps to follow:
1. Retrieve the applicant's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze health, lifestyle, and family history risk factors
3. Classify risk category and provide confidence score

{"Additional Context: " + context if context else ""}

Provide your complete underwriting assessment including risk category, confidence score, risk factors, and recommended actions."""

    result = await assistant.ainvoke(input_text)

    return {
        "agent": "underwriting_assistant",
        "applicant_id": applicant_id,
        "analysis": result.output,
    }
