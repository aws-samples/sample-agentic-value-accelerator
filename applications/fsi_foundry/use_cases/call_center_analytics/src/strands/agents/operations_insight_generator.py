"""
Operations Insight Generator (Strands Implementation).

Generates operational insights and optimization recommendations.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class OperationsInsightGenerator(StrandsAgent):
    """Operations insight generator using StrandsAgent base class."""

    name = "operations_insight_generator"

    system_prompt = """You are an expert Call Center Operations Analyst for financial services.

Your responsibilities:
1. Analyze call volume patterns, trends, and seasonal variations
2. Identify peak hours and staffing gaps that impact service levels
3. Detect process bottlenecks and workflow inefficiencies
4. Forecast future call volumes based on historical patterns and business events
5. Recommend staffing adjustments, technology improvements, and process changes

Output Format:
Provide your analysis with:
- Call Volume Trend description
- Peak Hours identified
- Bottlenecks found
- Staffing Recommendations
- Process Improvements suggested
- Forecast Summary
- Additional operational notes

Provide actionable recommendations with expected impact on key operational metrics."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def generate_operations_insights(call_center_id: str, context: str | None = None) -> dict:
    """Generate operational insights."""
    agent = OperationsInsightGenerator()
    input_text = f"""Generate operational insights for call center: {call_center_id}

Steps:
1. Retrieve the call center profile using s3_retriever_tool with data_type='profile'
2. Analyze call volume patterns, staffing, and operational efficiency
3. Provide optimization recommendations

{"Additional Context: " + context if context else ""}

Provide your complete analysis including volume trends, bottlenecks, and staffing recommendations."""

    result = await agent.ainvoke(input_text)
    return {"agent": "operations_insight_generator", "call_center_id": call_center_id, "analysis": result.output}
