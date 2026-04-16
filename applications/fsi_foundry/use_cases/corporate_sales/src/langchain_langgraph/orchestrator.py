"""
Corporate Sales Orchestrator.

Orchestrates specialist agents (Lead Scorer, Opportunity Analyst, Pitch Preparer)
for comprehensive corporate sales assessment in banking.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.corporate_sales.agents import LeadScorer, OpportunityAnalyst, PitchPreparer
from use_cases.corporate_sales.agents.lead_scorer import score_lead
from use_cases.corporate_sales.agents.opportunity_analyst import analyze_opportunity
from use_cases.corporate_sales.agents.pitch_preparer import prepare_pitch
from use_cases.corporate_sales.models import (
    SalesRequest,
    SalesResponse,
    AnalysisType,
    LeadScore,
    LeadTier,
    OpportunityDetail,
    OpportunityStage,
)

from pydantic import BaseModel, Field

class CorporateSalesSynthesisSchema(BaseModel):
    """Structured synthesis output schema for corporate_sales."""
    lead_score_value: int = Field(default=50, description="Lead score from 0 to 100")
    lead_score_tier: str = Field(default="warm", description="Lead tier: hot, warm, cold, or unqualified")
    lead_score_factors: list[str] = Field(default_factory=list, description="Contributing scoring factors")
    recommendations: list[str] = Field(default_factory=list, description="Engagement and pitch recommendations")
    summary: str = Field(..., description="Executive summary of the sales assessment")



class CorporateSalesState(TypedDict):
    """State managed by the corporate sales orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    analysis_type: str
    lead_scorer_result: dict | None
    opportunity_analyst_result: dict | None
    pitch_preparer_result: dict | None
    final_summary: str | None


class CorporateSalesOrchestrator(LangGraphOrchestrator):
    """
    Corporate Sales Orchestrator using LangGraphOrchestrator base class.

    Coordinates Lead Scorer, Opportunity Analyst, and Pitch Preparer agents
    for comprehensive corporate sales assessment.
    """

    name = "corporate_sales_orchestrator"
    state_schema = CorporateSalesState

    system_prompt = """You are a Senior Corporate Sales Strategist for a banking institution.

Your role is to:
1. Coordinate specialist agents (Lead Scorer, Opportunity Analyst, Pitch Preparer)
2. Synthesize their findings into a comprehensive sales assessment
3. Ensure sales professionals have actionable intelligence for client engagement

When creating the final summary, consider:
- Lead quality and prioritization based on scoring factors
- Opportunity viability and recommended engagement strategies
- Customized pitch materials and value propositions
- Clear next steps and timeline recommendations
- Competitive positioning and differentiation points

Be concise but thorough. Your summary will be used by relationship managers and sales teams."""

    def __init__(self):
        super().__init__(
            agents={
                "lead_scorer": LeadScorer(),
                "opportunity_analyst": OpportunityAnalyst(),
                "pitch_preparer": PitchPreparer(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the corporate sales assessment workflow graph."""
        workflow = StateGraph(CorporateSalesState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("lead_scorer", self._lead_scorer_node)
        workflow.add_node("opportunity_analyst", self._opportunity_analyst_node)
        workflow.add_node("pitch_preparer", self._pitch_preparer_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "lead_scorer": "lead_scorer",
                "opportunity_analyst": "opportunity_analyst",
                "pitch_preparer": "pitch_preparer",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "lead_scorer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "opportunity_analyst",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "pitch_preparer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: CorporateSalesState) -> Literal["parallel_assessment", "lead_scorer", "opportunity_analyst", "pitch_preparer", "synthesize"]:
        """Route to the next node based on current state."""
        analysis_type = state.get("analysis_type", "full")
        lead_done = state.get("lead_scorer_result") is not None
        opportunity_done = state.get("opportunity_analyst_result") is not None
        pitch_done = state.get("pitch_preparer_result") is not None

        if analysis_type == "lead_scoring":
            return "synthesize" if lead_done else "lead_scorer"

        if analysis_type == "opportunity_analysis":
            return "synthesize" if opportunity_done else "opportunity_analyst"

        if analysis_type == "pitch_preparation":
            return "synthesize" if pitch_done else "pitch_preparer"

        # Full assessment
        if not lead_done and not opportunity_done and not pitch_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: CorporateSalesState) -> CorporateSalesState:
        """Execute all assessments in parallel."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)


        lead_result, opportunity_result, pitch_result = await self._run_assessments_parallel(customer_id, context)

        return {
            **state,
            "lead_scorer_result": lead_result,
            "opportunity_analyst_result": opportunity_result,
            "pitch_preparer_result": pitch_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Lead Scoring Complete: {json.dumps(lead_result, indent=2)}"),
                AIMessage(content=f"Opportunity Analysis Complete: {json.dumps(opportunity_result, indent=2)}"),
                AIMessage(content=f"Pitch Preparation Complete: {json.dumps(pitch_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, customer_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            score_lead(customer_id, context),
            analyze_opportunity(customer_id, context),
            prepare_pitch(customer_id, context),
        )

    async def _lead_scorer_node(self, state: CorporateSalesState) -> CorporateSalesState:
        """Execute lead scoring."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await score_lead(customer_id, context)

        return {
            **state,
            "lead_scorer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Lead Scoring Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _opportunity_analyst_node(self, state: CorporateSalesState) -> CorporateSalesState:
        """Execute opportunity analysis."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await analyze_opportunity(customer_id, context)

        return {
            **state,
            "opportunity_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Opportunity Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _pitch_preparer_node(self, state: CorporateSalesState) -> CorporateSalesState:
        """Execute pitch preparation."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await prepare_pitch(customer_id, context)

        return {
            **state,
            "pitch_preparer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Pitch Preparation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "analysis_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CorporateSalesSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: CorporateSalesState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_corporate_sales(request):
    """Run the assessment workflow."""
    orchestrator = CorporateSalesOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "analysis_type": request.analysis_type.value if hasattr(request.analysis_type, 'value') else str(request.analysis_type),
    }
    for key in [k for k in CorporateSalesState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    lead_score = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("lead_score_value") is not None:
            lead_score = LeadScore(
                score=structured.get("lead_score_value", 50),
                tier=LeadTier(structured.get("lead_score_tier", "warm")),
                factors=structured.get("lead_score_factors", []),
                recommendations=structured.get("recommendations", []))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return SalesResponse(
        customer_id=request.customer_id, assessment_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), lead_score=lead_score, recommendations=recommendations,
        summary=summary,
        raw_analysis={"lead_scorer": final_state.get("lead_scorer_result"), "opportunity_analyst": final_state.get("opportunity_analyst_result"), "pitch_preparer": final_state.get("pitch_preparer_result")},
    )
