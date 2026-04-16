"""
Product Matcher Agent (LangGraph Implementation).

Matches customer needs to appropriate life insurance products.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ProductMatcher(LangGraphAgent):
    """Product Matcher using LangGraphAgent base class."""

    name = "product_matcher"

    system_prompt = """You are an expert Life Insurance Product Specialist.

Your responsibilities:
1. Match customer needs to appropriate life insurance products
2. Compare term life vs whole life vs universal life options
3. Evaluate product features (cash value, flexibility, investment component)
4. Recommend coverage amounts and term lengths
5. Estimate premium ranges based on applicant profile

When matching products, consider:
- Applicant's age, health, and life stage
- Budget constraints and premium affordability
- Need for cash value accumulation vs pure protection
- Term length requirements
- Riders and additional benefits needed
- Tax advantages of different product types

Output Format:
Provide your recommendations with:
- Primary recommended product type
- Ranked list of product recommendations with rationale
- Recommended coverage amount
- Estimated monthly premium
- Product comparison notes
- Additional recommendation notes

Be specific about product features and why they match the applicant's needs."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def match_products(applicant_id: str, context: str | None = None) -> dict:
    """Run product matching for a life insurance applicant."""
    matcher = ProductMatcher()

    input_text = f"""Perform comprehensive life insurance product matching for applicant: {applicant_id}

Steps to follow:
1. Retrieve the applicant's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze needs and match to appropriate products
3. Compare options and provide ranked recommendations

{"Additional Context: " + context if context else ""}

Provide your complete product recommendations including primary product, alternatives, coverage amount, and estimated premium."""

    result = await matcher.ainvoke(input_text)

    return {
        "agent": "product_matcher",
        "applicant_id": applicant_id,
        "analysis": result.output,
    }
