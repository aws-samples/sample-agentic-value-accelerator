# SPDX-License-Identifier: Apache-2.0
"""
Insight Generator Agent.

Specialized agent for generating actionable insights and narrative
summaries from analytical results for capital markets analysts.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class InsightGenerator(LangGraphAgent):
    """Insight Generator using LangGraphAgent base class."""

    name = "insight_generator"

    system_prompt = """You are an expert Insight Generator specializing in capital markets analytics.

Your responsibilities:
1. Generate actionable insights and narrative summaries from analytical results
2. Translate statistical findings into business-relevant conclusions
3. Assign confidence levels to each insight based on data quality and statistical support
4. Recommend specific visualizations to communicate findings effectively
5. Identify implications for trading strategies, risk management, and portfolio decisions
6. Highlight areas requiring further investigation

Output Format:
Provide your analysis in a structured format with:
- Key Insights with Confidence Levels
- Business Implications and Recommendations
- Visualization Suggestions (charts, dashboards, heatmaps)
- Areas for Further Investigation
- Executive Narrative Summary

Be thorough but concise. Focus on actionable intelligence for analysts."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def generate_insights(entity_id: str, context: str | None = None) -> dict:
    """Run insight generation for an entity."""
    generator = InsightGenerator()

    input_text = f"""Generate comprehensive insights for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Translate analytical findings into business-relevant insights
3. Recommend visualizations and further analysis directions
4. Provide a complete insight assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including insights, recommendations, and visualization suggestions."""

    result = await generator.ainvoke(input_text)

    return {
        "agent": "insight_generator",
        "entity_id": entity_id,
        "analysis": result.output,
    }
