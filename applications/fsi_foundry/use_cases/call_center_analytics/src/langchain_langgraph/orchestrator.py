"""
Call Center Analytics Orchestrator.

Orchestrates specialist agents for comprehensive call center analytics.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.call_center_analytics.agents import CallMonitor, AgentPerformanceAnalyst, OperationsInsightGenerator
from use_cases.call_center_analytics.agents.call_monitor import monitor_calls
from use_cases.call_center_analytics.agents.agent_performance_analyst import analyze_agent_performance
from use_cases.call_center_analytics.agents.operations_insight_generator import generate_operations_insights
from use_cases.call_center_analytics.models import (
    AnalyticsRequest, AnalyticsResponse, AnalysisType,
    CallMonitoringResult, CallQuality,
    PerformanceMetrics, CoachingPriority,
    OperationalInsights,
)

from pydantic import BaseModel, Field


class CallCenterAnalyticsSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis."""
    call_monitoring_overall_quality: str = Field(default="good", description="Call quality: excellent, good, fair, or poor")
    call_monitoring_average_sentiment: str = Field(default="neutral", description="Sentiment: very_positive, positive, neutral, negative, very_negative")
    call_monitoring_compliance_score: float = Field(default=0.85, description="Compliance score 0.0 to 1.0")
    call_monitoring_calls_reviewed: int = Field(default=0, description="Number of calls reviewed")
    call_monitoring_quality_issues: list[str] = Field(default_factory=list, description="Quality issues found")
    call_monitoring_compliance_violations: list[str] = Field(default_factory=list, description="Compliance violations")
    performance_average_handle_time: float = Field(default=0.0, description="Average handle time in seconds")
    performance_first_call_resolution_rate: float = Field(default=0.0, description="FCR rate 0.0 to 1.0")
    performance_customer_satisfaction_score: float = Field(default=0.0, description="CSAT score 0.0 to 5.0")
    performance_coaching_priority: str = Field(default="medium", description="Coaching priority: low, medium, high, critical")
    performance_top_performers: list[str] = Field(default_factory=list, description="Top performing agents")
    performance_coaching_opportunities: list[str] = Field(default_factory=list, description="Coaching opportunities")
    operations_call_volume_trend: str = Field(default="", description="Call volume trend")
    operations_peak_hours: list[str] = Field(default_factory=list, description="Peak hours")
    operations_bottlenecks: list[str] = Field(default_factory=list, description="Bottlenecks")
    operations_staffing_recommendations: list[str] = Field(default_factory=list, description="Staffing recommendations")
    operations_process_improvements: list[str] = Field(default_factory=list, description="Process improvements")
    operations_forecast_summary: str = Field(default="", description="Forecast summary")
    summary: str = Field(..., description="Executive summary with key findings and recommendations for call center operations")


class CallCenterAnalyticsState(TypedDict):
    """State managed by the call center analytics orchestrator graph."""
    messages: Annotated[list, add_messages]
    call_center_id: str
    analysis_type: str
    call_monitor_result: dict | None
    agent_performance_analyst_result: dict | None
    operations_insight_generator_result: dict | None
    final_summary: str | None


class CallCenterAnalyticsOrchestrator(LangGraphOrchestrator):
    """Orchestrates call center analytics agents."""

    name = "call_center_analytics_orchestrator"
    state_schema = CallCenterAnalyticsState

    system_prompt = """You are a Senior Call Center Operations Director for a financial services institution.

Your role is to:
1. Coordinate specialist agents (Call Monitor, Agent Performance Analyst, Operations Insight Generator)
2. Synthesize their findings into a comprehensive call center analytics report
3. Ensure operational recommendations are actionable and aligned with service level agreements

When creating the final summary, consider:
- Call quality trends and compliance adherence across the center
- Agent performance benchmarks and coaching priorities
- Operational bottlenecks and staffing optimization opportunities
- Call volume forecasts and capacity planning implications
- Clear next steps for operations managers and team leads

Be concise but thorough. Your summary will be used by call center managers and operations leadership."""

    def __init__(self):
        super().__init__(agents={
            "call_monitor": CallMonitor(),
            "agent_performance_analyst": AgentPerformanceAnalyst(),
            "operations_insight_generator": OperationsInsightGenerator(),
        })

    def build_graph(self) -> StateGraph:
        """Build the call center analytics workflow graph."""
        workflow = StateGraph(CallCenterAnalyticsState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("call_monitor", self._call_monitor_node)
        workflow.add_node("agent_performance_analyst", self._agent_performance_analyst_node)
        workflow.add_node("operations_insight_generator", self._operations_insight_generator_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "call_monitor": "call_monitor",
                "agent_performance_analyst": "agent_performance_analyst",
                "operations_insight_generator": "operations_insight_generator",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("call_monitor", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("agent_performance_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("operations_insight_generator", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: CallCenterAnalyticsState) -> Literal["parallel_assessment", "call_monitor", "agent_performance_analyst", "operations_insight_generator", "synthesize"]:
        """Route based on analysis type and current state."""
        analysis_type = state.get("analysis_type", "full")
        monitor_done = state.get("call_monitor_result") is not None
        performance_done = state.get("agent_performance_analyst_result") is not None
        operations_done = state.get("operations_insight_generator_result") is not None

        if analysis_type == "call_monitoring_only":
            return "synthesize" if monitor_done else "call_monitor"
        if analysis_type == "performance_only":
            return "synthesize" if performance_done else "agent_performance_analyst"
        if analysis_type == "operations_only":
            return "synthesize" if operations_done else "operations_insight_generator"

        # Full assessment
        if not monitor_done and not performance_done and not operations_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: CallCenterAnalyticsState) -> CallCenterAnalyticsState:
        """Execute all three assessments in parallel."""
        import asyncio
        call_center_id = state["call_center_id"]
        context = self._extract_context(state)

        m, p, o = await asyncio.gather(
            monitor_calls(call_center_id, context),
            analyze_agent_performance(call_center_id, context),
            generate_operations_insights(call_center_id, context))

        return {
            **state,
            "call_monitor_result": m,
            "agent_performance_analyst_result": p,
            "operations_insight_generator_result": o,
            "messages": state["messages"] + [
                AIMessage(content=f"Call Monitoring Complete: {json.dumps(m, indent=2)}"),
                AIMessage(content=f"Performance Analysis Complete: {json.dumps(p, indent=2)}"),
                AIMessage(content=f"Operations Insights Complete: {json.dumps(o, indent=2)}"),
            ],
        }

    async def _call_monitor_node(self, state: CallCenterAnalyticsState) -> CallCenterAnalyticsState:
        """Execute call monitoring."""
        call_center_id = state["call_center_id"]
        context = self._extract_context(state)
        result = await monitor_calls(call_center_id, context)
        return {
            **state, "call_monitor_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Call Monitoring Complete: {json.dumps(result, indent=2)}")],
        }

    async def _agent_performance_analyst_node(self, state: CallCenterAnalyticsState) -> CallCenterAnalyticsState:
        """Execute agent performance analysis."""
        call_center_id = state["call_center_id"]
        context = self._extract_context(state)
        result = await analyze_agent_performance(call_center_id, context)
        return {
            **state, "agent_performance_analyst_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Performance Analysis Complete: {json.dumps(result, indent=2)}")],
        }

    async def _operations_insight_generator_node(self, state: CallCenterAnalyticsState) -> CallCenterAnalyticsState:
        """Execute operations insight generation."""
        call_center_id = state["call_center_id"]
        context = self._extract_context(state)
        result = await generate_operations_insights(call_center_id, context)
        return {
            **state, "operations_insight_generator_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Operations Insights Complete: {json.dumps(result, indent=2)}")],
        }

    async def _synthesize_node(self, state: CallCenterAnalyticsState) -> CallCenterAnalyticsState:
        """Synthesize findings into structured assessment."""
        monitor = state.get("call_monitor_result")
        performance = state.get("agent_performance_analyst_result")
        operations = state.get("operations_insight_generator_result")

        sections = []
        if monitor:
            sections.append(f"## Call Monitoring\n{json.dumps(monitor, indent=2)}")
        if performance:
            sections.append(f"## Agent Performance\n{json.dumps(performance, indent=2)}")
        if operations:
            sections.append(f"## Operations Insights\n{json.dumps(operations, indent=2)}")

        synthesis_prompt = f"""You are a Senior Call Center Operations Director. Based on the following specialist assessments, produce a structured call center analytics report.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, scores, and details."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CallCenterAnalyticsSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({"monitor": monitor, "performance": performance, "operations": operations}, synthesis_prompt)
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Analytics: {json.dumps(structured)}")],
        }

    def _extract_context(self, state: CallCenterAnalyticsState) -> str | None:
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_call_center_analytics(request: AnalyticsRequest) -> AnalyticsResponse:
    """Run the full call center analytics workflow."""
    orchestrator = CallCenterAnalyticsOrchestrator()
    initial_state: CallCenterAnalyticsState = {
        "messages": [HumanMessage(content=f"Begin call center analytics for: {request.call_center_id}")],
        "call_center_id": request.call_center_id,
        "analysis_type": request.analysis_type.value,
        "call_monitor_result": None,
        "agent_performance_analyst_result": None,
        "operations_insight_generator_result": None,
        "final_summary": None,
    }
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    call_monitoring, performance_metrics, operational_insights = None, None, None
    summary = "Analytics completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.CALL_MONITORING_ONLY]:
            if structured.get("call_monitoring_overall_quality"):
                call_monitoring = CallMonitoringResult(
                    overall_quality=CallQuality(structured.get("call_monitoring_overall_quality", "good")),
                    average_sentiment=structured.get("call_monitoring_average_sentiment", "neutral"),
                    compliance_score=structured.get("call_monitoring_compliance_score", 0.0),
                    calls_reviewed=structured.get("call_monitoring_calls_reviewed", 0),
                    quality_issues=structured.get("call_monitoring_quality_issues", []),
                    compliance_violations=structured.get("call_monitoring_compliance_violations", []))
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.PERFORMANCE_ONLY]:
            if structured.get("performance_coaching_priority"):
                performance_metrics = PerformanceMetrics(
                    average_handle_time=structured.get("performance_average_handle_time", 0.0),
                    first_call_resolution_rate=structured.get("performance_first_call_resolution_rate", 0.0),
                    customer_satisfaction_score=structured.get("performance_customer_satisfaction_score", 0.0),
                    coaching_priority=CoachingPriority(structured.get("performance_coaching_priority", "medium")),
                    top_performers=structured.get("performance_top_performers", []),
                    coaching_opportunities=structured.get("performance_coaching_opportunities", []))
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.OPERATIONS_ONLY]:
            if structured.get("operations_call_volume_trend"):
                operational_insights = OperationalInsights(
                    call_volume_trend=structured.get("operations_call_volume_trend", ""),
                    peak_hours=structured.get("operations_peak_hours", []),
                    bottlenecks=structured.get("operations_bottlenecks", []),
                    staffing_recommendations=structured.get("operations_staffing_recommendations", []),
                    process_improvements=structured.get("operations_process_improvements", []),
                    forecast_summary=structured.get("operations_forecast_summary", ""))
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    return AnalyticsResponse(
        call_center_id=request.call_center_id, analytics_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), call_monitoring=call_monitoring,
        performance_metrics=performance_metrics, operational_insights=operational_insights,
        summary=summary, raw_analysis={
            "call_monitor": final_state.get("call_monitor_result"),
            "agent_performance_analyst": final_state.get("agent_performance_analyst_result"),
            "operations_insight_generator": final_state.get("operations_insight_generator_result")})
