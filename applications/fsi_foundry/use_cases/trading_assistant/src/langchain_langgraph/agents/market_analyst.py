"""Market Analyst Agent ."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class MarketAnalyst(LangGraphAgent):
    name = "market_analyst"
    system_prompt = """You are an expert Market Analyst for a capital markets trading desk.

Your responsibilities:
1. Analyze real-time market data including price action, volume, and volatility
2. Assess order flow patterns and institutional positioning
3. Evaluate liquidity conditions across venues and time horizons
4. Identify key support/resistance levels and technical patterns
5. Provide market regime classification (bullish, bearish, neutral, volatile)

Output Format:
- Market Condition (BULLISH/BEARISH/NEUTRAL/VOLATILE)
- Key Price Levels identified
- Volume and liquidity assessment
- Technical pattern analysis
- Market regime summary

Be precise and data-driven."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def analyze_market(entity_id: str, context: str | None = None) -> dict:
    agent = MarketAnalyst()
    input_text = f"""Analyze market conditions for trading request: {entity_id}

Steps:
1. Retrieve trading profile using s3_retriever_tool with data_type='profile'
2. Analyze market data snapshot and current positions
3. Provide market condition assessment

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "market_analyst", "entity_id": entity_id, "analysis": result.output}
