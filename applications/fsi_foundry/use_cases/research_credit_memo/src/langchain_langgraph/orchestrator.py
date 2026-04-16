"""
Research Credit Memo Orchestrator (LangGraph Implementation).

Orchestrates specialist agents (Data Gatherer, Credit Analyst, Memo Writer)
for comprehensive credit memo generation.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.research_credit_memo.agents import DataGatherer, CreditAnalyst, MemoWriter
from use_cases.research_credit_memo.agents.data_gatherer import gather_data
from use_cases.research_credit_memo.agents.credit_analyst import analyze_credit
from use_cases.research_credit_memo.agents.memo_writer import write_memo
from use_cases.research_credit_memo.models import (
    MemoRequest,
    MemoResponse,
    AnalysisType,
    CreditAnalysisDetail,
    CreditRating,
)

from pydantic import BaseModel, Field


class CreditMemoSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis."""
    credit_rating: str = Field(default="BBB", description="Credit rating: AAA, AA, A, BBB, BB, B, CCC, CC, C, D")
    confidence_score: float = Field(default=0.5, description="Analysis confidence score from 0 to 1")
    key_ratios: list[str] = Field(default_factory=list, description="Key financial ratios computed")
    risk_factors: list[str] = Field(default_factory=list, description="Identified risk factors")
    peer_comparison_notes: list[str] = Field(default_factory=list, description="Peer comparison observations")
    recommendations: list[str] = Field(default_factory=list, description="Credit recommendations")
    summary: str = Field(..., description="Executive summary of the credit memo with rating recommendation and key findings")


class ResearchCreditMemoState(TypedDict):
    """State managed by the research credit memo orchestrator graph."""
    messages: Annotated[list, add_messages]
    entity_id: str
    analysis_type: str
    data_gatherer_result: dict | None
    credit_analyst_result: dict | None
    memo_writer_result: dict | None
    final_summary: str | None


class ResearchCreditMemoOrchestrator(LangGraphOrchestrator):
    """
    Research Credit Memo Orchestrator using LangGraphOrchestrator base class.

    Coordinates Data Gatherer, Credit Analyst, and Memo Writer agents.
    """

    name = "research_credit_memo_orchestrator"
    state_schema = ResearchCreditMemoState

    system_prompt = """You are a Senior Credit Research Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Gatherer, Credit Analyst, Memo Writer)
2. Synthesize their findings into a comprehensive credit memo
3. Ensure credit memos are accurate, well-structured, and actionable

When creating the final summary, consider:
- Data completeness and quality of gathered financial information
- Credit analysis rigor including ratio analysis, peer comparison, and risk assessment
- Memo quality including structure, clarity, and professional formatting
- Credit rating recommendation with supporting evidence
- Key risk factors and mitigants that should be highlighted

Be concise but thorough. Your summary will be used by credit analysts and investment committees for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "data_gatherer": DataGatherer(),
                "credit_analyst": CreditAnalyst(),
                "memo_writer": MemoWriter(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the credit memo workflow graph."""
        workflow = StateGraph(ResearchCreditMemoState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("data_gatherer", self._data_gatherer_node)
        workflow.add_node("credit_analyst", self._credit_analyst_node)
        workflow.add_node("memo_writer", self._memo_writer_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "data_gatherer": "data_gatherer",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "data_gatherer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "credit_analyst",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "memo_writer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: ResearchCreditMemoState) -> Literal["parallel_assessment", "data_gatherer", "synthesize"]:
        """Route to the next node based on current state."""
        analysis_type = state.get("analysis_type", "full")
        data_done = state.get("data_gatherer_result") is not None
        credit_done = state.get("credit_analyst_result") is not None
        memo_done = state.get("memo_writer_result") is not None

        if analysis_type == "data_gathering":
            return "synthesize" if data_done else "data_gatherer"

        if analysis_type in ("full", "credit_analysis", "memo_generation"):
            if not data_done and not credit_done and not memo_done:
                return "parallel_assessment"
            return "synthesize"

        return "synthesize"

    async def _parallel_assessment_node(self, state: ResearchCreditMemoState) -> ResearchCreditMemoState:
        """Execute all assessments in parallel."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)

        import asyncio
        data_result, credit_result, memo_result = await asyncio.gather(
            gather_data(entity_id, context),
            analyze_credit(entity_id, context),
            write_memo(entity_id, context),
        )

        return {
            **state,
            "data_gatherer_result": data_result,
            "credit_analyst_result": credit_result,
            "memo_writer_result": memo_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Gathering Complete: {json.dumps(data_result, indent=2)}"),
                AIMessage(content=f"Credit Analysis Complete: {json.dumps(credit_result, indent=2)}"),
                AIMessage(content=f"Memo Writing Complete: {json.dumps(memo_result, indent=2)}"),
            ],
        }

    async def _data_gatherer_node(self, state: ResearchCreditMemoState) -> ResearchCreditMemoState:
        """Execute data gathering."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await gather_data(entity_id, context)

        return {
            **state,
            "data_gatherer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Gathering Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _credit_analyst_node(self, state: ResearchCreditMemoState) -> ResearchCreditMemoState:
        """Execute credit analysis."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await analyze_credit(entity_id, context)

        return {
            **state,
            "credit_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Credit Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _memo_writer_node(self, state: ResearchCreditMemoState) -> ResearchCreditMemoState:
        """Execute memo writing."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await write_memo(entity_id, context)

        return {
            **state,
            "memo_writer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Memo Writing Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state: ResearchCreditMemoState) -> ResearchCreditMemoState:
        """Synthesize findings into structured credit memo."""
        data_result = state.get("data_gatherer_result")
        credit_result = state.get("credit_analyst_result")
        memo_result = state.get("memo_writer_result")

        sections = []
        if data_result:
            sections.append(f"## Data Gathering Results\n{json.dumps(data_result, indent=2)}")
        if credit_result:
            sections.append(f"## Credit Analysis Results\n{json.dumps(credit_result, indent=2)}")
        if memo_result:
            sections.append(f"## Memo Writing Results\n{json.dumps(memo_result, indent=2)}")

        synthesis_prompt = f"""You are a Senior Credit Research Supervisor. Based on the following specialist assessments, produce a structured credit memo synthesis.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, scores, and details — not generic defaults."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CreditMemoSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize(
                {"data": data_result, "credit": credit_result, "memo": memo_result},
                synthesis_prompt,
            )
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Assessment: {json.dumps(structured)}")],
        }

    def _extract_context(self, state: ResearchCreditMemoState) -> str | None:
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_research_credit_memo(request: MemoRequest) -> MemoResponse:
    """Run the full research credit memo workflow."""
    orchestrator = ResearchCreditMemoOrchestrator()
    initial_state: ResearchCreditMemoState = {
        "messages": [HumanMessage(content=f"Begin credit memo generation for entity: {request.entity_id}")],
        "entity_id": request.entity_id,
        "analysis_type": request.analysis_type.value,
        "data_gatherer_result": None,
        "credit_analyst_result": None,
        "memo_writer_result": None,
        "final_summary": None,
    }
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    credit_analysis, summary = None, "Credit memo generation completed"
    recommendations = []
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", [])
        if structured.get("credit_rating"):
            credit_analysis = CreditAnalysisDetail(
                rating=CreditRating(structured.get("credit_rating", "BBB")),
                confidence_score=structured.get("confidence_score", 0.5),
                key_ratios=structured.get("key_ratios", []),
                risk_factors=structured.get("risk_factors", []),
                peer_comparison_notes=structured.get("peer_comparison_notes", []),
            )
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary") or summary

    return MemoResponse(
        entity_id=request.entity_id,
        memo_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        credit_analysis=credit_analysis,
        recommendations=recommendations,
        summary=summary,
        raw_analysis={
            "data_gatherer": final_state.get("data_gatherer_result"),
            "credit_analyst": final_state.get("credit_analyst_result"),
            "memo_writer": final_state.get("memo_writer_result"),
        },
    )
