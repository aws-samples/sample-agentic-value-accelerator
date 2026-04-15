"""Offer Engine Agent (LangGraph)."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class OfferEngine(LangGraphAgent):
    name = "offer_engine"
    system_prompt = """You are a Banking Offer Engine specializing in personalized product offers.

Responsibilities:
1. Analyze customer profile, segment, and behavior
2. Generate personalized product offers based on eligibility
3. Score offers by relevance and likelihood of acceptance
4. Prioritize offers by customer value and timing

Output: Offer status, list of personalized offers, personalization score (0-1), and notes."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def generate_offers(customer_id, context=None):
    agent = OfferEngine()
    result = await agent.ainvoke(f"Generate personalized offers for customer: {customer_id}\n\nSteps:\n1. Retrieve customer data using s3_retriever_tool with data_type='profile'\n2. Analyze eligibility and preferences\n3. Generate ranked offers\n\n{'Additional Context: ' + context if context else ''}")
    return {"agent": "offer_engine", "customer_id": customer_id, "analysis": result.output}
