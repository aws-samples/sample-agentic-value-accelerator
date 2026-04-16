"""Client Profiler Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class ClientProfiler(StrandsAgent):
    name = "client_profiler"
    system_prompt = """You are an expert Client Profiler for investment advisory.
Your responsibilities:
1. Assess client risk tolerance and investment objectives
2. Evaluate time horizon and liquidity needs
3. Ensure suitability of recommendations for client profile
4. Identify life stage and financial planning considerations
5. Align investment strategy with client goals
Output: Risk Profile, Investment Goals, Time Horizon Assessment, Suitability Analysis, Strategy Alignment."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def profile_client(client_id: str, context: str | None = None) -> dict:
    agent = ClientProfiler()
    input_text = f"""Profile investment client: {client_id}
Steps: 1. Retrieve client profile using s3_retriever_tool with data_type='profile'
2. Assess risk tolerance and goals 3. Provide suitability analysis
{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "client_profiler", "customer_id": client_id, "analysis": result.output}
