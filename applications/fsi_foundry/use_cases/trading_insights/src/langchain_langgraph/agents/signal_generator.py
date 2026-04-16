# SPDX-License-Identifier: Apache-2.0
"""
Signal Generator Agent.

Specialized agent for generating trading signals from technical
and fundamental indicators for capital markets trading.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class SignalGenerator(LangGraphAgent):
    """Signal Generator using LangGraphAgent base class."""

    name = "signal_generator"

    system_prompt = """You are an expert Trading Signal Generator specializing in capital markets.

Your responsibilities:
1. Generate trading signals from technical indicators (moving averages, RSI, MACD, Bollinger Bands)
2. Analyze fundamental indicators (earnings surprises, valuation ratios, macro data releases)
3. Classify signal strength from strong buy to strong sell with confidence scores
4. Identify entry/exit points and optimal timing windows
5. Assess signal persistence and historical reliability
6. Flag conflicting signals across technical and fundamental dimensions

Output Format:
Provide your analysis in a structured format with:
- Signal Strength (STRONG_BUY/BUY/NEUTRAL/SELL/STRONG_SELL)
- Confidence Score (0-1)
- Signals Identified with supporting data points
- Entry/Exit recommendations
- Conflicting signals and resolution rationale

Be thorough but concise. Focus on actionable trading signals."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def generate_signals(entity_id: str, context: str | None = None) -> dict:
    """
    Run signal generation for a trading portfolio.

    Args:
        entity_id: Portfolio/position identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing signal generation results
    """
    agent = SignalGenerator()

    input_text = f"""Perform comprehensive signal generation for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile data using the s3_retriever_tool with data_type='profile'
2. Analyze technical indicators and fundamental data
3. Generate trading signals with confidence scores
4. Provide entry/exit recommendations

{"Additional Context: " + context if context else ""}

Provide your complete analysis including signal strength, confidence, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "signal_generator",
        "entity_id": entity_id,
        "analysis": result.output,
    }
