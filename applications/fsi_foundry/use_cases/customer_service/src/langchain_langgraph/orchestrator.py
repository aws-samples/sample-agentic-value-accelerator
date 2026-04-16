"""
Customer Service Orchestrator.

Orchestrates specialist agents (Inquiry Handler, Transaction Specialist, Product Advisor)
for comprehensive customer service resolution in banking.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.customer_service.agents import InquiryHandler, TransactionSpecialist, ProductAdvisor
from use_cases.customer_service.agents.inquiry_handler import handle_inquiry
from use_cases.customer_service.agents.transaction_specialist import investigate_transaction
from use_cases.customer_service.agents.product_advisor import advise_products
from use_cases.customer_service.models import (
    ServiceRequest,
    ServiceResponse,
    InquiryType,
    ResolutionDetail,
    ResolutionStatus,
    Priority,
)

from pydantic import BaseModel, Field

class CustomerServiceSynthesisSchema(BaseModel):
    """Structured synthesis output schema for customer_service."""
    resolution_status: str = Field(default="pending", description="Resolution status: resolved, pending, or escalated")
    resolution_actions_taken: list[str] = Field(default_factory=list, description="Actions taken to resolve the inquiry")
    resolution_follow_up_required: str = Field(default="false", description="Whether follow-up is required")
    recommendations: list[str] = Field(default_factory=list, description="Recommendations for the customer")
    summary: str = Field(..., description="Executive summary of the service interaction")



class CustomerServiceState(TypedDict):
    """State managed by the customer service orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    inquiry_type: str
    inquiry_handler_result: dict | None
    transaction_specialist_result: dict | None
    product_advisor_result: dict | None
    final_summary: str | None


class CustomerServiceOrchestrator(LangGraphOrchestrator):
    """
    Customer Service Orchestrator using LangGraphOrchestrator base class.

    Coordinates Inquiry Handler, Transaction Specialist, and Product Advisor
    agents for comprehensive customer service resolution.
    """

    name = "customer_service_orchestrator"
    state_schema = CustomerServiceState

    system_prompt = """You are a Senior Customer Service Supervisor for a banking institution.

Your role is to:
1. Coordinate specialist agents (Inquiry Handler, Transaction Specialist, Product Advisor)
2. Synthesize their findings into a comprehensive customer service resolution
3. Ensure customer inquiries are resolved efficiently and satisfactorily

When creating the final summary, consider:
- Resolution status and completeness of the customer's inquiry
- Any escalation needs or follow-up actions required
- Product recommendations that match the customer's profile and needs
- Clear next steps for the customer
- Overall service quality and satisfaction indicators

Be concise but thorough. Your summary will be used by customer service representatives."""

    def __init__(self):
        super().__init__(
            agents={
                "inquiry_handler": InquiryHandler(),
                "transaction_specialist": TransactionSpecialist(),
                "product_advisor": ProductAdvisor(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the customer service workflow graph."""
        workflow = StateGraph(CustomerServiceState)

        # Add nodes
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("inquiry_handler", self._inquiry_handler_node)
        workflow.add_node("transaction_specialist", self._transaction_specialist_node)
        workflow.add_node("product_advisor", self._product_advisor_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # Set conditional entry point
        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "inquiry_handler": "inquiry_handler",
                "transaction_specialist": "transaction_specialist",
                "product_advisor": "product_advisor",
            },
        )

        # Define edges
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "inquiry_handler",
            self._router,
            {"synthesize": "synthesize", "transaction_specialist": "transaction_specialist"},
        )
        workflow.add_conditional_edges(
            "transaction_specialist",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "product_advisor",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: CustomerServiceState) -> Literal[
        "parallel_assessment", "inquiry_handler", "transaction_specialist",
        "product_advisor", "synthesize"
    ]:
        """Route to the next node based on current state."""
        inquiry_type = state.get("inquiry_type", "full")
        inquiry_done = state.get("inquiry_handler_result") is not None
        transaction_done = state.get("transaction_specialist_result") is not None
        product_done = state.get("product_advisor_result") is not None

        if inquiry_type == "full":
            if not inquiry_done and not transaction_done and not product_done:
                return "parallel_assessment"
            return "synthesize"

        if inquiry_type == "general":
            return "synthesize" if inquiry_done else "inquiry_handler"

        if inquiry_type == "transaction_dispute":
            return "synthesize" if transaction_done else "transaction_specialist"

        if inquiry_type == "product_inquiry":
            return "synthesize" if product_done else "product_advisor"

        if inquiry_type == "service_request":
            if not inquiry_done:
                return "inquiry_handler"
            if not transaction_done:
                return "transaction_specialist"
            return "synthesize"

        # Default: full assessment
        if not inquiry_done and not transaction_done and not product_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: CustomerServiceState) -> CustomerServiceState:
        """Execute all three assessments in parallel using base class helper."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)


        # Also run the standalone functions for backward compatibility
        inquiry_result, transaction_result, product_result = await self._run_assessments_parallel(
            customer_id, context
        )

        return {
            **state,
            "inquiry_handler_result": inquiry_result,
            "transaction_specialist_result": transaction_result,
            "product_advisor_result": product_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Inquiry Analysis Complete: {json.dumps(inquiry_result, indent=2)}"),
                AIMessage(content=f"Transaction Investigation Complete: {json.dumps(transaction_result, indent=2)}"),
                AIMessage(content=f"Product Advisory Complete: {json.dumps(product_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, customer_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        inquiry_task = handle_inquiry(customer_id, context)
        transaction_task = investigate_transaction(customer_id, context)
        product_task = advise_products(customer_id, context)
        return await asyncio.gather(inquiry_task, transaction_task, product_task)

    async def _inquiry_handler_node(self, state: CustomerServiceState) -> CustomerServiceState:
        """Execute inquiry handling."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await handle_inquiry(customer_id, context)

        return {
            **state,
            "inquiry_handler_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Inquiry Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _transaction_specialist_node(self, state: CustomerServiceState) -> CustomerServiceState:
        """Execute transaction investigation."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await investigate_transaction(customer_id, context)

        return {
            **state,
            "transaction_specialist_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Transaction Investigation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _product_advisor_node(self, state: CustomerServiceState) -> CustomerServiceState:
        """Execute product advisory."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await advise_products(customer_id, context)

        return {
            **state,
            "product_advisor_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Product Advisory Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "inquiry_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CustomerServiceSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: CustomerServiceState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_customer_service(request):
    """Run the assessment workflow."""
    orchestrator = CustomerServiceOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "inquiry_type": request.inquiry_type.value if hasattr(request.inquiry_type, 'value') else str(request.inquiry_type),
    }
    for key in [k for k in CustomerServiceState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    resolution = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("resolution_status"):
            resolution = ResolutionDetail(
                status=structured.get("resolution_status", "pending"),
                actions_taken=structured.get("resolution_actions_taken", []),
                follow_up_required=structured.get("resolution_follow_up_required", False))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ServiceResponse(
        customer_id=request.customer_id, service_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), resolution=resolution, recommendations=recommendations,
        summary=summary,
        raw_analysis={"inquiry_result": final_state.get("inquiry_handler_result"), "transaction_result": final_state.get("transaction_specialist_result"), "product_result": final_state.get("product_advisor_result")},
    )
