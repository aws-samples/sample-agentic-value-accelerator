"""Market Researcher Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class MarketResearcher(StrandsAgent):
    name = "market_researcher"
    system_prompt = """You are an expert Market Researcher for investment advisory.
Your responsibilities:
1. Analyze current market conditions and economic indicators
2. Identify sector trends and rotation opportunities
3. Evaluate market risks (geopolitical, monetary policy, valuations)
4. Research investment opportunities aligned with market outlook
5. Provide forward-looking market commentary
Output: Market Outlook, Sector Analysis, Risk Factors, Opportunities, Recommendations."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def research_market(client_id: str, context: str | None = None) -> dict:
    agent = MarketResearcher()
    input_text = f"""Research market conditions for client: {client_id}
Steps: 1. Retrieve client profile using s3_retriever_tool with data_type='profile'
2. Analyze market conditions relevant to client holdings 3. Provide market outlook and opportunities
{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "market_researcher", "customer_id": client_id, "analysis": result.output}
