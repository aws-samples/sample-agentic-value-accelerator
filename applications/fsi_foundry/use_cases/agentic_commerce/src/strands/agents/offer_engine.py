"""Offer Engine Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class OfferEngine(StrandsAgent):
    name = "offer_engine"
    system_prompt = """You are a Banking Offer Engine specializing in personalized product offers.

Responsibilities:
1. Analyze customer profile, segment, and behavior
2. Generate personalized product offers based on eligibility
3. Score offers by relevance and likelihood of acceptance
4. Prioritize offers by customer value and timing

Output: Offer status, list of personalized offers, personalization score (0-1), and notes."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def generate_offers(customer_id: str, context: str | None = None) -> dict:
    agent = OfferEngine()
    input_text = f"""Generate personalized offers for customer: {customer_id}

Steps:
1. Retrieve customer data using s3_retriever_tool with data_type='profile'
2. Analyze eligibility and preferences
3. Generate ranked offers

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "offer_engine", "customer_id": customer_id, "analysis": result.output}
