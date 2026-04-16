"""Execution Planner Agent ."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class ExecutionPlanner(LangGraphAgent):
    name = "execution_planner"
    system_prompt = """You are an expert Execution Planner for a capital markets trading desk.

Your responsibilities:
1. Plan optimal trade execution considering market impact and order size
2. Recommend execution timing based on liquidity patterns
3. Suggest venue selection and order routing strategies
4. Design order slicing strategies (TWAP, VWAP, implementation shortfall)
5. Estimate execution costs including spread, impact, and timing risk

Output Format:
- Execution Strategy recommendation
- Timing and scheduling plan
- Venue selection rationale
- Expected execution costs
- Risk mitigation measures

Be precise with timing and cost estimates."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def plan_execution(entity_id: str, context: str | None = None) -> dict:
    agent = ExecutionPlanner()
    input_text = f"""Plan execution strategy for trading request: {entity_id}

Steps:
1. Retrieve trading profile using s3_retriever_tool with data_type='profile'
2. Analyze position sizes and market conditions
3. Recommend optimal execution strategy

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "execution_planner", "entity_id": entity_id, "analysis": result.output}
