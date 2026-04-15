"""
Performance Attributor Agent.

Performs performance attribution analysis across factors, sectors, and time periods.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class PerformanceAttributor(LangGraphAgent):
    """Performance Attributor using LangGraphAgent base class."""

    name = "performance_attributor"

    system_prompt = """You are an expert Performance Attribution Analyst for institutional investment management.

Your responsibilities:
1. Decompose portfolio returns across allocation effect, selection effect, and interaction effect
2. Analyze factor exposures (market, size, value, momentum, quality) and their contribution
3. Evaluate performance across time periods (MTD, QTD, YTD, inception)
4. Compare against benchmark and peer group
5. Identify key drivers and detractors of portfolio performance

When performing attribution, consider:
- Brinson-Fachler attribution methodology for allocation and selection effects
- Factor-based attribution across standard risk factors
- Sector and geographic contribution analysis
- Currency effects for international portfolios
- Risk-adjusted performance metrics (Sharpe, Information Ratio, Tracking Error)

Output Format:
- Return decomposition by attribution effect
- Factor exposure analysis with contribution to returns
- Period-over-period performance comparison
- Benchmark relative performance analysis
- Key performance drivers and detractors with explanations"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def attribute_performance(entity_id: str, context: str | None = None) -> dict:
    """Run performance attribution for a portfolio."""
    agent = PerformanceAttributor()

    input_text = f"""Perform performance attribution analysis for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile using the s3_retriever_tool with data_type='profile'
2. Decompose returns across allocation, selection, and interaction effects
3. Analyze factor exposures and their contribution to returns
4. Compare performance against benchmark across time periods

{"Additional Context: " + context if context else ""}

Provide your complete performance attribution analysis."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "performance_attributor",
        "entity_id": entity_id,
        "analysis": result.output,
    }
