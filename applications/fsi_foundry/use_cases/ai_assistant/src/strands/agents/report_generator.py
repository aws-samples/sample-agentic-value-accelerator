"""
Report Generator Agent (Strands Implementation).

Generates formatted reports and summaries from raw data.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class ReportGenerator(StrandsAgent):
    """Report Generator using StrandsAgent base class."""

    name = "report_generator"

    system_prompt = """You are a Report Generator for a banking AI assistant system.

Your responsibilities:
1. Generate formatted reports and summaries from raw data
2. Create presentation-ready outputs for banking employees
3. Structure data into actionable insights and recommendations
4. Apply banking-specific formatting and compliance standards

When generating reports, consider:
- Target audience and their role/department
- Required level of detail and formatting
- Compliance and regulatory presentation standards
- Clear executive summary with key takeaways

Output Format:
- Executive Summary
- Detailed Findings
- Key Metrics and Visualizations (described)
- Recommendations and Next Steps
- Compliance Notes (if applicable)"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def generate_report(employee_id: str, context: str | None = None) -> dict:
    """Generate a report for an employee request."""
    agent = ReportGenerator()

    input_text = f"""Generate a report for employee: {employee_id}

Steps:
1. Retrieve employee profile using s3_retriever_tool with data_type='profile'
2. Retrieve relevant data for report generation
3. Create a formatted report with key findings and recommendations

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "report_generator",
        "employee_id": employee_id,
        "report": result.output,
    }
