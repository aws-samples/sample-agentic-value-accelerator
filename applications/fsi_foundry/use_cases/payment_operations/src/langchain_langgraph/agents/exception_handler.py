"""Exception Handler Agent (LangGraph)."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ExceptionHandler(LangGraphAgent):
    name = "exception_handler"

    system_prompt = """You are a Payment Exception Handler specializing in banking payment operations.

Your responsibilities:
1. Analyze payment exceptions (failed transactions, mismatches, compliance holds)
2. Determine root cause and severity
3. Recommend resolution actions
4. Flag items requiring escalation

Output Format:
- Exception Severity (LOW/MEDIUM/HIGH/CRITICAL)
- Root Cause Analysis
- Resolution Actions taken or recommended
- Whether escalation is required (yes/no)
- Specific notes for the operations team"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def handle_exception(customer_id: str, context: str | None = None) -> dict:
    agent = ExceptionHandler()
    input_text = f"""Analyze payment exception for: {customer_id}

Steps:
1. Retrieve payment data using s3_retriever_tool with data_type='profile'
2. Analyze the exception details
3. Provide resolution recommendation

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "exception_handler", "customer_id": customer_id, "analysis": result.output}
