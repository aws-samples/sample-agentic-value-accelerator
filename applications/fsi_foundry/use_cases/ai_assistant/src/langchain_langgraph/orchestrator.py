"""
AI Assistant Orchestrator.

Orchestrates specialist agents (TaskRouter, DataLookupAgent, ReportGenerator)
for comprehensive employee assistance in banking.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.ai_assistant.agents import TaskRouter, DataLookupAgent, ReportGenerator
from use_cases.ai_assistant.agents.task_router import route_task
from use_cases.ai_assistant.agents.data_lookup_agent import lookup_data
from use_cases.ai_assistant.agents.report_generator import generate_report
from use_cases.ai_assistant.models import (
    AssistantRequest,
    AssistantResponse,
    TaskType,
    TaskResult,
    TaskStatus,
    Priority,
)

from pydantic import BaseModel, Field

class AiAssistantSynthesisSchema(BaseModel):
    """Structured synthesis output schema for ai_assistant."""
    task_status: str = Field(default="completed", description="Task status: completed, in_progress, or failed")
    task_priority: str = Field(default="medium", description="Priority: low, medium, high, or urgent")
    actions_performed: list[str] = Field(default_factory=list, description="Actions performed")
    follow_up_items: list[str] = Field(default_factory=list, description="Suggested follow-up items")
    recommendations: list[str] = Field(default_factory=list, description="Productivity recommendations")
    summary: str = Field(..., description="Executive summary of the task output")



class AiAssistantState(TypedDict):
    """State managed by the AI assistant orchestrator graph."""
    messages: Annotated[list, add_messages]
    employee_id: str
    task_type: str
    task_router_result: dict | None
    data_lookup_agent_result: dict | None
    report_generator_result: dict | None
    final_summary: str | None


class AiAssistantOrchestrator(LangGraphOrchestrator):
    """AI Assistant Orchestrator using LangGraphOrchestrator base class."""

    name = "ai_assistant_orchestrator"
    state_schema = AiAssistantState

    system_prompt = """You are a Senior AI Assistant Coordinator for a banking institution.

Your role is to:
1. Coordinate specialist agents (Task Router, Data Lookup Agent, Report Generator)
2. Synthesize their findings into a comprehensive task output
3. Ensure employee requests are fulfilled efficiently and accurately

When creating the final summary, consider:
- Task completion status and quality of the output
- Data accuracy and freshness of retrieved information
- Report formatting and presentation quality
- Clear next steps and follow-up recommendations
- Overall productivity impact and time savings

Be concise but thorough. Your summary will be used by banking employees for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "task_router": TaskRouter(),
                "data_lookup_agent": DataLookupAgent(),
                "report_generator": ReportGenerator(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the AI assistant workflow graph."""
        workflow = StateGraph(AiAssistantState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("task_router", self._task_router_node)
        workflow.add_node("data_lookup_agent", self._data_lookup_agent_node)
        workflow.add_node("report_generator", self._report_generator_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "data_lookup_agent": "data_lookup_agent",
                "report_generator": "report_generator",
                "task_router": "task_router",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "task_router",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "data_lookup_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "report_generator",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: AiAssistantState) -> Literal[
        "parallel_assessment", "task_router", "data_lookup_agent", "report_generator", "synthesize"
    ]:
        """Route to the next node based on current state."""
        task_type = state.get("task_type", "full")
        router_done = state.get("task_router_result") is not None
        lookup_done = state.get("data_lookup_agent_result") is not None
        report_done = state.get("report_generator_result") is not None

        if task_type == "data_lookup":
            return "synthesize" if lookup_done else "data_lookup_agent"

        if task_type == "report_generation":
            return "synthesize" if report_done else "report_generator"

        if task_type == "document_summary":
            if router_done and lookup_done:
                return "synthesize"
            return "parallel_assessment"

        if task_type == "task_automation":
            if router_done and report_done:
                return "synthesize"
            return "parallel_assessment"

        # Full assessment
        if not router_done and not lookup_done and not report_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: AiAssistantState) -> AiAssistantState:
        """Execute assessments in parallel."""
        import asyncio
        employee_id = state["employee_id"]
        context = self._extract_context(state)
        task_type = state.get("task_type", "full")

        if task_type == "document_summary":
            router_result, lookup_result = await asyncio.gather(
                route_task(employee_id, context),
                lookup_data(employee_id, context)
            )
            return {
                **state,
                "task_router_result": router_result,
                "data_lookup_agent_result": lookup_result,
                "messages": state["messages"] + [
                    AIMessage(content=f"Task Routing Complete: {json.dumps(router_result, indent=2)}"),
                    AIMessage(content=f"Data Lookup Complete: {json.dumps(lookup_result, indent=2)}"),
                ],
            }
        elif task_type == "task_automation":
            router_result, report_result = await asyncio.gather(
                route_task(employee_id, context),
                generate_report(employee_id, context)
            )
            return {
                **state,
                "task_router_result": router_result,
                "report_generator_result": report_result,
                "messages": state["messages"] + [
                    AIMessage(content=f"Task Routing Complete: {json.dumps(router_result, indent=2)}"),
                    AIMessage(content=f"Report Generation Complete: {json.dumps(report_result, indent=2)}"),
                ],
            }
        else:
            # Full - run all three
            router_result, lookup_result, report_result = await asyncio.gather(
                route_task(employee_id, context),
                lookup_data(employee_id, context),
                generate_report(employee_id, context)
            )
            return {
                **state,
                "task_router_result": router_result,
                "data_lookup_agent_result": lookup_result,
                "report_generator_result": report_result,
                "messages": state["messages"] + [
                    AIMessage(content=f"Task Routing Complete: {json.dumps(router_result, indent=2)}"),
                    AIMessage(content=f"Data Lookup Complete: {json.dumps(lookup_result, indent=2)}"),
                    AIMessage(content=f"Report Generation Complete: {json.dumps(report_result, indent=2)}"),
                ],
            }

    async def _task_router_node(self, state: AiAssistantState) -> AiAssistantState:
        """Execute task routing."""
        employee_id = state["employee_id"]
        context = self._extract_context(state)
        result = await route_task(employee_id, context)

        return {
            **state,
            "task_router_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Task Routing Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _data_lookup_agent_node(self, state: AiAssistantState) -> AiAssistantState:
        """Execute data lookup."""
        employee_id = state["employee_id"]
        context = self._extract_context(state)
        result = await lookup_data(employee_id, context)

        return {
            **state,
            "data_lookup_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Lookup Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _report_generator_node(self, state: AiAssistantState) -> AiAssistantState:
        """Execute report generation."""
        employee_id = state["employee_id"]
        context = self._extract_context(state)
        result = await generate_report(employee_id, context)

        return {
            **state,
            "report_generator_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Report Generation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "employee_id", "task_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(AiAssistantSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: AiAssistantState) -> str | None:
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_ai_assistant(request):
    """Run the assessment workflow."""
    orchestrator = AiAssistantOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.employee_id}")],
        "employee_id": request.employee_id,
        "task_type": request.task_type.value if hasattr(request.task_type, 'value') else str(request.task_type),
    }
    for key in [k for k in AiAssistantState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    result = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("task_status"):
            result = TaskResult(
                status=TaskStatus(structured.get("task_status", "completed")),
                priority=Priority(structured.get("task_priority", "medium")),
                output_data={}, actions_performed=structured.get("actions_performed", []),
                follow_up_items=structured.get("follow_up_items", []))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return AssistantResponse(
        employee_id=request.employee_id, task_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), result=result, recommendations=recommendations,
        summary=summary,
        raw_analysis={"task_router_result": final_state.get("task_router_result"), "data_lookup_agent_result": final_state.get("data_lookup_agent_result"), "report_generator_result": final_state.get("report_generator_result")},
    )
