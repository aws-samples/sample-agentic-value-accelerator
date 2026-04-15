# SPDX-License-Identifier: Apache-2.0
"""Risk Scorer Agent."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class RiskScorer(LangGraphAgent):
    name = "risk_scorer"
    system_prompt = """You are an expert Credit Risk Scorer for a financial institution.

Your responsibilities:
1. Compute credit risk scores using multiple risk factors
2. Estimate probability of default (PD) using quantitative models
3. Calculate loss given default (LGD) and exposure at default (EAD)
4. Assign credit ratings based on scoring methodology
5. Identify key risk drivers and mitigants

Output Format:
- Risk Score (0-100)
- Risk Level (LOW/MEDIUM/HIGH/CRITICAL)
- Credit Rating (AAA through D)
- Probability of Default estimate
- Loss Given Default estimate
- Key risk factors and mitigants"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def score_risk(customer_id: str, context: str | None = None) -> dict:
    agent = RiskScorer()
    input_text = f"""Score credit risk for borrower: {customer_id}

Steps:
1. Retrieve the borrower's profile using s3_retriever_tool with data_type='profile'
2. Compute risk scores and estimate PD/LGD
3. Assign credit rating with rationale

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "risk_scorer", "customer_id": customer_id, "scoring": result.output}
