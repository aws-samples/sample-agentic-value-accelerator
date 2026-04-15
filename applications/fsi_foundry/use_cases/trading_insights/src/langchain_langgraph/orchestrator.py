"""
Trading Insights Orchestrator.

Orchestrates specialist agents (Signal Generator, Cross Asset Analyst, Scenario Modeler)
for comprehensive trading insights assessment in capital markets.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.trading_insights.agents import SignalGenerator, CrossAssetAnalyst, ScenarioModeler
from use_cases.trading_insights.agents.signal_generator import generate_signals
from use_cases.trading_insights.agents.cross_asset_analyst import analyze_cross_asset
from use_cases.trading_insights.agents.scenario_modeler import model_scenarios
from use_cases.trading_insights.models import (
    InsightsRequest,
    InsightsResponse,
    AssessmentType,
    InsightsDetail,
    SignalStrength,
    ScenarioLikelihood,
)

from pydantic import BaseModel, Field


class TradingInsightsSynthesisSchema(BaseModel):
    """Structured synthesis output schema for trading_insights."""
    signal_strength: str = Field(default="neutral", description="Signal strength: strong_buy, buy, neutral, sell, or strong_sell")
    scenario_likelihood: str = Field(default="medium", description="Scenario likelihood: high, medium, low, or tail_risk")
    signals_identified: list[str] = Field(default_factory=list, description="Trading signals identified")
    cross_asset_opportunities: list[str] = Field(default_factory=list, description="Cross-asset opportunities detected")
    scenario_outcomes: list[str] = Field(default_factory=list, description="Modeled scenario outcomes")
    confidence_score: float = Field(default=0.0, description="Overall confidence score 0 to 1")
    recommendations: list[str] = Field(default_factory=list, description="Trading recommendations")
    summary: str = Field(..., description="Executive summary of the trading insights assessment")


class TradingInsightsState(TypedDict):
    """State managed by the trading insights orchestrator graph."""
    messages: Annotated[list, add_messages]
    entity_id: str
    assessment_type: str
    signal_generator_result: dict | None
    cross_asset_analyst_result: dict | None
    scenario_modeler_result: dict | None
    final_summary: str | None


class TradingInsightsOrchestrator(LangGraphOrchestrator):
    """
    Trading Insights Orchestrator using LangGraphOrchestrator base class.

    Coordinates Signal Generator, Cross Asset Analyst, and Scenario Modeler agents
    for comprehensive trading insights assessment.
    """

    name = "trading_insights_orchestrator"
    state_schema = TradingInsightsState

    system_prompt = """You are a Senior Trading Insights Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Signal Generator, Cross Asset Analyst, Scenario Modeler)
2. Synthesize their findings into comprehensive trading insights and recommendations
3. Ensure signal quality, cross-asset consistency, and scenario-aware risk management

When creating the final summary, consider:
- Signal strength and confidence across technical and fundamental dimensions
- Cross-asset correlations and relative value opportunities identified
- Scenario outcomes and their probability-weighted impact on positions
- Risk/reward profiles for recommended trades
- Hedging strategies and downside protection measures
- Clear actionable recommendations with entry/exit levels and position sizing guidance

Be concise but thorough. Your summary will be used by traders and portfolio managers for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "signal_generator": SignalGenerator(),
                "cross_asset_analyst": CrossAssetAnalyst(),
                "scenario_modeler": ScenarioModeler(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the trading insights assessment workflow graph."""
        workflow = StateGraph(TradingInsightsState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("signal_generator", self._signal_generator_node)
        workflow.add_node("cross_asset_analyst", self._cross_asset_analyst_node)
        workflow.add_node("scenario_modeler", self._scenario_modeler_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "signal_generator": "signal_generator",
                "cross_asset_analyst": "cross_asset_analyst",
                "scenario_modeler": "scenario_modeler",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "signal_generator",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "cross_asset_analyst",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "scenario_modeler",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: TradingInsightsState) -> Literal["parallel_assessment", "signal_generator", "cross_asset_analyst", "scenario_modeler", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        signal_done = state.get("signal_generator_result") is not None
        cross_asset_done = state.get("cross_asset_analyst_result") is not None
        scenario_done = state.get("scenario_modeler_result") is not None

        if assessment_type == "signal_generation":
            return "synthesize" if signal_done else "signal_generator"

        if assessment_type == "cross_asset_analysis":
            return "synthesize" if signal_done and cross_asset_done else "parallel_assessment"

        if assessment_type == "scenario_modeling":
            return "synthesize" if cross_asset_done and scenario_done else "parallel_assessment"

        # Full assessment
        if not signal_done and not cross_asset_done and not scenario_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: TradingInsightsState) -> TradingInsightsState:
        """Execute assessments in parallel based on assessment type."""
        import asyncio
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        assessment_type = state.get("assessment_type", "full")
        messages = list(state["messages"])
        signal_result = state.get("signal_generator_result")
        cross_asset_result = state.get("cross_asset_analyst_result")
        scenario_result = state.get("scenario_modeler_result")

        if assessment_type == "cross_asset_analysis":
            signal_result, cross_asset_result = await asyncio.gather(
                generate_signals(entity_id, context),
                analyze_cross_asset(entity_id, context),
            )
            messages.append(AIMessage(content=f"Signal Generation Complete: {json.dumps(signal_result, indent=2)}"))
            messages.append(AIMessage(content=f"Cross-Asset Analysis Complete: {json.dumps(cross_asset_result, indent=2)}"))
        elif assessment_type == "scenario_modeling":
            cross_asset_result, scenario_result = await asyncio.gather(
                analyze_cross_asset(entity_id, context),
                model_scenarios(entity_id, context),
            )
            messages.append(AIMessage(content=f"Cross-Asset Analysis Complete: {json.dumps(cross_asset_result, indent=2)}"))
            messages.append(AIMessage(content=f"Scenario Modeling Complete: {json.dumps(scenario_result, indent=2)}"))
        else:
            signal_result, cross_asset_result, scenario_result = await asyncio.gather(
                generate_signals(entity_id, context),
                analyze_cross_asset(entity_id, context),
                model_scenarios(entity_id, context),
            )
            messages.append(AIMessage(content=f"Signal Generation Complete: {json.dumps(signal_result, indent=2)}"))
            messages.append(AIMessage(content=f"Cross-Asset Analysis Complete: {json.dumps(cross_asset_result, indent=2)}"))
            messages.append(AIMessage(content=f"Scenario Modeling Complete: {json.dumps(scenario_result, indent=2)}"))

        return {
            **state,
            "signal_generator_result": signal_result,
            "cross_asset_analyst_result": cross_asset_result,
            "scenario_modeler_result": scenario_result,
            "messages": messages,
        }

    async def _signal_generator_node(self, state: TradingInsightsState) -> TradingInsightsState:
        """Execute signal generation."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await generate_signals(entity_id, context)

        return {
            **state,
            "signal_generator_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Signal Generation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _cross_asset_analyst_node(self, state: TradingInsightsState) -> TradingInsightsState:
        """Execute cross-asset analysis."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await analyze_cross_asset(entity_id, context)

        return {
            **state,
            "cross_asset_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Cross-Asset Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _scenario_modeler_node(self, state: TradingInsightsState) -> TradingInsightsState:
        """Execute scenario modeling."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await model_scenarios(entity_id, context)

        return {
            **state,
            "scenario_modeler_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Scenario Modeling Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "entity_id", "assessment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(TradingInsightsSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state: TradingInsightsState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_trading_insights(request):
    """Run the trading insights assessment workflow."""
    orchestrator = TradingInsightsOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin trading insights assessment for: {request.entity_id}")],
        "entity_id": request.entity_id,
        "assessment_type": request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
    }
    for key in [k for k in TradingInsightsState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    insights_detail = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("signal_strength") is not None:
            insights_detail = InsightsDetail(
                signal_strength=SignalStrength(structured.get("signal_strength", "neutral")),
                scenario_likelihood=ScenarioLikelihood(structured.get("scenario_likelihood", "medium")),
                signals_identified=structured.get("signals_identified", []),
                cross_asset_opportunities=structured.get("cross_asset_opportunities", []),
                scenario_outcomes=structured.get("scenario_outcomes", []),
                confidence_score=structured.get("confidence_score", 0.0))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return InsightsResponse(
        entity_id=request.entity_id, insights_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        insights_detail=insights_detail, recommendations=recommendations, summary=summary,
        raw_analysis={"signal_generator": final_state.get("signal_generator_result"),
                      "cross_asset_analyst": final_state.get("cross_asset_analyst_result"),
                      "scenario_modeler": final_state.get("scenario_modeler_result")},
    )
