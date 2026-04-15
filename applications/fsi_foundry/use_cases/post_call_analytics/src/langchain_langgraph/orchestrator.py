"""Post Call Analytics Orchestrator. Coordinates transcription, sentiment, and action extraction."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from base.langgraph import LangGraphOrchestrator
from use_cases.post_call_analytics.agents import TranscriptionProcessor, SentimentAnalyst, ActionExtractor
from use_cases.post_call_analytics.agents.transcription_processor import process_transcription
from use_cases.post_call_analytics.agents.sentiment_analyst import analyze_sentiment
from use_cases.post_call_analytics.agents.action_extractor import extract_actions
from utils.json_extract import extract_json
from use_cases.post_call_analytics.models import (
    PostCallRequest, PostCallResponse, AnalysisType,
    TranscriptionResult, SentimentResult, SentimentLevel,
    ActionItem, ActionPriority, ActionStatus,
)


class PostCallAnalyticsSynthesisSchema(BaseModel):
    transcription_speaker_count: int = Field(default=2, description="Number of speakers")
    transcription_duration_seconds: int = Field(default=0, description="Call duration in seconds")
    transcription_key_topics: list[str] = Field(default_factory=list, description="Key topics discussed")
    transcription_summary: str = Field(default="", description="Transcript summary")
    sentiment_overall: str = Field(default="neutral", description="Overall sentiment: very_negative, negative, neutral, positive, very_positive")
    sentiment_customer: str = Field(default="neutral", description="Customer sentiment")
    sentiment_agent: str = Field(default="neutral", description="Agent sentiment")
    sentiment_satisfaction_score: float = Field(default=0.5, description="Satisfaction score 0.0-1.0")
    sentiment_emotional_shifts: list[str] = Field(default_factory=list, description="Emotional shifts")
    action_items: list[dict] = Field(default_factory=list, description="Action items with description, assignee, priority, deadline")
    summary: str = Field(..., description="Executive summary with call quality assessment, key findings, and recommended follow-ups")


class PostCallAnalyticsState(TypedDict):
    messages: Annotated[list, add_messages]
    call_id: str
    analysis_type: str
    transcription_result: dict | None
    sentiment_result: dict | None
    action_extractor_result: dict | None
    final_summary: str | None


class PostCallAnalyticsOrchestrator(LangGraphOrchestrator):
    name = "post_call_analytics_orchestrator"
    state_schema = PostCallAnalyticsState
    system_prompt = """You are a Senior Call Analytics Supervisor for a financial services contact center.

Your role is to:
1. Coordinate specialist agents (Transcription Processor, Sentiment Analyst, Action Extractor)
2. Synthesize their findings into a comprehensive post-call analysis
3. Ensure all action items are captured and prioritized
4. Flag quality issues and compliance concerns

Be concise but thorough. Your summary will be used by supervisors and quality teams."""

    def __init__(self):
        super().__init__(agents={
            "transcription_processor": TranscriptionProcessor(),
            "sentiment_analyst": SentimentAnalyst(),
            "action_extractor": ActionExtractor(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(PostCallAnalyticsState)
        workflow.add_node("parallel_assessment", self._parallel_node)
        workflow.add_node("transcription_processor", self._transcription_node)
        workflow.add_node("sentiment_analyst", self._sentiment_node)
        workflow.add_node("action_extractor", self._action_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "transcription_processor": "transcription_processor",
            "sentiment_analyst": "sentiment_analyst",
            "action_extractor": "action_extractor",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("transcription_processor", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("sentiment_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("action_extractor", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "transcription_processor", "sentiment_analyst", "action_extractor", "synthesize"]:
        t = state.get("analysis_type", "full")
        tp = state.get("transcription_result") is not None
        sa = state.get("sentiment_result") is not None
        ae = state.get("action_extractor_result") is not None
        if t == "transcription": return "synthesize" if tp else "transcription_processor"
        if t == "sentiment": return "synthesize" if sa else "sentiment_analyst"
        if t == "action_extraction": return "synthesize" if ae else "action_extractor"
        if not tp and not sa and not ae: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        cid = state["call_id"]
        ctx = self._extract_context(state)
        tp, sa, ae = await asyncio.gather(process_transcription(cid, ctx), analyze_sentiment(cid, ctx), extract_actions(cid, ctx))
        return {**state, "transcription_result": tp, "sentiment_result": sa, "action_extractor_result": ae,
                "messages": state["messages"] + [AIMessage(content=f"Transcription: {json.dumps(tp, indent=2)}"), AIMessage(content=f"Sentiment: {json.dumps(sa, indent=2)}"), AIMessage(content=f"Actions: {json.dumps(ae, indent=2)}")]}

    async def _transcription_node(self, state):
        r = await process_transcription(state["call_id"], self._extract_context(state))
        return {**state, "transcription_result": r, "messages": state["messages"] + [AIMessage(content=f"Transcription: {json.dumps(r, indent=2)}")]}

    async def _sentiment_node(self, state):
        r = await analyze_sentiment(state["call_id"], self._extract_context(state))
        return {**state, "sentiment_result": r, "messages": state["messages"] + [AIMessage(content=f"Sentiment: {json.dumps(r, indent=2)}")]}

    async def _action_node(self, state):
        r = await extract_actions(state["call_id"], self._extract_context(state))
        return {**state, "action_extractor_result": r, "messages": state["messages"] + [AIMessage(content=f"Actions: {json.dumps(r, indent=2)}")]}

    async def _synthesize_node(self, state):
        sections = []
        if state.get("transcription_result"):
            sections.append(f"## Transcription\n{json.dumps(state['transcription_result'], indent=2)}")
        if state.get("sentiment_result"):
            sections.append(f"## Sentiment Analysis\n{json.dumps(state['sentiment_result'], indent=2)}")
        if state.get("action_extractor_result"):
            sections.append(f"## Action Extraction\n{json.dumps(state['action_extractor_result'], indent=2)}")
        synthesis_prompt = f"""You are a Senior Call Analytics Supervisor. Based on the following specialist assessments, produce a structured post-call analysis.

{chr(10).join(sections)}

IMPORTANT: Extract actual values from the agent assessments above. Do NOT use default values.
- transcription_speaker_count: count speakers from the transcription analysis
- transcription_duration_seconds: extract actual call duration
- transcription_key_topics: list the actual topics identified
- transcription_summary: summarize the actual transcript content
- sentiment_overall/customer/agent: use the actual sentiment levels found
- sentiment_satisfaction_score: use the actual score (0.0-1.0)
- sentiment_emotional_shifts: list actual shifts detected
- action_items: list each action with description, assignee, priority (low/medium/high/critical), and deadline
- summary: comprehensive executive summary with call quality assessment and recommendations"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(PostCallAnalyticsSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
            # Detect if structured output returned all defaults (Bedrock tool use issue)
            if not structured.get("transcription_key_topics") and not structured.get("action_items"):
                raise ValueError("structured output returned defaults")
        except Exception:
            summary = await self.synthesize({"transcription": state.get("transcription_result"), "sentiment": state.get("sentiment_result"), "actions": state.get("action_extractor_result")}, synthesis_prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured), "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_post_call_analytics(request: PostCallRequest) -> PostCallResponse:
    orchestrator = PostCallAnalyticsOrchestrator()
    initial_state: PostCallAnalyticsState = {
        "messages": [HumanMessage(content=f"Begin post-call analysis for: {request.call_id}")],
        "call_id": request.call_id, "analysis_type": request.analysis_type.value,
        "transcription_result": None, "sentiment_result": None, "action_extractor_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    transcription, sentiment, action_items, summary = None, None, [], "Analysis completed"
    try:
        raw_summary = final_state.get("final_summary", "{}")
        try:
            structured = json.loads(raw_summary)
        except (json.JSONDecodeError, Exception):
            structured = extract_json(raw_summary) if raw_summary else {}
        summary = structured.get("summary", raw_summary if raw_summary else summary)
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.TRANSCRIPTION]:
            transcription = TranscriptionResult(
                speaker_count=structured.get("transcription_speaker_count", 2),
                duration_seconds=structured.get("transcription_duration_seconds", 0),
                key_topics=structured.get("transcription_key_topics", []),
                transcript_summary=structured.get("transcription_summary", ""))
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.SENTIMENT]:
            sentiment = SentimentResult(
                overall_sentiment=SentimentLevel(structured.get("sentiment_overall", "neutral")),
                customer_sentiment=SentimentLevel(structured.get("sentiment_customer", "neutral")),
                agent_sentiment=SentimentLevel(structured.get("sentiment_agent", "neutral")),
                satisfaction_score=float(structured.get("sentiment_satisfaction_score", 0.5)),
                emotional_shifts=structured.get("sentiment_emotional_shifts", []))
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.ACTION_EXTRACTION]:
            for item in structured.get("action_items", []):
                try:
                    action_items.append(ActionItem(**item))
                except Exception:
                    action_items.append(ActionItem(description=str(item)))
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    return PostCallResponse(
        call_id=request.call_id, analytics_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        transcription=transcription, sentiment=sentiment, action_items=action_items, summary=summary,
        raw_analysis={"transcription": final_state.get("transcription_result"), "sentiment": final_state.get("sentiment_result"), "actions": final_state.get("action_extractor_result")},
    )
