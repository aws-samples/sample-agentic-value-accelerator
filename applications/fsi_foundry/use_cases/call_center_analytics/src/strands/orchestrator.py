"""
Call Center Analytics Orchestrator (Strands Implementation).

Orchestrates specialist agents for comprehensive call center analytics.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import CallMonitor, AgentPerformanceAnalyst, OperationsInsightGenerator
from .agents.call_monitor import monitor_calls
from .agents.agent_performance_analyst import analyze_agent_performance
from .agents.operations_insight_generator import generate_operations_insights
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    AnalyticsRequest, AnalyticsResponse, AnalysisType,
    CallMonitoringResult, CallQuality,
    PerformanceMetrics, CoachingPriority,
    OperationalInsights,
)


class CallCenterAnalyticsOrchestrator(StrandsOrchestrator):
    """Orchestrates call center analytics agents."""

    name = "call_center_analytics_orchestrator"

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

    def run_assessment(self, call_center_id: str, analysis_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        """Run call center analytics workflow."""
        monitor_result = None
        performance_result = None
        operations_result = None
        input_text = self._build_input_text(call_center_id, context)

        if analysis_type == "full":
            results = self.run_parallel(
                ["call_monitor", "agent_performance_analyst", "operations_insight_generator"], input_text)
            monitor_result = {"agent": "call_monitor", "call_center_id": call_center_id, "analysis": results["call_monitor"].output}
            performance_result = {"agent": "agent_performance_analyst", "call_center_id": call_center_id, "analysis": results["agent_performance_analyst"].output}
            operations_result = {"agent": "operations_insight_generator", "call_center_id": call_center_id, "analysis": results["operations_insight_generator"].output}
        elif analysis_type == "call_monitoring_only":
            result = self.run_agent("call_monitor", input_text)
            monitor_result = {"agent": "call_monitor", "call_center_id": call_center_id, "analysis": result.output}
        elif analysis_type == "performance_only":
            result = self.run_agent("agent_performance_analyst", input_text)
            performance_result = {"agent": "agent_performance_analyst", "call_center_id": call_center_id, "analysis": result.output}
        elif analysis_type == "operations_only":
            result = self.run_agent("operations_insight_generator", input_text)
            operations_result = {"agent": "operations_insight_generator", "call_center_id": call_center_id, "analysis": result.output}

        synthesis_prompt = self._build_synthesis_prompt(monitor_result, performance_result, operations_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "call_center_id": call_center_id,
            "call_monitor_result": monitor_result,
            "agent_performance_analyst_result": performance_result,
            "operations_insight_generator_result": operations_result,
            "final_summary": summary,
        }

    async def arun_assessment(self, call_center_id: str, analysis_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        monitor_result = None
        performance_result = None
        operations_result = None

        if analysis_type == "full":
            m, p, o = await asyncio.gather(
                monitor_calls(call_center_id, context),
                analyze_agent_performance(call_center_id, context),
                generate_operations_insights(call_center_id, context))
            monitor_result, performance_result, operations_result = m, p, o
        elif analysis_type == "call_monitoring_only":
            monitor_result = await monitor_calls(call_center_id, context)
        elif analysis_type == "performance_only":
            performance_result = await analyze_agent_performance(call_center_id, context)
        elif analysis_type == "operations_only":
            operations_result = await generate_operations_insights(call_center_id, context)

        synthesis_prompt = self._build_synthesis_prompt(monitor_result, performance_result, operations_result)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))

        return {
            "call_center_id": call_center_id,
            "call_monitor_result": monitor_result,
            "agent_performance_analyst_result": performance_result,
            "operations_insight_generator_result": operations_result,
            "final_summary": summary,
        }

    def _build_input_text(self, call_center_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for call center: {call_center_id}

Steps:
1. Retrieve the call center profile using s3_retriever_tool with data_type='profile'
2. Analyze all retrieved data and provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, monitor_result, performance_result, operations_result) -> str:
        agent_results = {}
        if monitor_result:
            agent_results["call_monitoring"] = monitor_result
        if performance_result:
            agent_results["agent_performance"] = performance_result
        if operations_result:
            agent_results["operations_insights"] = operations_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "call_monitoring": {"overall_quality": "excellent|good|fair|poor", "average_sentiment": "very_positive|positive|neutral|negative|very_negative", "compliance_score": "float 0-1", "calls_reviewed": "int", "quality_issues": ["list"], "compliance_violations": ["list"]},
                "performance_metrics": {"average_handle_time": "float seconds", "first_call_resolution_rate": "float 0-1", "customer_satisfaction_score": "float 0-5", "coaching_priority": "low|medium|high|critical", "top_performers": ["list"], "coaching_opportunities": ["list"]},
                "operational_insights": {"call_volume_trend": "string", "peak_hours": ["list"], "bottlenecks": ["list"], "staffing_recommendations": ["list"], "process_improvements": ["list"], "forecast_summary": "string"},
                "summary": "Executive summary with key findings and recommendations"},
            domain_context="You are a Senior Call Center Operations Director for a financial services institution.")


async def run_call_center_analytics(request: AnalyticsRequest) -> AnalyticsResponse:
    """Run the full call center analytics workflow (Strands implementation)."""
    orchestrator = CallCenterAnalyticsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        call_center_id=request.call_center_id,
        analysis_type=request.analysis_type.value,
        context=request.additional_context)

    call_monitoring, performance_metrics, operational_insights = None, None, None
    summary = "Analytics completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.CALL_MONITORING_ONLY]:
            if structured.get("call_monitoring"):
                call_monitoring = CallMonitoringResult(**structured["call_monitoring"])
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.PERFORMANCE_ONLY]:
            if structured.get("performance_metrics"):
                performance_metrics = PerformanceMetrics(**structured["performance_metrics"])
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.OPERATIONS_ONLY]:
            if structured.get("operational_insights"):
                operational_insights = OperationalInsights(**structured["operational_insights"])
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return AnalyticsResponse(
        call_center_id=request.call_center_id, analytics_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), call_monitoring=call_monitoring,
        performance_metrics=performance_metrics, operational_insights=operational_insights,
        summary=summary, raw_analysis={
            "call_monitor": final_state.get("call_monitor_result"),
            "agent_performance_analyst": final_state.get("agent_performance_analyst_result"),
            "operations_insight_generator": final_state.get("operations_insight_generator_result")})
