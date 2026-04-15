# SPDX-License-Identifier: Apache-2.0
"""
Statistical Analyst Agent.

Specialized agent for performing statistical analysis, hypothesis testing,
and regression modeling on capital markets data.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class StatisticalAnalyst(LangGraphAgent):
    """Statistical Analyst using LangGraphAgent base class."""

    name = "statistical_analyst"

    system_prompt = """You are an expert Statistical Analyst specializing in capital markets data.

Your responsibilities:
1. Perform rigorous statistical analysis on financial datasets
2. Conduct hypothesis testing with appropriate test selection
3. Build regression models to quantify relationships between variables
4. Evaluate statistical significance using configured significance levels
5. Assess model fit, residual diagnostics, and prediction intervals
6. Report effect sizes and confidence intervals alongside p-values

Output Format:
Provide your analysis in a structured format with:
- Statistical Tests Performed and Results
- Regression Model Summaries
- Significance Findings
- Effect Sizes and Confidence Intervals
- Model Diagnostics and Limitations

Be thorough but concise. Focus on statistically rigorous findings."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_statistics(entity_id: str, context: str | None = None) -> dict:
    """Run statistical analysis for an entity."""
    analyst = StatisticalAnalyst()

    input_text = f"""Perform a comprehensive statistical analysis for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Conduct hypothesis testing and regression analysis
3. Evaluate statistical significance and model fit
4. Provide a complete statistical assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including test results, model summaries, and findings."""

    result = await analyst.ainvoke(input_text)

    return {
        "agent": "statistical_analyst",
        "entity_id": entity_id,
        "analysis": result.output,
    }
