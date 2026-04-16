"""
AI Assistant Orchestrator (Strands Implementation).

Orchestrates specialist agents (TaskRouter, DataLookupAgent, ReportGenerator)
for comprehensive employee assistance in banking.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import TaskRouter, DataLookupAgent, ReportGenerator
from .agents.task_router import route_task
from .agents.data_lookup_agent import lookup_data
from .agents.report_generator import generate_report
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    AssistantRequest,
    AssistantResponse,
    TaskType,
    TaskResult,
    TaskStatus,
    Priority,
)


class AiAssistantOrchestrator(StrandsOrchestrator):
    """AI Assistant Orchestrator using StrandsOrchestrator base class."""

    name = "ai_assistant_orchestrator"

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

    def run_assessment(
        self,
        employee_id: str,
        task_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run the AI assistant workflow."""
        router_result = None
        lookup_result = None
        report_result = None

        input_text = self._build_input_text(employee_id, context)

        if task_type == "full":
            results = self.run_parallel(
                ["task_router", "data_lookup_agent", "report_generator"],
                input_text
            )
            router_result = {"agent": "task_router", "employee_id": employee_id, "routing": results["task_router"].output}
            lookup_result = {"agent": "data_lookup_agent", "employee_id": employee_id, "lookup_result": results["data_lookup_agent"].output}
            report_result = {"agent": "report_generator", "employee_id": employee_id, "report": results["report_generator"].output}
        elif task_type == "data_lookup":
            result = self.run_agent("data_lookup_agent", input_text)
            lookup_result = {"agent": "data_lookup_agent", "employee_id": employee_id, "lookup_result": result.output}
        elif task_type == "report_generation":
            result = self.run_agent("report_generator", input_text)
            report_result = {"agent": "report_generator", "employee_id": employee_id, "report": result.output}
        elif task_type == "document_summary":
            results = self.run_parallel(["task_router", "data_lookup_agent"], input_text)
            router_result = {"agent": "task_router", "employee_id": employee_id, "routing": results["task_router"].output}
            lookup_result = {"agent": "data_lookup_agent", "employee_id": employee_id, "lookup_result": results["data_lookup_agent"].output}
        elif task_type == "task_automation":
            results = self.run_parallel(["task_router", "report_generator"], input_text)
            router_result = {"agent": "task_router", "employee_id": employee_id, "routing": results["task_router"].output}
            report_result = {"agent": "report_generator", "employee_id": employee_id, "report": results["report_generator"].output}

        synthesis_prompt = self._build_synthesis_prompt(router_result, lookup_result, report_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "employee_id": employee_id,
            "router_result": router_result,
            "lookup_result": lookup_result,
            "report_result": report_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        employee_id: str,
        task_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        router_result = None
        lookup_result = None
        report_result = None

        if task_type == "full":
            router_result, lookup_result, report_result = await asyncio.gather(
                route_task(employee_id, context),
                lookup_data(employee_id, context),
                generate_report(employee_id, context)
            )
        elif task_type == "data_lookup":
            lookup_result = await lookup_data(employee_id, context)
        elif task_type == "report_generation":
            report_result = await generate_report(employee_id, context)
        elif task_type == "document_summary":
            router_result, lookup_result = await asyncio.gather(
                route_task(employee_id, context),
                lookup_data(employee_id, context)
            )
        elif task_type == "task_automation":
            router_result, report_result = await asyncio.gather(
                route_task(employee_id, context),
                generate_report(employee_id, context)
            )

        synthesis_prompt = self._build_synthesis_prompt(router_result, lookup_result, report_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "employee_id": employee_id,
            "router_result": router_result,
            "lookup_result": lookup_result,
            "report_result": report_result,
            "final_summary": summary,
        }

    def _build_input_text(self, employee_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for banking employee: {employee_id}

Steps to follow:
1. Retrieve the employee's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(
        self,
        router_result: Dict[str, Any] | None,
        lookup_result: Dict[str, Any] | None,
        report_result: Dict[str, Any] | None
    ) -> str:
        sections = []
        if router_result:
            sections.append(f"## Task Routing\n{json.dumps(router_result, indent=2)}")
        if lookup_result:
            sections.append(f"## Data Lookup\n{json.dumps(lookup_result, indent=2)}")
        if report_result:
            sections.append(f"## Report Generation\n{json.dumps(report_result, indent=2)}")

        return f"""Based on the following specialist output{"s" if len(sections) > 1 else ""}, provide a final assistant response:

{chr(10).join(sections)}

Provide a concise summary that includes:
1. Task completion status
2. Key findings and data points
3. Recommendations and next steps
4. Follow-up items if applicable"""



async def run_ai_assistant(request):
    """Run the assessment workflow."""
    orchestrator = AiAssistantOrchestrator()
    final_state = await orchestrator.arun_assessment(
        employee_id=request.employee_id,
        task_type=request.task_type.value if hasattr(request.task_type, 'value') else str(request.task_type),
        context=getattr(request, 'additional_context', None))

    result = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
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
        raw_analysis={"task_router_result": final_state.get("router_result"), "data_lookup_agent_result": final_state.get("lookup_result"), "report_generator_result": final_state.get("report_result")},
    )
