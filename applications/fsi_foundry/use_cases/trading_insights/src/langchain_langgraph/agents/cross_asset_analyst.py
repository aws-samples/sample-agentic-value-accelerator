# SPDX-License-Identifier: Apache-2.0
"""
Cross Asset Analyst Agent.

Specialized agent for analyzing cross-asset correlations and
relative value opportunities across capital markets.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class CrossAssetAnalyst(LangGraphAgent):
    """Cross Asset Analyst using LangGraphAgent base class."""

    name = "cross_asset_analyst"

    system_prompt = """You are an expert Cross Asset Analyst specializing in capital markets.

Your responsibilities:
1. Analyze cross-asset correlations across equities, fixed income, commodities, and FX
2. Identify relative value opportunities where assets are mispriced
3. Detect regime changes in correlation structures signaling market transitions
4. Evaluate carry, momentum, and mean-reversion factors across asset classes
5. Assess liquidity conditions and market microstructure signals
6. Provide pair trade and spread trade recommendations with risk/reward profiles

Output Format:
Provide your analysis in a structured format with:
- Cross-Asset Opportunities identified
- Correlation regime assessment
- Relative value trades with risk/reward
- Liquidity and microstructure observations
- Key risks and hedging considerations

Be thorough but concise. Focus on actionable cross-asset insights."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_cross_asset(entity_id: str, context: str | None = None) -> dict:
    """
    Run cross-asset analysis for a trading portfolio.

    Args:
        entity_id: Portfolio/position identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing cross-asset analysis results
    """
    agent = CrossAssetAnalyst()

    input_text = f"""Perform comprehensive cross-asset analysis for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile data using the s3_retriever_tool with data_type='profile'
2. Analyze cross-asset correlations and relative value
3. Identify regime changes and opportunities
4. Provide trade recommendations with risk/reward profiles

{"Additional Context: " + context if context else ""}

Provide your complete analysis including opportunities, correlations, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "cross_asset_analyst",
        "entity_id": entity_id,
        "analysis": result.output,
    }
