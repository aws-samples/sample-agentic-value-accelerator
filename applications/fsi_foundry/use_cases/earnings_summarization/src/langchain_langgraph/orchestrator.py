"""Earnings Summarization Orchestrator."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.earnings_summarization.agents import TranscriptProcessor, MetricExtractor, SentimentAnalyst
from use_cases.earnings_summarization.agents.transcript_processor import process_transcript
from use_cases.earnings_summarization.agents.metric_extractor import extract_metrics
from use_cases.earnings_summarization.agents.sentiment_analyst import analyze_sentiment
from use_cases.earnings_summarization.models import (SummarizationRequest, SummarizationResponse, SummarizationType,
    EarningsOverview, SentimentRating)


class EarningsSummarizationSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis — avoids nested Optional models that break Bedrock tool spec."""
    sentiment_rating: str = Field(default="neutral", description="Overall sentiment: very_positive, positive, neutral, negative, or very_negative")
    key_metrics: list[str] = Field(default_factory=list, description="Key financial metrics extracted (e.g. 'Revenue: $2.8B (+18% YoY)')")
    guidance_changes: list[str] = Field(default_factory=list, description="Forward guidance changes or updates")
    notable_quotes: list[str] = Field(default_factory=list, description="Notable management quotes from the call")
    risks_identified: list[str] = Field(default_factory=list, description="Risk factors identified in the earnings call")
    investment_implications: list[str] = Field(default_factory=list, description="Investment implications and actionable insights")
    summary: str = Field(..., description="Executive summary of the earnings call with key takeaways, financial highlights, and recommendation")


class EarningsSummarizationState(TypedDict):
    messages: Annotated[list, add_messages]
    entity_id: str
    summarization_type: str
    transcript_processor_result: dict | None
    metric_extractor_result: dict | None
    sentiment_analyst_result: dict | None
    final_summary: str | None


class EarningsSummarizationOrchestrator(LangGraphOrchestrator):
    name = "earnings_summarization_orchestrator"
    state_schema = EarningsSummarizationState
    system_prompt = """You are a Senior Earnings Call Analyst for capital markets.

Your role is to:
1. Coordinate specialist agents (Transcript Processor, Metric Extractor, Sentiment Analyst)
2. Synthesize findings into a comprehensive earnings call summary
3. Provide actionable investment insights

Consider: financial performance vs expectations, management tone, guidance changes, and risk factors.
Be concise but thorough. Your summary will be used by portfolio managers and analysts."""

    def __init__(self):
        super().__init__(agents={"transcript_processor": TranscriptProcessor(), "metric_extractor": MetricExtractor(), "sentiment_analyst": SentimentAnalyst()})

    def build_graph(self):
        wf = StateGraph(EarningsSummarizationState)
        wf.add_node("parallel_assessment", self._parallel_node)
        wf.add_node("transcript_processor", self._tp_node)
        wf.add_node("metric_extractor", self._me_node)
        wf.add_node("sentiment_analyst", self._sa_node)
        wf.add_node("synthesize", self._synthesize_node)
        wf.set_conditional_entry_point(self._router, {"parallel_assessment": "parallel_assessment", "transcript_processor": "transcript_processor", "metric_extractor": "metric_extractor", "sentiment_analyst": "sentiment_analyst"})
        wf.add_edge("parallel_assessment", "synthesize")
        for n in ["transcript_processor", "metric_extractor", "sentiment_analyst"]:
            wf.add_conditional_edges(n, self._router, {"synthesize": "synthesize"})
        wf.add_edge("synthesize", END)
        return wf.compile()

    def _router(self, state) -> Literal["parallel_assessment", "transcript_processor", "metric_extractor", "sentiment_analyst", "synthesize"]:
        st = state.get("summarization_type", "full")
        td = state.get("transcript_processor_result") is not None
        md = state.get("metric_extractor_result") is not None
        sd = state.get("sentiment_analyst_result") is not None
        if st == "transcript_only": return "synthesize" if td else "transcript_processor"
        if st == "metrics_only": return "synthesize" if md else "metric_extractor"
        if st == "sentiment_only": return "synthesize" if sd else "sentiment_analyst"
        return "synthesize" if (td or md or sd) else "parallel_assessment"

    async def _parallel_node(self, state):
        import asyncio
        eid, ctx = state["entity_id"], self._extract_context(state)
        tr, mr, sr = await asyncio.gather(process_transcript(eid, ctx), extract_metrics(eid, ctx), analyze_sentiment(eid, ctx))
        return {**state, "transcript_processor_result": tr, "metric_extractor_result": mr, "sentiment_analyst_result": sr,
            "messages": state["messages"] + [AIMessage(content=json.dumps({"transcript": tr, "metrics": mr, "sentiment": sr}, indent=2))]}

    async def _tp_node(self, state):
        r = await process_transcript(state["entity_id"], self._extract_context(state))
        return {**state, "transcript_processor_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _me_node(self, state):
        r = await extract_metrics(state["entity_id"], self._extract_context(state))
        return {**state, "metric_extractor_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _sa_node(self, state):
        r = await analyze_sentiment(state["entity_id"], self._extract_context(state))
        return {**state, "sentiment_analyst_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _synthesize_node(self, state):
        """Synthesize findings into structured assessment using with_structured_output."""
        sections = []
        for k, label in [("transcript_processor_result", "Transcript Analysis"), ("metric_extractor_result", "Financial Metrics"), ("sentiment_analyst_result", "Sentiment Analysis")]:
            if state.get(k): sections.append(f"## {label}\n{json.dumps(state[k], indent=2)}")

        synthesis_prompt = f"""You are a Senior Earnings Call Analyst. Based on the following specialist assessments, produce a structured earnings call summary.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, metrics, and details — not generic defaults."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(EarningsSummarizationSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({k: state.get(k) for k in ["transcript_processor_result", "metric_extractor_result", "sentiment_analyst_result"]}, synthesis_prompt)
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Assessment: {json.dumps(structured)}")],
        }

    def _extract_context(self, state) -> str | None:
        if state.get("messages") and hasattr(state["messages"][-1], "content"):
            return state["messages"][-1].content
        return None


def parse_earnings_overview(structured: dict) -> EarningsOverview:
    sentiment_map = {"very_positive": SentimentRating.VERY_POSITIVE, "positive": SentimentRating.POSITIVE,
        "neutral": SentimentRating.NEUTRAL, "negative": SentimentRating.NEGATIVE, "very_negative": SentimentRating.VERY_NEGATIVE}
    sentiment = sentiment_map.get(structured.get("sentiment_rating", "neutral"), SentimentRating.NEUTRAL)
    return EarningsOverview(
        sentiment=sentiment,
        key_metrics={m.split(":")[0].strip(): m.split(":", 1)[1].strip() for m in structured.get("key_metrics", []) if ":" in m} if structured.get("key_metrics") else {},
        guidance_changes=structured.get("guidance_changes", []),
        notable_quotes=structured.get("notable_quotes", []),
        risks_identified=structured.get("risks_identified", []))


async def run_earnings_summarization(request: SummarizationRequest) -> SummarizationResponse:
    orchestrator = EarningsSummarizationOrchestrator()
    initial_state: EarningsSummarizationState = {
        "messages": [HumanMessage(content=f"Summarize earnings call for: {request.entity_id}")],
        "entity_id": request.entity_id, "summarization_type": request.summarization_type.value,
        "transcript_processor_result": None, "metric_extractor_result": None, "sentiment_analyst_result": None, "final_summary": None}
    if request.additional_context: initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    state = await orchestrator.arun(initial_state)

    overview = None
    summary = "Summarization completed"
    recommendations = ["Review full analysis for investment decisions"]
    try:
        from utils.json_extract import extract_json
        structured = extract_json(state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        overview = parse_earnings_overview(structured)
        if structured.get("investment_implications"):
            recommendations = structured["investment_implications"]
    except (ValueError, Exception):
        summary = state.get("final_summary", summary)

    return SummarizationResponse(entity_id=request.entity_id, summarization_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        earnings_overview=overview, recommendations=recommendations, summary=summary,
        raw_analysis={"transcript": state.get("transcript_processor_result"), "metrics": state.get("metric_extractor_result"), "sentiment": state.get("sentiment_analyst_result")})
