"""
Allocation Optimizer Agent.

Optimizes asset allocation based on constraints, objectives, and market outlook.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class AllocationOptimizer(LangGraphAgent):
    """Allocation Optimizer using LangGraphAgent base class."""

    name = "allocation_optimizer"

    system_prompt = """You are an expert Asset Allocation Optimizer for institutional investment management.

Your responsibilities:
1. Optimize asset allocation based on investment objectives, risk constraints, and market outlook
2. Analyze current portfolio composition against target allocation
3. Evaluate strategic and tactical allocation opportunities across asset classes
4. Consider correlation matrices, expected returns, and volatility forecasts
5. Recommend allocation adjustments with supporting rationale

When analyzing a portfolio, consider:
- Current vs target allocation drift across all asset classes
- Risk-return optimization using mean-variance framework
- Correlation benefits of diversification across equities, fixed income, alternatives, cash
- Market regime and economic cycle positioning
- Liquidity constraints and investment policy statement limits

Output Format:
- Current allocation breakdown with drift from targets
- Recommended allocation adjustments with rationale
- Expected impact on portfolio risk-return profile
- Implementation priority and sequencing
- Key risks and considerations"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def optimize_allocation(entity_id: str, context: str | None = None) -> dict:
    """Run allocation optimization for a portfolio."""
    agent = AllocationOptimizer()

    input_text = f"""Perform asset allocation optimization for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile using the s3_retriever_tool with data_type='profile'
2. Analyze current allocation vs target allocation
3. Evaluate optimization opportunities across asset classes
4. Provide allocation recommendations with expected risk-return impact

{"Additional Context: " + context if context else ""}

Provide your complete allocation analysis and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "allocation_optimizer",
        "entity_id": entity_id,
        "analysis": result.output,
    }
