"""Email Triage Orchestrator. Coordinates email classification and action extraction."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from base.langgraph import LangGraphOrchestrator
from use_cases.email_triage.agents import EmailClassifier, ActionExtractor
from use_cases.email_triage.agents.email_classifier import classify_email
from use_cases.email_triage.agents.action_extractor import extract_actions
from use_cases.email_triage.models import (
    TriageRequest, TriageResponse, TriageType, ClassificationDetail, EmailCategory, UrgencyLevel,
)


class EmailTriageSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis."""
    category: str = Field(default="internal_memo", description="Email category: client_request, trade_instruction, compliance_alert, market_update, internal_memo, or meeting_request")
    urgency: str = Field(default="medium", description="Urgency level: low, medium, high, or critical")
    sender_importance: float = Field(default=0.5, description="Sender importance score from 0.0 to 1.0")
    topics: list[str] = Field(default_factory=list, description="List of identified topics from the email")
    actions_required: list[str] = Field(default_factory=list, description="List of action items extracted from the email")
    deadlines: list[str] = Field(default_factory=list, description="List of deadlines or time constraints identified")
    recommendations: list[str] = Field(default_factory=list, description="List of prioritization recommendations")
    summary: str = Field(..., description="Executive summary with priority, category, urgency, key actions, and suggested response")


class EmailTriageState(TypedDict):
    messages: Annotated[list, add_messages]
    entity_id: str
    triage_type: str
    email_classifier_result: dict | None
    action_extractor_result: dict | None
    final_summary: str | None


class EmailTriageOrchestrator(LangGraphOrchestrator):
    name = "email_triage_orchestrator"
    state_schema = EmailTriageState
    system_prompt = """You are a Senior Email Triage Supervisor for a capital markets trading desk.

Your role is to:
1. Coordinate specialist agents (Email Classifier, Action Extractor)
2. Synthesize their findings into a prioritized triage summary
3. Ensure time-sensitive items are flagged and actionable

Be concise but thorough. Your summary will be used by traders and portfolio managers."""

    def __init__(self):
        super().__init__(agents={"email_classifier": EmailClassifier(), "action_extractor": ActionExtractor()})

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(EmailTriageState)
        workflow.add_node("parallel_assessment", self._parallel_node)
        workflow.add_node("email_classifier", self._classifier_node)
        workflow.add_node("action_extractor", self._extractor_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment", "email_classifier": "email_classifier", "action_extractor": "action_extractor"})
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("email_classifier", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("action_extractor", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "email_classifier", "action_extractor", "synthesize"]:
        t = state.get("triage_type", "full")
        ec = state.get("email_classifier_result") is not None
        ae = state.get("action_extractor_result") is not None
        if t == "classification": return "synthesize" if ec else "email_classifier"
        if t == "action_extraction": return "synthesize" if ae else "action_extractor"
        if not ec and not ae: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        eid = state["entity_id"]
        ctx = self._extract_context(state)
        ec, ae = await asyncio.gather(classify_email(eid, ctx), extract_actions(eid, ctx))
        return {**state, "email_classifier_result": ec, "action_extractor_result": ae,
                "messages": state["messages"] + [AIMessage(content=f"Classification: {json.dumps(ec, indent=2)}"), AIMessage(content=f"Actions: {json.dumps(ae, indent=2)}")]}

    async def _classifier_node(self, state):
        r = await classify_email(state["entity_id"], self._extract_context(state))
        return {**state, "email_classifier_result": r, "messages": state["messages"] + [AIMessage(content=f"Classification: {json.dumps(r, indent=2)}")]}

    async def _extractor_node(self, state):
        r = await extract_actions(state["entity_id"], self._extract_context(state))
        return {**state, "action_extractor_result": r, "messages": state["messages"] + [AIMessage(content=f"Actions: {json.dumps(r, indent=2)}")]}

    async def _synthesize_node(self, state):
        sections = []
        if state.get("email_classifier_result"):
            sections.append(f"## Email Classification\n{json.dumps(state['email_classifier_result'], indent=2)}")
        if state.get("action_extractor_result"):
            sections.append(f"## Action Extraction\n{json.dumps(state['action_extractor_result'], indent=2)}")

        synthesis_prompt = f"""You are a Senior Email Triage Supervisor. Based on the following specialist assessments, produce a structured email triage result.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings — not generic defaults."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(EmailTriageSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({"classifier": state.get("email_classifier_result"), "extractor": state.get("action_extractor_result")}, synthesis_prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_email_triage(request: TriageRequest) -> TriageResponse:
    orchestrator = EmailTriageOrchestrator()
    initial_state: EmailTriageState = {
        "messages": [HumanMessage(content=f"Begin email triage for: {request.entity_id}")],
        "entity_id": request.entity_id, "triage_type": request.triage_type.value,
        "email_classifier_result": None, "action_extractor_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    classification = None
    recommendations = []
    summary = "Triage completed"

    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.triage_type in [TriageType.FULL, TriageType.CLASSIFICATION]:
            classification = ClassificationDetail(
                category=EmailCategory(structured.get("category", "internal_memo")),
                urgency=UrgencyLevel(structured.get("urgency", "medium")),
                sender_importance=float(structured.get("sender_importance", 0.5)),
                topics=structured.get("topics", []),
                actions_required=structured.get("actions_required", []),
                deadlines=structured.get("deadlines", []),
            )
        recommendations = structured.get("recommendations", [])
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    return TriageResponse(
        entity_id=request.entity_id, triage_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        classification=classification, recommendations=recommendations, summary=summary,
        raw_analysis={"classifier": final_state.get("email_classifier_result"), "extractor": final_state.get("action_extractor_result")},
    )
