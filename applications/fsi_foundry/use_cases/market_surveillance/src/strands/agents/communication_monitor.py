"""CommunicationMonitor Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class CommunicationMonitor(StrandsAgent):
    name = "communication_monitor"
    system_prompt = """You are a Communication Monitor screening trader communications for compliance violations and information barriers.

Analyze the provided surveillance data thoroughly and provide structured findings.
Be specific about regulatory concerns (MAR, Dodd-Frank, MiFID II where applicable)."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def run_communication_monitor(customer_id, context=None):
    agent = CommunicationMonitor()
    result = await agent.ainvoke(f"""Monitor communications for: {customer_id}

Steps:
1. Retrieve data using s3_retriever_tool with data_type='profile'
2. Analyze thoroughly
3. Provide structured assessment

{"Additional Context: " + context if context else ""}""")
    return {"agent": "communication_monitor", "customer_id": customer_id, "analysis": result.output}
