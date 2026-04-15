"""Fulfillment Agent (LangGraph)."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class FulfillmentAgent(LangGraphAgent):
    name = "fulfillment_agent"
    system_prompt = """You are a Banking Fulfillment Specialist managing offer delivery and product activation.

Responsibilities:
1. Determine optimal fulfillment channel (digital, branch, phone)
2. Track fulfillment steps and completion status
3. Identify blockers preventing fulfillment
4. Ensure regulatory requirements are met before activation

Output: Fulfillment status, channel, steps completed, and any blockers."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def process_fulfillment(customer_id, context=None):
    agent = FulfillmentAgent()
    result = await agent.ainvoke(f"Process fulfillment for customer: {customer_id}\n\nSteps:\n1. Retrieve customer data using s3_retriever_tool with data_type='profile'\n2. Assess fulfillment readiness and channel\n3. Identify any blockers\n\n{'Additional Context: ' + context if context else ''}")
    return {"agent": "fulfillment_agent", "customer_id": customer_id, "assessment": result.output}
