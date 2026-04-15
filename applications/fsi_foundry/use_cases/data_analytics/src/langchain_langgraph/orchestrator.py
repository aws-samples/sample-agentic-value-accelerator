"""
Data Analytics Orchestrator.

Orchestrates specialist agents (Data Explorer, Statistical Analyst, Insight Generator)
for comprehensive data analytics assessment in capital markets.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.data_analytics.agents import DataExplorer, StatisticalAnalyst, InsightGenerator
from use_cases.data_analytics.agents.data_explorer import explore_data
from use_cases.data_analytics.agents.statistical_analyst import analyze_statistics
from use_cases.data_analytics.agents.insight_generator import generate_insights
from use_cases.data_analytics.models import (
    AnalyticsRequest,
    AnalyticsResponse,
    AssessmentType,
    AnalyticsDetail,
    DataQuality,
    InsightConfidence,
)

from pydantic import BaseModel, Field


class DataAnalyticsSynthesisSchema(BaseModel):
    """Structured synthesis output schema for data_analytics."""
    data_quality: str = Field(default="medium", description="Data quality: high, medium, low, or insufficient")
    insight_confidence: str = Field(default="medium", description="Insight confidence: high, medium, low, or speculative")
    patterns_identified: list[str] = Field(default_factory=list, description="Patterns identified in the data")
    statistical_findings: list[str] = Field(default_factory=list, description="Key statistical findings")
    visualization_suggestions: list[str] = Field(default_factory=list, description="Suggested visualizations")
    data_coverage_pct: float = Field(default=0.0, description="Percentage of data coverage analyzed")
    recommendations: list[str] = Field(default_factory=list, description="Analytical recommendations")
    summary: str = Field(..., description="Executive summary of the analytics assessment")


class DataAnalyticsState(TypedDict):
    """State managed by the data analytics orchestrator graph."""
    messages: Annotated[list, add_messages]
    entity_id: str
    assessment_type: str
    data_explorer_result: dict | None
    statistical_analyst_result: dict | None
    insight_generator_result: dict | None
    final_summary: str | None


class DataAnalyticsOrchestrator(LangGraphOrchestrator):
    """
    Data Analytics Orchestrator using LangGraphOrchestrator base class.

    Coordinates Data Explorer, Statistical Analyst, and Insight Generator agents
    for comprehensive data analytics assessment.
    """

    name = "data_analytics_orchestrator"
    state_schema = DataAnalyticsState

    system_prompt = """You are a Senior Data Analytics Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Explorer, Statistical Analyst, Insight Generator)
2. Synthesize their findings into a comprehensive analytics assessment
3. Ensure analytical rigor, data quality awareness, and actionable insight delivery

When creating the final summary, consider:
- Data quality and completeness assessment from the exploration phase
- Statistical significance and robustness of findings
- Confidence levels assigned to each insight and recommendation
- Practical implications for capital markets decision-making
- Suggested visualizations and further analytical directions

Be concise but thorough. Your summary will be used by capital markets analysts."""

    def __init__(self):
        super().__init__(
            agents={
                "data_explorer": DataExplorer(),
                "statistical_analyst": StatisticalAnalyst(),
                "insight_generator": InsightGenerator(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the data analytics assessment workflow graph."""
        workflow = StateGraph(DataAnalyticsState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("data_explorer", self._data_explorer_node)
        workflow.add_node("statistical_analyst", self._statistical_analyst_node)
        workflow.add_node("insight_generator", self._insight_generator_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "data_explorer": "data_explorer",
                "statistical_analyst": "statistical_analyst",
                "insight_generator": "insight_generator",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "data_explorer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "statistical_analyst",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "insight_generator",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: DataAnalyticsState) -> Literal["parallel_assessment", "data_explorer", "statistical_analyst", "insight_generator", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        explorer_done = state.get("data_explorer_result") is not None
        stats_done = state.get("statistical_analyst_result") is not None
        insight_done = state.get("insight_generator_result") is not None

        if assessment_type == "data_exploration":
            return "synthesize" if explorer_done else "data_explorer"

        if assessment_type == "statistical_analysis":
            return "synthesize" if stats_done else "statistical_analyst"

        if assessment_type == "insight_generation":
            return "synthesize" if insight_done else "insight_generator"

        # Full assessment
        if not explorer_done and not stats_done and not insight_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: DataAnalyticsState) -> DataAnalyticsState:
        """Execute all assessments in parallel."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)


        explorer_result, stats_result, insight_result = await self._run_assessments_parallel(entity_id, context)

        return {
            **state,
            "data_explorer_result": explorer_result,
            "statistical_analyst_result": stats_result,
            "insight_generator_result": insight_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Exploration Complete: {json.dumps(explorer_result, indent=2)}"),
                AIMessage(content=f"Statistical Analysis Complete: {json.dumps(stats_result, indent=2)}"),
                AIMessage(content=f"Insight Generation Complete: {json.dumps(insight_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, entity_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            explore_data(entity_id, context),
            analyze_statistics(entity_id, context),
            generate_insights(entity_id, context),
        )

    async def _data_explorer_node(self, state: DataAnalyticsState) -> DataAnalyticsState:
        """Execute data exploration."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await explore_data(entity_id, context)

        return {
            **state,
            "data_explorer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Data Exploration Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _statistical_analyst_node(self, state: DataAnalyticsState) -> DataAnalyticsState:
        """Execute statistical analysis."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await analyze_statistics(entity_id, context)

        return {
            **state,
            "statistical_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Statistical Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _insight_generator_node(self, state: DataAnalyticsState) -> DataAnalyticsState:
        """Execute insight generation."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await generate_insights(entity_id, context)

        return {
            **state,
            "insight_generator_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Insight Generation Complete: {json.dumps(result, indent=2)}")
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
            structured_llm = llm.with_structured_output(DataAnalyticsSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state: DataAnalyticsState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_data_analytics(request: AnalyticsRequest) -> AnalyticsResponse:
    """Run the full data analytics assessment workflow."""
    orchestrator = DataAnalyticsOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin analytics assessment for: {request.entity_id}")],
        "entity_id": request.entity_id,
        "assessment_type": request.assessment_type.value,
    }
    for key in [k for k in DataAnalyticsState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    analytics_detail = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("data_quality"):
            analytics_detail = AnalyticsDetail(
                data_quality=DataQuality(structured.get("data_quality", "medium")),
                insight_confidence=InsightConfidence(structured.get("insight_confidence", "medium")),
                patterns_identified=structured.get("patterns_identified", []),
                statistical_findings=structured.get("statistical_findings", []),
                visualization_suggestions=structured.get("visualization_suggestions", []),
                data_coverage_pct=structured.get("data_coverage_pct", 0.0))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return AnalyticsResponse(
        entity_id=request.entity_id, analytics_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), analytics_detail=analytics_detail,
        recommendations=recommendations, summary=summary,
        raw_analysis={
            "data_explorer": final_state.get("data_explorer_result"),
            "statistical_analyst": final_state.get("statistical_analyst_result"),
            "insight_generator": final_state.get("insight_generator_result")},
    )
