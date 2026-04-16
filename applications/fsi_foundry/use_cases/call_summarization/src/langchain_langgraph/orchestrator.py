"""Call Summarization Orchestrator."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
try:
    from use_cases.call_summarization.agents import KeyPointExtractor, SummaryGenerator
    from use_cases.call_summarization.agents.key_point_extractor import extract_key_points
    from use_cases.call_summarization.agents.summary_generator import generate_summary
    from use_cases.call_summarization.models import (
        SummarizationRequest, SummarizationResponse, SummarizationType,
        KeyPointsResult, KeyPoint, SummaryResult,
    )
except ImportError:
    from agents import KeyPointExtractor, SummaryGenerator
    from agents.key_point_extractor import extract_key_points
    from agents.summary_generator import generate_summary
    from models import (
        SummarizationRequest, SummarizationResponse, SummarizationType,
        KeyPointsResult, KeyPoint, SummaryResult,
    )
from pydantic import BaseModel, Field

class CallSummarizationSynthesisSchema(BaseModel):
    key_points: list[dict] = Field(default_factory=list, description="List of {topic, detail, confidence} key points")
    call_outcome: str = Field(default="resolved", description="Call outcome: resolved, escalated, follow_up, unresolved")
    topics_discussed: list[str] = Field(default_factory=list, description="Topics discussed")
    executive_summary: str = Field(default="", description="Concise executive summary")
    action_items: list[str] = Field(default_factory=list, description="Action items")
    customer_sentiment: str = Field(default="neutral", description="Customer sentiment: positive, neutral, negative")
    overall_summary: str = Field(..., description="Comprehensive summary combining all findings")

class CallSummarizationState(TypedDict):
    messages: Annotated[list, add_messages]
    call_id: str
    summarization_type: str
    key_point_extractor_result: dict | None
    summary_generator_result: dict | None
    final_summary: str | None

class CallSummarizationOrchestrator(LangGraphOrchestrator):
    name = "call_summarization_orchestrator"
    state_schema = CallSummarizationState
    system_prompt = """You are a Senior Call Center Supervisor reviewing banking customer service calls.
Your role is to coordinate specialist agents and synthesize their findings into a comprehensive call summary."""

    def __init__(self):
        super().__init__(agents={"key_point_extractor": KeyPointExtractor(), "summary_generator": SummaryGenerator()})

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(CallSummarizationState)
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("key_point_extractor", self._key_point_extractor_node)
        workflow.add_node("summary_generator", self._summary_generator_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment", "key_point_extractor": "key_point_extractor", "summary_generator": "summary_generator"})
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("key_point_extractor", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("summary_generator", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state: CallSummarizationState) -> Literal["parallel_assessment", "key_point_extractor", "summary_generator", "synthesize"]:
        st = state.get("summarization_type", "full")
        kp_done = state.get("key_point_extractor_result") is not None
        sum_done = state.get("summary_generator_result") is not None
        if st == "key_points_only": return "synthesize" if kp_done else "key_point_extractor"
        if st == "summary_only": return "synthesize" if sum_done else "summary_generator"
        if not kp_done and not sum_done: return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state):
        import asyncio
        kp, sm = await asyncio.gather(extract_key_points(state["call_id"], self._extract_context(state)), generate_summary(state["call_id"], self._extract_context(state)))
        return {**state, "key_point_extractor_result": kp, "summary_generator_result": sm,
                "messages": state["messages"] + [AIMessage(content=f"Key Points: {json.dumps(kp)}"), AIMessage(content=f"Summary: {json.dumps(sm)}")]}

    async def _key_point_extractor_node(self, state):
        r = await extract_key_points(state["call_id"], self._extract_context(state))
        return {**state, "key_point_extractor_result": r, "messages": state["messages"] + [AIMessage(content=f"Key Points: {json.dumps(r)}")]}

    async def _summary_generator_node(self, state):
        r = await generate_summary(state["call_id"], self._extract_context(state))
        return {**state, "summary_generator_result": r, "messages": state["messages"] + [AIMessage(content=f"Summary: {json.dumps(r)}")]}

    async def _synthesize_node(self, state):
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "call_id", "summarization_type", "final_summary"):
                if isinstance(val, (dict, list)): sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"Based on the following call analysis, produce a structured response.\n\n{chr(10).join(sections)}"
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CallSummarizationSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception:
            prompt += "\n\nRespond ONLY with a JSON object containing: key_points (list of {topic, detail, confidence}), call_outcome, topics_discussed, executive_summary, action_items, customer_sentiment, overall_summary."
            summary = await self.synthesize({}, prompt)
            try:
                import re
                m = re.search(r'\{[\s\S]*\}', str(summary))
                structured = json.loads(m.group()) if m else {"overall_summary": str(summary)}
            except Exception:
                structured = {"overall_summary": str(summary)}
        return {**state, "final_summary": json.dumps(structured), "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_call_summarization(request: SummarizationRequest) -> SummarizationResponse:
    orchestrator = CallSummarizationOrchestrator()
    initial_state = {"messages": [HumanMessage(content=f"Summarize call: {request.call_id}")],
                     "call_id": request.call_id, "summarization_type": request.summarization_type.value,
                     "key_point_extractor_result": None, "summary_generator_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)
    key_points, summary_result, overall = None, None, "Summarization completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        overall = structured.get("overall_summary", overall)
        if request.summarization_type in [SummarizationType.FULL, SummarizationType.KEY_POINTS_ONLY]:
            kps = structured.get("key_points", [])
            if isinstance(kps, list) and kps:
                key_points = KeyPointsResult(
                    key_points=[KeyPoint(**kp) if isinstance(kp, dict) else KeyPoint(topic=str(kp), detail="", confidence=0.5) for kp in kps],
                    call_outcome=structured.get("call_outcome", "resolved"),
                    topics_discussed=structured.get("topics_discussed", []))
        if request.summarization_type in [SummarizationType.FULL, SummarizationType.SUMMARY_ONLY]:
            if structured.get("executive_summary"):
                summary_result = SummaryResult(
                    executive_summary=structured["executive_summary"],
                    action_items=structured.get("action_items", []),
                    customer_sentiment=structured.get("customer_sentiment", "neutral"))
    except Exception:
        overall = str(final_state.get("final_summary", overall))
    return SummarizationResponse(
        call_id=request.call_id, summarization_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        key_points=key_points, summary=summary_result, overall_summary=overall,
        raw_analysis={"key_points": final_state.get("key_point_extractor_result"), "summary": final_state.get("summary_generator_result")})
