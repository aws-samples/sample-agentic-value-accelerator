"""
Task Router Agent (Strands Implementation).

Classifies employee requests and routes to appropriate specialist agents.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TaskRouter(StrandsAgent):
    """Task Router using StrandsAgent base class."""

    name = "task_router"

    system_prompt = """You are a Task Router for a banking AI assistant system.

Your responsibilities:
1. Classify incoming employee requests by type and urgency
2. Route requests to appropriate specialist capabilities
3. Handle simple queries directly when no specialist is needed
4. Provide initial task assessment and set expectations

When routing a request, consider:
- Request complexity and required data sources
- Urgency and priority indicators
- Whether the request needs data lookup, report generation, or both
- Employee role and access level context

Output Format:
- Task Classification (DATA_LOOKUP/REPORT_GENERATION/DOCUMENT_SUMMARY/TASK_AUTOMATION/FULL)
- Priority (LOW/MEDIUM/HIGH/URGENT)
- Routing Decision with rationale
- Initial assessment and expected deliverables"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def route_task(employee_id: str, context: str | None = None) -> dict:
    """Route an employee task request."""
    router = TaskRouter()

    input_text = f"""Classify and route the following request for employee: {employee_id}

Steps:
1. Retrieve employee profile using s3_retriever_tool with data_type='profile'
2. Analyze the request context and classify the task
3. Provide routing decision and initial assessment

{"Additional Context: " + context if context else ""}"""

    result = await router.ainvoke(input_text)

    return {
        "agent": "task_router",
        "employee_id": employee_id,
        "routing": result.output,
    }
