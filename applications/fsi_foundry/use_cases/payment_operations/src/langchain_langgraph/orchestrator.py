"""Payment Operations Orchestrator (LangGraph)."""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.payment_operations.agents import ExceptionHandler, SettlementAgent
from use_cases.payment_operations.agents.exception_handler import handle_exception
from use_cases.payment_operations.agents.settlement_agent import process_settlement
from use_cases.payment_operations.models import (
    OperationsRequest, OperationsResponse, OperationType,
    ExceptionResolution, ExceptionSeverity,
    SettlementResult, SettlementStatus,
)

from pydantic import BaseModel, Field

class PaymentOperationsSynthesisSchema(BaseModel):
    """Structured synthesis output schema for payment_operations."""
    exception_severity: str = Field(default="medium", description="Exception severity: low, medium, high, or critical")
    exception_resolution: str = Field(default="Pending review", description="Resolution description")
    exception_actions: list[str] = Field(default_factory=list, description="Actions taken")
    exception_requires_escalation: str = Field(default="false", description="Whether escalation is required")
    settlement_status: str = Field(default="pending", description="Settlement status: pending, completed, failed, or cancelled")
    settlement_reconciled: str = Field(default="false", description="Whether settlement is reconciled")
    settlement_notes: list[str] = Field(default_factory=list, description="Settlement notes")
    summary: str = Field(..., description="Executive summary of operations assessment")



class PaymentOpsState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_id: str
    operation_type: str
    exception_result: dict | None
    settlement_result: dict | None
    final_summary: str | None


class PaymentOpsOrchestrator(LangGraphOrchestrator):
    name = "payment_ops_orchestrator"
    state_schema = PaymentOpsState

    system_prompt = """You are a Senior Payment Operations Supervisor.

Your role is to:
1. Coordinate exception handling and settlement processing
2. Synthesize findings into an operations decision
3. Recommend: PROCEED / HOLD / REJECT / ESCALATE

Be concise. Your summary drives operational decisions."""

    def __init__(self):
        super().__init__(agents={
            "exception_handler": ExceptionHandler(),
            "settlement_agent": SettlementAgent(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(PaymentOpsState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("exception_handler", self._exception_handler_node)
        workflow.add_node("settlement_agent", self._settlement_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "exception_handler": "exception_handler",
            "settlement_agent": "settlement_agent",
        })

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("exception_handler", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("settlement_agent", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: PaymentOpsState) -> Literal["parallel_assessment", "exception_handler", "settlement_agent", "synthesize"]:
        op_type = state.get("operation_type", "full")
        exc_done = state.get("exception_result") is not None
        stl_done = state.get("settlement_result") is not None

        if op_type == "exception_only":
            return "synthesize" if exc_done else "exception_handler"
        if op_type == "settlement_only":
            return "synthesize" if stl_done else "settlement_agent"
        if not exc_done and not stl_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: PaymentOpsState) -> PaymentOpsState:
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        exc_result, stl_result = await self._run_parallel(customer_id, context)

        return {
            **state,
            "exception_result": exc_result,
            "settlement_result": stl_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Exception Analysis: {json.dumps(exc_result, indent=2)}"),
                AIMessage(content=f"Settlement Assessment: {json.dumps(stl_result, indent=2)}"),
            ],
        }

    async def _run_parallel(self, customer_id, context):
        import asyncio
        return await asyncio.gather(handle_exception(customer_id, context), process_settlement(customer_id, context))

    async def _exception_handler_node(self, state: PaymentOpsState) -> PaymentOpsState:
        result = await handle_exception(state["customer_id"], self._extract_context(state))
        return {**state, "exception_result": result, "messages": state["messages"] + [AIMessage(content=f"Exception: {json.dumps(result, indent=2)}")]}

    async def _settlement_agent_node(self, state: PaymentOpsState) -> PaymentOpsState:
        result = await process_settlement(state["customer_id"], self._extract_context(state))
        return {**state, "settlement_result": result, "messages": state["messages"] + [AIMessage(content=f"Settlement: {json.dumps(result, indent=2)}")]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "operation_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(PaymentOperationsSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: PaymentOpsState) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"):
                return last.content
        return None



async def run_payment_operations(request):
    """Run the assessment workflow."""
    orchestrator = PaymentOpsOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "operation_type": request.operation_type.value if hasattr(request.operation_type, 'value') else str(request.operation_type),
    }
    for key in [k for k in PaymentOpsState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    exception_resolution = None; settlement_result = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("exception_severity"):
            exception_resolution = ExceptionResolution(
                severity=ExceptionSeverity(structured.get("exception_severity", "medium")),
                resolution=structured.get("exception_resolution", "Pending review"),
                actions_taken=structured.get("exception_actions", []),
                requires_escalation=str(structured.get("exception_requires_escalation", "false")).lower() in ("true", "1", "yes"))
        if structured.get("settlement_status"):
            settlement_result = SettlementResult(
                status=SettlementStatus(structured.get("settlement_status", "pending")),
                settlement_date=None, reconciled=str(structured.get("settlement_reconciled", "false")).lower() in ("true", "1", "yes"),
                notes=structured.get("settlement_notes", []))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return OperationsResponse(
        customer_id=request.customer_id, operation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), exception_resolution=exception_resolution, settlement_result=settlement_result,
        summary=summary,
        raw_analysis={"exception_result": final_state.get("exception_result"), "settlement_result": final_state.get("settlement_result")},
    )
