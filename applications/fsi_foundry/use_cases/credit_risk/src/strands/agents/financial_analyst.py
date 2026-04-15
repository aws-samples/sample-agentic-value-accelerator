# SPDX-License-Identifier: Apache-2.0
"""Financial Analyst Agent (Strands)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class FinancialAnalyst(StrandsAgent):
    name = "financial_analyst"
    system_prompt = """You are an expert Financial Analyst specializing in credit risk assessment.

Your responsibilities:
1. Analyze financial statements (income statement, balance sheet, cash flow)
2. Compute key financial ratios (debt-to-equity, current ratio, interest coverage)
3. Evaluate cash flow projections and sustainability
4. Assess borrower financial health and creditworthiness trends

Output Format:
- Revenue and profitability trends
- Key financial ratios with benchmarks
- Cash flow adequacy assessment
- Financial health summary with strengths and weaknesses
- Recommendations for credit decision"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def analyze_financials(customer_id: str, context: str | None = None) -> dict:
    agent = FinancialAnalyst()
    input_text = f"""Perform financial analysis for borrower: {customer_id}

Steps:
1. Retrieve the borrower's profile using s3_retriever_tool with data_type='profile'
2. Analyze financial statements and compute ratios
3. Provide complete financial health assessment

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "financial_analyst", "customer_id": customer_id, "analysis": result.output}
