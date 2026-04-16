"""
Customer Support Orchestrator.

Orchestrates specialist agents (Ticket Classifier, Resolution Agent, Escalation Agent)
for comprehensive customer support in banking.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.customer_support.agents import TicketClassifier, ResolutionAgent, EscalationAgent
from use_cases.customer_support.agents.ticket_classifier import classify_ticket
from use_cases.customer_support.agents.resolution_agent import suggest_resolution
from use_cases.customer_support.agents.escalation_agent import evaluate_escalation
from use_cases.customer_support.models import (
    SupportRequest,
    SupportResponse,
    TicketType,
    TicketClassification,
    UrgencyLevel,
    ResolutionSuggestion,
    EscalationDecision,
    EscalationStatus,
)

from pydantic import BaseModel, Field

class CustomerSupportSynthesisSchema(BaseModel):
    """Structured synthesis output schema for customer_support."""
    classification_category: str = Field(default="general", description="Ticket category")
    classification_urgency: str = Field(default="medium", description="Urgency: low, medium, high, or critical")
    resolution_suggestion: str = Field(default="", description="Suggested resolution text")
    resolution_confidence: float = Field(default=0.5, description="Confidence score 0 to 1")
    resolution_steps: list[str] = Field(default_factory=list, description="Resolution steps")
    escalation_status: str = Field(default="not_needed", description="Escalation status: not_needed, recommended, or required")
    escalation_reason: str = Field(default="", description="Reason for escalation decision")
    summary: str = Field(..., description="Executive summary of support assessment")



class CustomerSupportState(TypedDict):
    """State managed by the customer support orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    ticket_type: str
    ticket_classifier_result: dict | None
    resolution_agent_result: dict | None
    escalation_agent_result: dict | None
    final_summary: str | None


class CustomerSupportOrchestrator(LangGraphOrchestrator):
    """
    Customer Support Orchestrator using LangGraphOrchestrator base class.

    Coordinates Ticket Classifier, Resolution Agent, and Escalation Agent
    for comprehensive customer support.
    """

    name = "customer_support_orchestrator"
    state_schema = CustomerSupportState

    system_prompt = """You are a Senior Customer Support Supervisor for a banking institution.

Your role is to:
1. Coordinate specialist agents (Ticket Classifier, Resolution Agent, Escalation Agent)
2. Synthesize their findings into a comprehensive support response
3. Ensure customer tickets are classified, resolved, or escalated appropriately

When creating the final summary, consider:
- Ticket classification accuracy and urgency assessment
- Resolution suggestion quality and confidence level
- Escalation necessity and appropriate routing
- Clear next steps for the support representative
- Overall customer satisfaction and response timeliness

Be concise but thorough. Your summary will be used by customer support representatives."""

    def __init__(self):
        super().__init__(
            agents={
                "ticket_classifier": TicketClassifier(),
                "resolution_agent": ResolutionAgent(),
                "escalation_agent": EscalationAgent(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the customer support workflow graph."""
        workflow = StateGraph(CustomerSupportState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("ticket_classifier", self._ticket_classifier_node)
        workflow.add_node("resolution_agent", self._resolution_agent_node)
        workflow.add_node("escalation_agent", self._escalation_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "ticket_classifier": "ticket_classifier",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "ticket_classifier",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "resolution_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "escalation_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: CustomerSupportState) -> Literal["parallel_assessment", "ticket_classifier", "synthesize"]:
        """Route to the next node based on current state."""
        ticket_type = state.get("ticket_type", "full")
        classifier_done = state.get("ticket_classifier_result") is not None
        resolution_done = state.get("resolution_agent_result") is not None
        escalation_done = state.get("escalation_agent_result") is not None

        if ticket_type in ("general", "technical"):
            if classifier_done and resolution_done:
                return "synthesize"
            return "ticket_classifier" if not classifier_done else "synthesize"

        # full, billing, account → all three agents
        if not classifier_done and not resolution_done and not escalation_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: CustomerSupportState) -> CustomerSupportState:
        """Execute all assessments in parallel."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        ticket_type = state.get("ticket_type", "full")

        if ticket_type in ("general", "technical"):
            classifier_result, resolution_result = await self._run_two_parallel(customer_id, context)
            return {
                **state,
                "ticket_classifier_result": classifier_result,
                "resolution_agent_result": resolution_result,
                "messages": state["messages"] + [
                    AIMessage(content=f"Classification Complete: {json.dumps(classifier_result, indent=2)}"),
                    AIMessage(content=f"Resolution Complete: {json.dumps(resolution_result, indent=2)}"),
                ],
            }

        classifier_result, resolution_result, escalation_result = await self._run_three_parallel(customer_id, context)
        return {
            **state,
            "ticket_classifier_result": classifier_result,
            "resolution_agent_result": resolution_result,
            "escalation_agent_result": escalation_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Classification Complete: {json.dumps(classifier_result, indent=2)}"),
                AIMessage(content=f"Resolution Complete: {json.dumps(resolution_result, indent=2)}"),
                AIMessage(content=f"Escalation Complete: {json.dumps(escalation_result, indent=2)}"),
            ],
        }

    async def _run_three_parallel(self, customer_id: str, context: str | None):
        import asyncio
        return await asyncio.gather(
            classify_ticket(customer_id, context),
            suggest_resolution(customer_id, context),
            evaluate_escalation(customer_id, context),
        )

    async def _run_two_parallel(self, customer_id: str, context: str | None):
        import asyncio
        return await asyncio.gather(
            classify_ticket(customer_id, context),
            suggest_resolution(customer_id, context),
        )

    async def _ticket_classifier_node(self, state: CustomerSupportState) -> CustomerSupportState:
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await classify_ticket(customer_id, context)
        return {
            **state,
            "ticket_classifier_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Classification Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _resolution_agent_node(self, state: CustomerSupportState) -> CustomerSupportState:
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await suggest_resolution(customer_id, context)
        return {
            **state,
            "resolution_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Resolution Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _escalation_agent_node(self, state: CustomerSupportState) -> CustomerSupportState:
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await evaluate_escalation(customer_id, context)
        return {
            **state,
            "escalation_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Escalation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "ticket_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CustomerSupportSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: CustomerSupportState) -> str | None:
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_customer_support(request):
    """Run the assessment workflow."""
    orchestrator = CustomerSupportOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "ticket_type": request.ticket_type.value if hasattr(request.ticket_type, 'value') else str(request.ticket_type),
    }
    for key in [k for k in CustomerSupportState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    classification = None; resolution = None; escalation = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("classification_category"):
            classification = TicketClassification(
                category=structured.get("classification_category", "general"),
                urgency=UrgencyLevel(structured.get("classification_urgency", "medium")),
                required_expertise=[], tags=[])
        if structured.get("resolution_suggestion"):
            resolution = ResolutionSuggestion(
                suggested_resolution=structured.get("resolution_suggestion", ""),
                confidence=structured.get("resolution_confidence", 0.5),
                similar_cases=[], steps=structured.get("resolution_steps", []), knowledge_base_refs=[])
        if structured.get("escalation_status"):
            escalation = EscalationDecision(
                status=EscalationStatus(structured.get("escalation_status", "not_needed")),
                reason=structured.get("escalation_reason") or None,
                recommended_team=None, priority_override=None)
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return SupportResponse(
        customer_id=request.customer_id, ticket_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), classification=classification, resolution=resolution, escalation=escalation,
        summary=summary,
        raw_analysis={"classification": final_state.get("ticket_classifier_result"), "resolution": final_state.get("resolution_agent_result"), "escalation": final_state.get("escalation_agent_result")},
    )
