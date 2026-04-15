"""Fraud Detection Orchestrator (Strands Implementation)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import TransactionMonitor, PatternAnalyst, AlertGenerator
from .agents.transaction_monitor import monitor_transactions
from .agents.pattern_analyst import analyze_patterns
from .agents.alert_generator import generate_alerts
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    MonitoringRequest, MonitoringResponse, MonitoringType,
    RiskAssessment, RiskLevel, FraudAlert, AlertSeverity,
)


class FraudDetectionOrchestrator(StrandsOrchestrator):
    name = "fraud_detection_orchestrator"
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

    def run_assessment(self, customer_id: str, monitoring_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        monitor_result = pattern_result = alert_result = None
        input_text = self._build_input_text(customer_id, context)

        if monitoring_type == "full":
            results = self.run_parallel(["transaction_monitor", "pattern_analyst", "alert_generator"], input_text)
            monitor_result = {"agent": "transaction_monitor", "customer_id": customer_id, "analysis": results["transaction_monitor"].output}
            pattern_result = {"agent": "pattern_analyst", "customer_id": customer_id, "analysis": results["pattern_analyst"].output}
            alert_result = {"agent": "alert_generator", "customer_id": customer_id, "analysis": results["alert_generator"].output}
        elif monitoring_type == "transaction_monitoring":
            r = self.run_agent("transaction_monitor", input_text)
            monitor_result = {"agent": "transaction_monitor", "customer_id": customer_id, "analysis": r.output}
        elif monitoring_type == "pattern_analysis":
            r = self.run_agent("pattern_analyst", input_text)
            pattern_result = {"agent": "pattern_analyst", "customer_id": customer_id, "analysis": r.output}
        else:
            r = self.run_agent("alert_generator", input_text)
            alert_result = {"agent": "alert_generator", "customer_id": customer_id, "analysis": r.output}

        summary = self.synthesize({}, self._build_synthesis_prompt(monitor_result, pattern_result, alert_result))
        return {"customer_id": customer_id, "monitor_result": monitor_result, "pattern_result": pattern_result, "alert_result": alert_result, "final_summary": summary}

    async def arun_assessment(self, customer_id: str, monitoring_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        monitor_result = pattern_result = alert_result = None

        if monitoring_type == "full":
            monitor_result, pattern_result, alert_result = await asyncio.gather(
                monitor_transactions(customer_id, context),
                analyze_patterns(customer_id, context),
                generate_alerts(customer_id, context),
            )
        elif monitoring_type == "transaction_monitoring":
            monitor_result = await monitor_transactions(customer_id, context)
        elif monitoring_type == "pattern_analysis":
            pattern_result = await analyze_patterns(customer_id, context)
        else:
            alert_result = await generate_alerts(customer_id, context)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(monitor_result, pattern_result, alert_result)))
        return {"customer_id": customer_id, "monitor_result": monitor_result, "pattern_result": pattern_result, "alert_result": alert_result, "final_summary": summary}

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        base = f"""Perform fraud detection analysis for account: {customer_id}

Steps:
1. Retrieve the account profile using s3_retriever_tool with data_type='profile'
2. Analyze all data and provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None: agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None: agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured fields"},
            domain_context=self.system_prompt)



async def run_fraud_detection(request):
    """Run the assessment workflow."""
    orchestrator = FraudDetectionOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        monitoring_type=request.monitoring_type.value if hasattr(request.monitoring_type, 'value') else str(request.monitoring_type),
        context=getattr(request, 'additional_context', None))

    risk_assessment = None; alerts = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
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
        raw_analysis={"transaction_monitor": final_state.get("monitor_result"), "pattern_analyst": final_state.get("pattern_result"), "alert_generator": final_state.get("alert_result")},
    )
