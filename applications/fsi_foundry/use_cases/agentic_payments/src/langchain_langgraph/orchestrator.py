"""
Agentic Payments Orchestrator.

Orchestrates specialist agents (Payment Validator, Routing Agent, Reconciliation Agent)
for comprehensive payment processing workflows.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from .agents import PaymentValidator, RoutingAgent, ReconciliationAgent
from .agents.payment_validator import validate_payment
from .agents.routing_agent import route_payment
from .agents.reconciliation_agent import reconcile_payment
from .models import (
    PaymentRequest,
    PaymentResponse,
    PaymentType,
    ValidationResult,
    ValidationStatus,
    RoutingDecision,
    PaymentRail,
    ReconciliationStatus,
)


from pydantic import BaseModel, Field

class PaymentSynthesisSchema(BaseModel):
    """Structured synthesis output schema for agentic_payments."""
    validation_status: str = Field(default="requires_review", description="Validation status: approved, rejected, or requires_review")
    validation_risk_score: int = Field(default=50, description="Risk score from 0 to 100")
    validation_rules_checked: list[str] = Field(default_factory=list, description="List of rules and limits checked")
    validation_violations: list[str] = Field(default_factory=list, description="List of rule violations detected")
    routing_selected_rail: str = Field(default="fedwire", description="Selected payment rail: ach, fedwire, rtp, swift, or internal")
    routing_settlement_time: str = Field(default="Same day", description="Estimated settlement time")
    routing_rationale: str = Field(default="Standard routing", description="Rationale for rail selection")
    reconciliation_status: str = Field(default="pending", description="Reconciliation status: pending, matched, unmatched, or discrepancy")
    summary: str = Field(..., description="Executive summary of payment processing results")

class AgenticPaymentsState(TypedDict):
    """State managed by the agentic payments orchestrator graph."""
    messages: Annotated[list, add_messages]
    payment_id: str
    payment_type: str
    validation_result: dict | None
    routing_result: dict | None
    reconciliation_result: dict | None
    final_summary: str | None


class AgenticPaymentsOrchestrator(LangGraphOrchestrator):
    """
    Agentic Payments Orchestrator using LangGraphOrchestrator base class.

    Coordinates Payment Validator, Routing Agent, and Reconciliation Agent
    for comprehensive payment processing.
    """

    name = "agentic_payments_orchestrator"
    state_schema = AgenticPaymentsState

    system_prompt = """You are a Senior Payment Operations Supervisor for financial transaction processing.

Your role is to:
1. Coordinate the work of specialist agents (Payment Validator, Routing Agent, Reconciliation Agent)
2. Synthesize their findings into a comprehensive payment processing decision
3. Make final recommendations for payment execution

When creating the final summary, consider:
- Overall payment viability combining validation, routing, and reconciliation
- Any conflicts or concerns raised by specialist agents
- Clear recommendation: EXECUTE / REJECT / ESCALATE FOR REVIEW
- Optimal routing selection and risk mitigation strategies

Be concise but thorough. Your summary will be used by payment operations teams."""

    def __init__(self):
        super().__init__(
            agents={
                "payment_validator": PaymentValidator(),
                "routing_agent": RoutingAgent(),
                "reconciliation_agent": ReconciliationAgent(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the agentic payments workflow graph."""
        workflow = StateGraph(AgenticPaymentsState)

        # Add nodes
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("reconciliation_agent", self._reconciliation_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # Set entry point
        workflow.set_entry_point("parallel_assessment")

        # Define edges
        workflow.add_conditional_edges(
            "parallel_assessment",
            self._router,
            {
                "reconciliation_agent": "reconciliation_agent",
                "synthesize": "synthesize",
            },
        )
        workflow.add_edge("reconciliation_agent", "synthesize")
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: AgenticPaymentsState) -> Literal["reconciliation_agent", "synthesize"]:
        """Route to the next node based on payment type."""
        payment_type = state.get("payment_type", "wire")
        reconciliation_done = state.get("reconciliation_result") is not None

        # Run reconciliation for wire, ach, international payments
        if payment_type in ["wire", "ach", "international"] and not reconciliation_done:
            return "reconciliation_agent"

        return "synthesize"

    async def _parallel_assessment_node(self, state: AgenticPaymentsState) -> AgenticPaymentsState:
        """Execute validation and routing in parallel."""
        payment_id = state["payment_id"]
        context = self._extract_context(state)

        # Run validation and routing in parallel using standalone functions
        validation_result, routing_result = await self._run_assessments_parallel(payment_id, context)

        return {
            **state,
            "validation_result": validation_result,
            "routing_result": routing_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Validation Complete: {json.dumps(validation_result, indent=2)}"),
                AIMessage(content=f"Routing Complete: {json.dumps(routing_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, payment_id: str, context: str | None):
        """Run validation and routing assessments in parallel."""
        import asyncio
        validation_task = validate_payment(payment_id, context)
        routing_task = route_payment(payment_id, context)
        return await asyncio.gather(validation_task, routing_task)

    async def _reconciliation_agent_node(self, state: AgenticPaymentsState) -> AgenticPaymentsState:
        """Execute reconciliation check."""
        payment_id = state["payment_id"]
        context = self._extract_context(state)
        result = await reconcile_payment(payment_id, context)

        return {
            **state,
            "reconciliation_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Reconciliation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "payment_id", "payment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(PaymentSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: AgenticPaymentsState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_agentic_payments(request):
    """Run the assessment workflow."""
    orchestrator = AgenticPaymentsOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.payment_id}")],
        "payment_id": request.payment_id,
        "payment_type": request.payment_type.value if hasattr(request.payment_type, 'value') else str(request.payment_type),
    }
    for key in [k for k in AgenticPaymentsState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    validation_result = None; routing_decision = None; reconciliation_status = ReconciliationStatus.PENDING
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("validation_status"):
            validation_result = ValidationResult(
                status=ValidationStatus(structured.get("validation_status", "requires_review")),
                rules_checked=structured.get("validation_rules_checked", []),
                violations=structured.get("validation_violations", []),
                sanctions_clear=True,
                risk_score=structured.get("validation_risk_score", 50),
                notes=["Validation completed"])
        if structured.get("routing_selected_rail"):
            routing_decision = RoutingDecision(
                selected_rail=PaymentRail(structured.get("routing_selected_rail", "fedwire")),
                alternative_rails=[],
                estimated_settlement_time=structured.get("routing_settlement_time", "Same day"),
                routing_cost=25.0,
                routing_rationale=structured.get("routing_rationale", "Standard routing"))
        if structured.get("reconciliation_status"):
            reconciliation_status = ReconciliationStatus(structured.get("reconciliation_status", "pending"))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return PaymentResponse(
        payment_id=request.payment_id, transaction_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), validation_result=validation_result, routing_decision=routing_decision, reconciliation_status=reconciliation_status,
        summary=summary,
        raw_analysis={"validation_result": final_state.get("validation_result"), "routing_result": final_state.get("routing_result"), "reconciliation_result": final_state.get("reconciliation_result")},
    )
