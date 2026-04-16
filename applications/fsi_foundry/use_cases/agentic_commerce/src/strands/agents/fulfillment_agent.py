"""Fulfillment Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class FulfillmentAgent(StrandsAgent):
    name = "fulfillment_agent"
    system_prompt = """You are a Banking Fulfillment Specialist managing offer delivery and product activation.

Responsibilities:
1. Determine optimal fulfillment channel (digital, branch, phone)
2. Track fulfillment steps and completion status
3. Identify blockers preventing fulfillment
4. Ensure regulatory requirements are met before activation

Output: Fulfillment status, channel, steps completed, and any blockers."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def process_fulfillment(customer_id: str, context: str | None = None) -> dict:
    agent = FulfillmentAgent()
    input_text = f"""Process fulfillment for customer: {customer_id}

Steps:
1. Retrieve customer data using s3_retriever_tool with data_type='profile'
2. Assess fulfillment readiness and channel
3. Identify any blockers

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "fulfillment_agent", "customer_id": customer_id, "assessment": result.output}
