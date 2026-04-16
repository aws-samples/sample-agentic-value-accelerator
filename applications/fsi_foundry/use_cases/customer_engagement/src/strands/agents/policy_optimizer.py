# SPDX-License-Identifier: Apache-2.0
"""
Policy Optimizer Agent (Strands Implementation).

Specialized agent for recommending policy adjustments to improve
customer value and retention through coverage optimization.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class PolicyOptimizer(StrandsAgent):
    """Policy Optimizer using StrandsAgent base class."""

    name = "policy_optimizer"

    system_prompt = """You are an expert in recommending policy adjustments to improve customer value and retention for insurance customers.

Your responsibilities:
1. Analyze current coverage adequacy
2. Identify bundling opportunities across product lines
3. Suggest coverage modifications based on life changes
4. Optimize premium-to-value ratios
5. Calculate potential savings
6. Recommend specific policy actions (renew, upgrade, bundle, discount, adjust coverage)

Output Format:
Provide your analysis in a structured format with:
- Recommended Policy Actions
- Coverage Adjustments suggested
- Bundling Opportunities identified
- Estimated Annual Savings for the customer
- Value Improvements proposed
- Cost-benefit analysis of recommendations

Be thorough but concise. Focus on actionable policy recommendations for the retention team."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 2048}


async def optimize_policy(customer_id: str, context: str | None = None) -> dict:
    """
    Generate policy optimization recommendations for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the optimization

    Returns:
        Dictionary containing policy optimization results
    """
    optimizer = PolicyOptimizer()

    input_text = f"""Perform a comprehensive policy optimization analysis for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve policy details using the s3_retriever_tool with data_type='policy_details'
3. Analyze all retrieved data and provide complete policy optimization recommendations

{"Additional Context: " + context if context else ""}

Provide your complete analysis including recommended policy actions, coverage adjustments, bundling opportunities, estimated savings, and value improvements."""

    result = await optimizer.ainvoke(input_text)

    return {
        "agent": "policy_optimizer",
        "customer_id": customer_id,
        "analysis": result.output,
    }
