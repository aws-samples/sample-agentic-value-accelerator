"""Product Matcher Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class ProductMatcher(StrandsAgent):
    name = "product_matcher"
    system_prompt = """You are a Banking Product Matching Specialist.

Responsibilities:
1. Match customer needs to available banking products
2. Score match confidence based on profile fit
3. Provide product recommendations with rationale
4. Consider cross-sell and upsell opportunities

Output: Matched products, confidence scores, and recommendations."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def match_products(customer_id: str, context: str | None = None) -> dict:
    agent = ProductMatcher()
    input_text = f"""Match products for customer: {customer_id}

Steps:
1. Retrieve customer data using s3_retriever_tool with data_type='profile'
2. Analyze needs and eligible products
3. Score and rank matches

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "product_matcher", "customer_id": customer_id, "analysis": result.output}
