"""
Adverse Media Orchestrator.

Orchestrates specialist agents for adverse media screening.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.adverse_media.agents import MediaScreener, SentimentAnalyst, RiskSignalExtractor
from use_cases.adverse_media.agents.media_screener import screen_media
from use_cases.adverse_media.agents.sentiment_analyst import analyze_sentiment
from use_cases.adverse_media.agents.risk_signal_extractor import extract_risk_signals
from use_cases.adverse_media.models import (
    ScreeningRequest,
    ScreeningResponse,
    ScreeningType,
    MediaFindings,
    SentimentLevel,
    RiskSignal,
    RiskSeverity,
)

from pydantic import BaseModel, Field

class AdverseMediaSynthesisSchema(BaseModel):
    """Structured synthesis for adverse media screening."""
    sentiment: str = Field(default="neutral", description="Overall sentiment: very_negative, negative, neutral, positive, very_positive")
    articles_screened: int = Field(default=0, description="Number of articles screened")
    adverse_mentions: int = Field(default=0, description="Number of adverse mentions found")
    categories: list[str] = Field(default_factory=list, description="List of adverse media categories found")
    key_findings: list[str] = Field(default_factory=list, description="List of key findings from screening")
    risk_signals: list[str] = Field(default_factory=list, description="List of extracted risk signals with severity")
    summary: str = Field(..., description="Executive summary of the adverse media screening")



class AdverseMediaState(TypedDict):
    messages: Annotated[list, add_messages]
    entity_id: str
    screening_type: str
    media_screener_result: dict | None
    sentiment_analyst_result: dict | None
    risk_signal_extractor_result: dict | None
    final_summary: str | None


class AdverseMediaOrchestrator(LangGraphOrchestrator):
    name = "adverse_media_orchestrator"
    state_schema = AdverseMediaState

    system_prompt = """You are a Senior Adverse Media Analyst for a financial institution.

Your role is to:
1. Coordinate specialist agents (Media Screener, Sentiment Analyst, Risk Signal Extractor)
2. Synthesize their findings into a comprehensive adverse media screening report
3. Ensure screenings are thorough, evidence-based, and actionable

When creating the final summary, consider:
- Breadth and depth of media sources screened
- Severity and consistency of sentiment across findings
- Confidence levels and reliability of extracted risk signals
- Entity linkage strength and corroborating evidence
- Recommended actions and monitoring adjustments
- Escalation needs for critical or high-severity signals

Be precise and thorough. Your summary will be used by compliance officers and risk managers."""

    def __init__(self):
        super().__init__(
            agents={
                "media_screener": MediaScreener(),
                "sentiment_analyst": SentimentAnalyst(),
                "risk_signal_extractor": RiskSignalExtractor(),
            }
        )

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(AdverseMediaState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("media_screener", self._media_screener_node)
        workflow.add_node("sentiment_analyst", self._sentiment_analyst_node)
        workflow.add_node("risk_signal_extractor", self._risk_signal_extractor_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "media_screener": "media_screener",
                "sentiment_analyst": "sentiment_analyst",
                "risk_signal_extractor": "risk_signal_extractor",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("media_screener", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("sentiment_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("risk_signal_extractor", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: AdverseMediaState) -> Literal["parallel_assessment", "media_screener", "sentiment_analyst", "risk_signal_extractor", "synthesize"]:
        screening_type = state.get("screening_type", "full")
        media_done = state.get("media_screener_result") is not None
        sentiment_done = state.get("sentiment_analyst_result") is not None
        risk_done = state.get("risk_signal_extractor_result") is not None

        if screening_type == "media_screening":
            return "synthesize" if media_done else "media_screener"
        if screening_type == "sentiment_analysis":
            return "synthesize" if sentiment_done else "sentiment_analyst"
        if screening_type == "risk_extraction":
            return "synthesize" if risk_done else "risk_signal_extractor"

        if not media_done and not sentiment_done and not risk_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: AdverseMediaState) -> AdverseMediaState:
        import asyncio
        entity_id = state["entity_id"]
        context = self._extract_context(state)

        media_result, sentiment_result, risk_result = await asyncio.gather(
            screen_media(entity_id, context),
            analyze_sentiment(entity_id, context),
            extract_risk_signals(entity_id, context),
        )

        return {
            **state,
            "media_screener_result": media_result,
            "sentiment_analyst_result": sentiment_result,
            "risk_signal_extractor_result": risk_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Media Screening Complete: {json.dumps(media_result, indent=2)}"),
                AIMessage(content=f"Sentiment Analysis Complete: {json.dumps(sentiment_result, indent=2)}"),
                AIMessage(content=f"Risk Signal Extraction Complete: {json.dumps(risk_result, indent=2)}"),
            ],
        }

    async def _media_screener_node(self, state: AdverseMediaState) -> AdverseMediaState:
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await screen_media(entity_id, context)
        return {
            **state,
            "media_screener_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Media Screening Complete: {json.dumps(result, indent=2)}")],
        }

    async def _sentiment_analyst_node(self, state: AdverseMediaState) -> AdverseMediaState:
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await analyze_sentiment(entity_id, context)
        return {
            **state,
            "sentiment_analyst_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Sentiment Analysis Complete: {json.dumps(result, indent=2)}")],
        }

    async def _risk_signal_extractor_node(self, state: AdverseMediaState) -> AdverseMediaState:
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await extract_risk_signals(entity_id, context)
        return {
            **state,
            "risk_signal_extractor_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Risk Signal Extraction Complete: {json.dumps(result, indent=2)}")],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "entity_id", "screening_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(AdverseMediaSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: AdverseMediaState) -> str | None:
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_adverse_media(request):
    """Run the assessment workflow."""
    orchestrator = AdverseMediaOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.entity_id}")],
        "entity_id": request.entity_id,
        "screening_type": request.screening_type.value if hasattr(request.screening_type, 'value') else str(request.screening_type),
    }
    for key in [k for k in AdverseMediaState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    media_findings = None; risk_signals = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("sentiment"):
            media_findings = MediaFindings(articles_screened=structured.get("articles_screened", 0),
                adverse_mentions=structured.get("adverse_mentions", 0),
                sentiment=SentimentLevel(structured.get("sentiment", "neutral")),
                categories=structured.get("categories", []),
                key_findings=structured.get("key_findings", []), sources=[])
        risk_signals = [RiskSignal(signal_type="general", severity=RiskSeverity.MEDIUM, confidence=0.7,
            description=s, source_references=[], entity_linkage=None) for s in structured.get("risk_signals", [])]
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ScreeningResponse(
        entity_id=request.entity_id, screening_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), media_findings=media_findings, risk_signals=risk_signals,
        summary=summary,
        raw_analysis={"media_screening": final_state.get("media_screener_result"), "sentiment_analysis": final_state.get("sentiment_analyst_result"), "risk_signal_extraction": final_state.get("risk_signal_extractor_result")},
    )
