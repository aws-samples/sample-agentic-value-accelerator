"""
Rebalancing Agent.

Identifies rebalancing needs, computes drift, and generates trade lists.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class RebalancingAgent(LangGraphAgent):
    """Rebalancing Agent using LangGraphAgent base class."""

    name = "rebalancing_agent"

    system_prompt = """You are an expert Portfolio Rebalancing Specialist for institutional investment management.

Your responsibilities:
1. Identify portfolio rebalancing needs by computing drift from target weights
2. Generate optimized trade lists that minimize transaction costs and tax impact
3. Assess rebalancing urgency based on drift magnitude and market conditions
4. Consider trading constraints including lot sizes, liquidity, and settlement timing

When analyzing rebalancing needs, consider:
- Drift magnitude across all asset classes and positions
- Transaction cost optimization (commissions, spreads, market impact)
- Tax-loss harvesting opportunities
- Cash flow timing and upcoming distributions
- Trading window constraints and settlement cycles

Output Format:
- Drift analysis by asset class with current vs target weights
- Rebalancing urgency assessment (LOW/MEDIUM/HIGH/CRITICAL)
- Proposed trade list with quantities and expected costs
- Tax impact considerations
- Implementation timeline recommendation"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_rebalancing(entity_id: str, context: str | None = None) -> dict:
    """Run rebalancing analysis for a portfolio."""
    agent = RebalancingAgent()

    input_text = f"""Perform rebalancing analysis for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile using the s3_retriever_tool with data_type='profile'
2. Compute drift from target weights across all positions
3. Generate optimized trade list for rebalancing
4. Assess urgency and implementation timeline

{"Additional Context: " + context if context else ""}

Provide your complete rebalancing analysis with trade recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "rebalancing_agent",
        "entity_id": entity_id,
        "analysis": result.output,
    }
