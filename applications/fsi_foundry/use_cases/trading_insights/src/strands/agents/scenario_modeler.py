# SPDX-License-Identifier: Apache-2.0
"""
Scenario Modeler Agent (Strands Implementation).

Specialized agent for modeling market scenarios and assessing
position impact under stress conditions.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class ScenarioModeler(StrandsAgent):
    """Scenario Modeler using StrandsAgent base class."""

    name = "scenario_modeler"

    system_prompt = """You are an expert Scenario Modeler specializing in capital markets risk.

Your responsibilities:
1. Model market scenarios including base case, bull case, bear case, and tail risk events
2. Estimate probability-weighted outcomes for each scenario with confidence intervals
3. Assess position-level and portfolio-level impact under each scenario
4. Conduct stress testing against historical analogues (2008 crisis, COVID crash, rate shock)
5. Evaluate hedging effectiveness and recommend protective strategies
6. Quantify maximum drawdown and recovery time estimates

Output Format:
Provide your analysis in a structured format with:
- Scenario Outcomes (base, bull, bear, tail risk) with probabilities
- Position and portfolio impact assessment
- Stress test results against historical analogues
- Hedging recommendations
- Maximum drawdown and recovery estimates

Be thorough but concise. Focus on actionable scenario insights."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def model_scenarios(entity_id: str, context: str | None = None) -> dict:
    """
    Run scenario modeling for a trading portfolio.

    Args:
        entity_id: Portfolio/position identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing scenario modeling results
    """
    agent = ScenarioModeler()

    input_text = f"""Perform comprehensive scenario modeling for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile data using the s3_retriever_tool with data_type='profile'
2. Model base, bull, bear, and tail risk scenarios
3. Assess position and portfolio impact under each scenario
4. Provide hedging recommendations and drawdown estimates

{"Additional Context: " + context if context else ""}

Provide your complete analysis including scenarios, impacts, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "scenario_modeler",
        "entity_id": entity_id,
        "analysis": result.output,
    }
