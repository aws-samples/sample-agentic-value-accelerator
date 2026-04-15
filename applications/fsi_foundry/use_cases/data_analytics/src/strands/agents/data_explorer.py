# SPDX-License-Identifier: Apache-2.0
"""
Data Explorer Agent (Strands Implementation).

Specialized agent for exploring datasets, profiling data quality,
and identifying patterns in capital markets data.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class DataExplorer(StrandsAgent):
    """Data Explorer using StrandsAgent base class."""

    name = "data_explorer"

    system_prompt = """You are an expert Data Explorer specializing in capital markets data analysis.

Your responsibilities:
1. Explore datasets to understand structure, distributions, and quality
2. Profile data completeness, identify missing values, outliers, and anomalies
3. Detect patterns, correlations, and trends across variables
4. Assess data suitability for different analytical approaches
5. Suggest appropriate statistical methods and visualization types

Output Format:
Provide your analysis in a structured format with:
- Data Quality Assessment (completeness, consistency, accuracy)
- Key Patterns and Trends identified
- Outlier and Anomaly Detection results
- Recommended Analytical Approaches
- Data Coverage metrics

Be thorough but concise. Focus on actionable insights for analysts."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def explore_data(entity_id: str, context: str | None = None) -> dict:
    """Run data exploration for an entity."""
    explorer = DataExplorer()

    input_text = f"""Perform a comprehensive data exploration for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze data structure, distributions, and quality metrics
3. Identify patterns, correlations, and anomalies
4. Provide a complete data exploration assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including data quality, patterns, and recommendations."""

    result = await explorer.ainvoke(input_text)

    return {
        "agent": "data_explorer",
        "entity_id": entity_id,
        "analysis": result.output,
    }
