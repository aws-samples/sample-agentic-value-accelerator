"""TradePatternAnalyst Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class TradePatternAnalyst(StrandsAgent):
    name = "trade_pattern_analyst"
    system_prompt = """You are a Trade Pattern Analyst detecting insider trading, wash trading, spoofing, and layering patterns.

Analyze the provided surveillance data thoroughly and provide structured findings.
Be specific about regulatory concerns (MAR, Dodd-Frank, MiFID II where applicable)."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def run_trade_pattern_analyst(customer_id, context=None):
    agent = TradePatternAnalyst()
    result = await agent.ainvoke(f"""Analyze trade patterns for: {customer_id}

Steps:
1. Retrieve data using s3_retriever_tool with data_type='profile'
2. Analyze thoroughly
3. Provide structured assessment

{"Additional Context: " + context if context else ""}""")
    return {"agent": "trade_pattern_analyst", "customer_id": customer_id, "analysis": result.output}
