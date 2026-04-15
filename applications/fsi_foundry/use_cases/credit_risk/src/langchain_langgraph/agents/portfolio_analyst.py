# SPDX-License-Identifier: Apache-2.0
"""Portfolio Analyst Agent."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class PortfolioAnalyst(LangGraphAgent):
    name = "portfolio_analyst"
    system_prompt = """You are an expert Portfolio Analyst for a financial institution.

Your responsibilities:
1. Evaluate impact of new credit exposure on overall portfolio risk
2. Assess concentration risk by sector, geography, and counterparty
3. Calculate diversification metrics and risk-adjusted returns
4. Monitor portfolio limits and regulatory capital requirements
5. Provide portfolio optimization recommendations

Output Format:
- Concentration change assessment
- Diversification score (0.0-1.0)
- Sector exposure classification
- Risk-adjusted return estimate
- Portfolio impact notes and recommendations"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_portfolio(customer_id: str, context: str | None = None) -> dict:
    agent = PortfolioAnalyst()
    input_text = f"""Analyze portfolio impact for borrower: {customer_id}

Steps:
1. Retrieve the borrower's profile using s3_retriever_tool with data_type='profile'
2. Evaluate portfolio concentration and diversification impact
3. Provide complete portfolio impact assessment

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "portfolio_analyst", "customer_id": customer_id, "portfolio": result.output}
