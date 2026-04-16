"""Fraud Detection Orchestrator."""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.fraud_detection.agents import TransactionMonitor, PatternAnalyst, AlertGenerator
from use_cases.fraud_detection.agents.transaction_monitor import monitor_transactions
from use_cases.fraud_detection.agents.pattern_analyst import analyze_patterns
from use_cases.fraud_detection.agents.alert_generator import generate_alerts
from use_cases.fraud_detection.models import (
    MonitoringRequest, MonitoringResponse, MonitoringType,
    RiskAssessment, RiskLevel, FraudAlert, AlertSeverity,
)

from pydantic import BaseModel, Field

class FraudDetectionSynthesisSchema(BaseModel):
    """Structured synthesis for fraud detection."""
    risk_score: int = Field(default=50, description="Fraud risk score from 0 to 100")
    risk_level: str = Field(default="medium", description="Risk level: low, medium, high, or critical")
    risk_factors: list[str] = Field(default_factory=list, description="List of identified fraud risk factors")
    alerts: list[str] = Field(default_factory=list, description="List of fraud alerts with severity")
    recommended_actions: list[str] = Field(default_factory=list, description="List of recommended actions")
    summary: str = Field(..., description="Executive summary of fraud detection analysis")



class FraudDetectionState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_id: str
    monitoring_type: str
    transaction_monitor_result: dict | None
    pattern_analyst_result: dict | None
    alert_generator_result: dict | None
    final_summary: str | None


class FraudDetectionOrchestrator(LangGraphOrchestrator):
    name = "fraud_detection_orchestrator"
    state_schema = FraudDetectionState
    system_prompt = """You are a Senior Fraud Detection Supervisor for a financial institution.

Your role is to:
1. Coordinate specialist agents (Transaction Monitor, Pattern Analyst, Alert Generator)
2. Synthesize their findings into a comprehensive fraud risk assessment
3. Ensure suspicious activities are detected, analyzed, and escalated appropriately

When creating the final summary, consider:
- Overall risk score and classification based on all agent findings
- Generated alerts with severity levels and supporting evidence
- Pattern analysis results indicating fraud typologies or behavioral anomalies
- Recommended investigation actions and escalation paths
- Regulatory reporting requirements if applicable

Be precise and evidence-based. Your assessment will be used by fraud investigators and compliance officers."""

    def __init__(self):
        super().__init__(agents={
            "transaction_monitor": TransactionMonitor(),
            "pattern_analyst": PatternAnalyst(),
            "alert_generator": AlertGenerator(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(FraudDetectionState)
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("transaction_monitor", self._transaction_monitor_node)
        workflow.add_node("pattern_analyst", self._pattern_analyst_node)
        workflow.add_node("alert_generator", self._alert_generator_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "transaction_monitor": "transaction_monitor",
            "pattern_analyst": "pattern_analyst",
            "alert_generator": "alert_generator",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("transaction_monitor", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("pattern_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("alert_generator", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state: FraudDetectionState) -> Literal["parallel_assessment", "transaction_monitor", "pattern_analyst", "alert_generator", "synthesize"]:
        mt = state.get("monitoring_type", "full")
        tm_done = state.get("transaction_monitor_result") is not None
        pa_done = state.get("pattern_analyst_result") is not None
        ag_done = state.get("alert_generator_result") is not None

        if mt == "transaction_monitoring":
            return "synthesize" if tm_done else "transaction_monitor"
        if mt == "pattern_analysis":
            return "synthesize" if pa_done else "pattern_analyst"
        if mt == "alert_generation":
            return "synthesize" if ag_done else "alert_generator"
        if not tm_done and not pa_done and not ag_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state):
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        import asyncio
        tm_r, pa_r, ag_r = await asyncio.gather(
            monitor_transactions(customer_id, context),
            analyze_patterns(customer_id, context),
            generate_alerts(customer_id, context),
        )
        return {**state, "transaction_monitor_result": tm_r, "pattern_analyst_result": pa_r, "alert_generator_result": ag_r,
                "messages": state["messages"] + [AIMessage(content=f"Analysis Complete: {json.dumps({'tm': tm_r, 'pa': pa_r, 'ag': ag_r}, indent=2)}")]}

    async def _transaction_monitor_node(self, state):
        result = await monitor_transactions(state["customer_id"], self._extract_context(state))
        return {**state, "transaction_monitor_result": result, "messages": state["messages"] + [AIMessage(content=f"Transaction Monitor Complete: {json.dumps(result, indent=2)}")]}

    async def _pattern_analyst_node(self, state):
        result = await analyze_patterns(state["customer_id"], self._extract_context(state))
        return {**state, "pattern_analyst_result": result, "messages": state["messages"] + [AIMessage(content=f"Pattern Analysis Complete: {json.dumps(result, indent=2)}")]}

    async def _alert_generator_node(self, state):
        result = await generate_alerts(state["customer_id"], self._extract_context(state))
        return {**state, "alert_generator_result": result, "messages": state["messages"] + [AIMessage(content=f"Alert Generation Complete: {json.dumps(result, indent=2)}")]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "monitoring_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(FraudDetectionSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"):
                return last.content
        return None



async def run_fraud_detection(request):
    """Run the assessment workflow."""
    orchestrator = FraudDetectionOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "monitoring_type": request.monitoring_type.value if hasattr(request.monitoring_type, 'value') else str(request.monitoring_type),
    }
    for key in [k for k in FraudDetectionState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    risk_assessment = None; alerts = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("risk_score") is not None:
            risk_assessment = RiskAssessment(score=structured.get("risk_score", 50),
                level=RiskLevel(structured.get("risk_level", "medium")),
                factors=structured.get("risk_factors", []),
                recommendations=structured.get("recommended_actions", []))
        alerts = [FraudAlert(alert_id=f"ALERT-{i+1}", severity=AlertSeverity.MEDIUM,
            description=a, recommended_action="Review") for i, a in enumerate(structured.get("alerts", []))]
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return MonitoringResponse(
        customer_id=request.customer_id, monitoring_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), risk_assessment=risk_assessment, alerts=alerts,
        summary=summary,
        raw_analysis={"transaction_monitor": final_state.get("transaction_monitor_result"), "pattern_analyst": final_state.get("pattern_analyst_result"), "alert_generator": final_state.get("alert_generator_result")},
    )
