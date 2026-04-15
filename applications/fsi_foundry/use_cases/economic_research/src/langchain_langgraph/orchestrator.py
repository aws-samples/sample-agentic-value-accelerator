"""
Economic Research Orchestrator.

Orchestrates specialist agents (Data Aggregator, Trend Analyst, Research Writer)
for comprehensive economic research in capital markets.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.economic_research.agents import DataAggregator, TrendAnalyst, ResearchWriter
from use_cases.economic_research.agents.data_aggregator import aggregate_data
from use_cases.economic_research.agents.trend_analyst import analyze_trends
from use_cases.economic_research.agents.research_writer import write_research
from use_cases.economic_research.models import (
    ResearchRequest,
    ResearchResponse,
    ResearchType,
    EconomicOverview,
    EconomicIndicator,
    TrendDirection,
)

from pydantic import BaseModel, Field
from utils.json_extract import extract_json


class EconomicResearchSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis — avoids nested Optional models that break Bedrock tool spec."""
    primary_indicator: str = Field(default="gdp", description="Primary indicator: gdp, inflation, employment, interest_rates, or trade_balance")
    trend_direction: str = Field(default="stable", description="Trend direction: accelerating, stable, decelerating, reversing, or uncertain")
    key_findings: list[str] = Field(default_factory=list, description="List of key economic findings")
    forecast_horizon: str = Field(default="12 months", description="Forecast time horizon")
    recommendations: list[str] = Field(default_factory=list, description="List of actionable recommendations")
    summary: str = Field(..., description="Executive summary with key indicators, trends, forecasts, and investment implications")


class EconomicResearchState(TypedDict):
    """State managed by the economic research orchestrator graph."""
    messages: Annotated[list, add_messages]
    entity_id: str
    research_type: str
    data_aggregator_result: dict | None
    trend_analyst_result: dict | None
    research_writer_result: dict | None
    final_summary: str | None


class EconomicResearchOrchestrator(LangGraphOrchestrator):
    name = "economic_research_orchestrator"
    state_schema = EconomicResearchState

    system_prompt = """You are a Senior Economic Research Director for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Aggregator, Trend Analyst, Research Writer)
2. Synthesize their findings into comprehensive economic research
3. Produce actionable insights for capital markets analysts

When creating the final summary, consider:
- Key economic indicators and their trajectories
- Correlations between indicators
- Clear forecasts with confidence levels
- Investment implications and recommendations

Be concise but thorough. Your summary will be used by analysts and portfolio managers."""

    def __init__(self):
        super().__init__(
            agents={
                "data_aggregator": DataAggregator(),
                "trend_analyst": TrendAnalyst(),
                "research_writer": ResearchWriter(),
            }
        )

    def build_graph(self):
        workflow = StateGraph(EconomicResearchState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("data_aggregator", self._data_aggregator_node)
        workflow.add_node("trend_analyst", self._trend_analyst_node)
        workflow.add_node("research_writer", self._research_writer_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "data_aggregator": "data_aggregator",
                "trend_analyst": "trend_analyst",
                "research_writer": "research_writer",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        for node in ["data_aggregator", "trend_analyst", "research_writer"]:
            workflow.add_conditional_edges(node, self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state):
        rt = state.get("research_type", "full")
        da = state.get("data_aggregator_result") is not None
        ta = state.get("trend_analyst_result") is not None
        rw = state.get("research_writer_result") is not None

        if rt == "data_aggregation":
            return "synthesize" if da else "data_aggregator"
        if rt == "trend_analysis":
            return "synthesize" if ta else "trend_analyst"
        if rt == "report_generation":
            return "synthesize" if rw else "research_writer"
        if rt == "indicator_focus":
            return "synthesize" if da and ta else "parallel_assessment"

        # Full assessment
        if not da and not ta and not rw:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state):
        import asyncio

        entity_id = state["entity_id"]
        context = self._extract_context(state)
        rt = state.get("research_type", "full")

        if rt == "indicator_focus":
            da, ta = await asyncio.gather(
                aggregate_data(entity_id, context),
                analyze_trends(entity_id, context),
            )
            return {
                **state,
                "data_aggregator_result": da,
                "trend_analyst_result": ta,
                "messages": state["messages"] + [AIMessage(content="Indicator focus assessments complete")],
            }

        da, ta, rw = await asyncio.gather(
            aggregate_data(entity_id, context),
            analyze_trends(entity_id, context),
            write_research(entity_id, context),
        )

        return {
            **state,
            "data_aggregator_result": da,
            "trend_analyst_result": ta,
            "research_writer_result": rw,
            "messages": state["messages"] + [AIMessage(content="All assessments complete")],
        }

    async def _data_aggregator_node(self, state):
        result = await aggregate_data(state["entity_id"], self._extract_context(state))
        return {
            **state,
            "data_aggregator_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Aggregation Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _trend_analyst_node(self, state):
        result = await analyze_trends(state["entity_id"], self._extract_context(state))
        return {
            **state,
            "trend_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Trend Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _research_writer_node(self, state):
        result = await write_research(state["entity_id"], self._extract_context(state))
        return {
            **state,
            "research_writer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Research Report Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        da = state.get("data_aggregator_result")
        ta = state.get("trend_analyst_result")
        rw = state.get("research_writer_result")

        sections = []
        if da:
            sections.append(f"## Data Aggregation\n{json.dumps(da, indent=2)}")
        if ta:
            sections.append(f"## Trend Analysis\n{json.dumps(ta, indent=2)}")
        if rw:
            sections.append(f"## Research Report\n{json.dumps(rw, indent=2)}")

        synthesis_prompt = f"""You are a Senior Economic Research Director. Based on the following specialist assessments, produce a structured economic research synthesis.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, data, and details — not generic defaults."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(EconomicResearchSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
            # Detect if structured output returned all defaults (Bedrock tool use issue)
            if not structured.get("key_findings") and not structured.get("recommendations"):
                raise ValueError("structured output returned defaults")
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            raw_summary = await self.synthesize(
                {"da": da, "ta": ta, "rw": rw}, synthesis_prompt
            )
            structured = extract_json(raw_summary) if raw_summary else {}
            if not structured.get("summary"):
                structured["summary"] = raw_summary

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [
                AIMessage(content=f"Final Assessment: {json.dumps(structured)}")
            ],
        }

    def _extract_context(self, state):
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_economic_research(request: ResearchRequest) -> ResearchResponse:
    """Run the full economic research workflow."""
    orchestrator = EconomicResearchOrchestrator()
    initial_state: EconomicResearchState = {
        "messages": [HumanMessage(content=f"Begin economic research for: {request.entity_id}")],
        "entity_id": request.entity_id,
        "research_type": request.research_type.value,
        "data_aggregator_result": None,
        "trend_analyst_result": None,
        "research_writer_result": None,
        "final_summary": None,
    }
    if request.additional_context:
        initial_state["messages"].append(
            HumanMessage(content=f"Additional context: {request.additional_context}")
        )

    final_state = await orchestrator.arun(initial_state)

    overview = None
    recommendations = ["Monitor key indicators", "Review forecast assumptions"]
    summary = "Research completed"

    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", recommendations)
        if structured.get("primary_indicator"):
            overview = EconomicOverview(
                primary_indicator=EconomicIndicator(structured.get("primary_indicator", "gdp")),
                trend_direction=TrendDirection(structured.get("trend_direction", "stable")),
                data_sources_used=["Economic data profile"],
                key_findings={"findings": ", ".join(structured.get("key_findings", []))},
                correlations_identified=[],
                forecast_horizon=structured.get("forecast_horizon", "12 months"),
            )
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    return ResearchResponse(
        entity_id=request.entity_id,
        research_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        economic_overview=overview,
        recommendations=recommendations,
        summary=summary,
        raw_analysis={
            "data_aggregation": final_state.get("data_aggregator_result"),
            "trend_analysis": final_state.get("trend_analyst_result"),
            "report": final_state.get("research_writer_result"),
        },
    )
