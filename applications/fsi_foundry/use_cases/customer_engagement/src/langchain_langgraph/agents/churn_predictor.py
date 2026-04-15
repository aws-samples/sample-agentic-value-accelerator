# SPDX-License-Identifier: Apache-2.0
"""
Churn Predictor Agent.

Specialized agent for predicting customer churn risk by analyzing
behavioral patterns, policy history, and engagement metrics.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ChurnPredictor(LangGraphAgent):
    """Churn Predictor using LangGraphAgent base class."""

    name = "churn_predictor"

    system_prompt = """You are an expert in predicting customer churn risk for insurance customers.

Your responsibilities:
1. Analyze behavioral patterns (login frequency, app usage, service interactions)
2. Evaluate policy history (renewals, lapses, changes)
3. Assess claims frequency and severity
4. Review payment regularity and delinquency
5. Monitor engagement metrics (email opens, call frequency)
6. Identify life event indicators that may affect retention

Output Format:
Provide your analysis in a structured format with:
- Churn Probability Score (0.0-1.0)
- Risk Level (LOW/MODERATE/HIGH/CRITICAL)
- Key Risk Factors identified
- Behavioral Signals observed
- Estimated Retention Window (days before likely churn)
- Recommended immediate actions

Be thorough but concise. Focus on actionable insights for the retention team."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 1024}


async def predict_churn(customer_id: str, context: str | None = None) -> dict:
    """
    Run churn prediction analysis for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the analysis

    Returns:
        Dictionary containing churn prediction results
    """
    predictor = ChurnPredictor()

    input_text = f"""Perform a comprehensive churn prediction analysis for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve claims history using the s3_retriever_tool with data_type='claims_history'
3. Retrieve payment history using the s3_retriever_tool with data_type='payment_history'
4. Analyze all retrieved data and provide a complete churn prediction assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including churn probability score, risk level, key risk factors, behavioral signals, and estimated retention window."""

    result = await predictor.ainvoke(input_text)

    return {
        "agent": "churn_predictor",
        "customer_id": customer_id,
        "analysis": result.output,
    }
