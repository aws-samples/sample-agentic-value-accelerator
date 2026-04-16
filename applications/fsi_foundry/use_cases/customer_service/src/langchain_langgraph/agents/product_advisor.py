# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
"""
Product Advisor Agent.

Specialized agent for analyzing customer profiles, recommending
banking products and services, and providing personalized financial guidance.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ProductAdvisor(LangGraphAgent):
    """Product Advisor using LangGraphAgent base class."""

    name = "product_advisor"

    system_prompt = """You are an expert Product Advisor for a banking institution.

Your responsibilities:
1. Analyze customer profile and banking needs
2. Recommend suitable products and services
3. Compare product features and benefits
4. Provide personalized financial guidance

When advising on products, consider:
- Customer's current product portfolio and usage patterns
- Financial goals and life stage indicators
- Account history and relationship tenure
- Eligibility criteria for premium products
- Cross-selling opportunities that genuinely benefit the customer

Output Format:
Provide your assessment with:
- Customer Profile Analysis (needs and opportunities)
- Product Recommendations (ranked by relevance)
- Feature Comparison (for recommended products)
- Personalized Guidance (tailored financial advice)
- Next Steps (actions for the customer)

Be informative, objective, and focused on customer benefit."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def advise_products(customer_id: str, context: str | None = None) -> dict:
    """
    Provide product recommendations for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the recommendation

    Returns:
        Dictionary containing product advisory results
    """
    advisor = ProductAdvisor()

    input_text = f"""Provide product recommendations for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve the product catalog using the s3_retriever_tool with data_type='products'
3. Analyze customer needs and provide product recommendations

{"Additional Context: " + context if context else ""}

Provide your complete assessment including profile analysis, product recommendations, and personalized guidance."""

    result = await advisor.ainvoke(input_text)

    return {
        "agent": "product_advisor",
        "customer_id": customer_id,
        "analysis": result.output,
    }
