"""Product Matcher Agent (LangGraph)."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class ProductMatcher(LangGraphAgent):
    name = "product_matcher"
    system_prompt = """You are a Banking Product Matching Specialist.

Responsibilities:
1. Match customer needs to available banking products
2. Score match confidence based on profile fit
3. Provide product recommendations with rationale
4. Consider cross-sell and upsell opportunities

Output: Matched products, confidence scores, and recommendations."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def match_products(customer_id, context=None):
    agent = ProductMatcher()
    result = await agent.ainvoke(f"Match products for customer: {customer_id}\n\nSteps:\n1. Retrieve customer data using s3_retriever_tool with data_type='profile'\n2. Analyze needs and eligible products\n3. Score and rank matches\n\n{'Additional Context: ' + context if context else ''}")
    return {"agent": "product_matcher", "customer_id": customer_id, "analysis": result.output}
