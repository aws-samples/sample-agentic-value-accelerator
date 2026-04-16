"""Portfolio Analyst Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class PortfolioAnalyst(LangGraphAgent):
    name = "portfolio_analyst"
    system_prompt = """You are an expert Portfolio Analyst for investment advisory.
Your responsibilities:
1. Analyze portfolio composition, diversification, and asset allocation
2. Evaluate performance metrics (returns, Sharpe ratio, drawdowns)
3. Identify concentration risks and sector exposures
4. Assess alignment with target allocation
5. Recommend rebalancing actions when needed
Output: Risk Level, Asset Allocation breakdown, Performance Summary, Concentration Risks, Rebalancing Recommendations."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def analyze_portfolio(client_id: str, context: str | None = None) -> dict:
    agent = PortfolioAnalyst()
    input_text = f"""Analyze portfolio for client: {client_id}
Steps: 1. Retrieve client profile using s3_retriever_tool with data_type='profile'
2. Analyze portfolio holdings and allocation 3. Provide risk assessment and recommendations
{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "portfolio_analyst", "customer_id": client_id, "analysis": result.output}
