"""Market Surveillance Orchestrator (Strands)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import TradePatternAnalyst, CommunicationMonitor, SurveillanceAlertGenerator
from .agents.trade_pattern_analyst import run_trade_pattern_analyst
from .agents.communication_monitor import run_communication_monitor
from .agents.surveillance_alert_generator import run_surveillance_alert_generator
from .models import (
    SurveillanceRequest, SurveillanceResponse, SurveillanceType,
    TradePatternResult, CommsMonitorResult, AlertResult, AlertSeverity,
)

class SurveillanceOrchestrator(StrandsOrchestrator):
    name = "surveillance_orchestrator"
    system_prompt = """You are a Senior Market Surveillance Officer.
Coordinate trade pattern analysis, communication monitoring, and alert generation.
Synthesize into a surveillance decision: CLEAR / INVESTIGATE / ESCALATE / REPORT TO REGULATOR."""

    def __init__(self):
        super().__init__(agents={
            "trade_pattern_analyst": TradePatternAnalyst(),
            "communication_monitor": CommunicationMonitor(),
            "surveillance_alert_generator": SurveillanceAlertGenerator(),
        })

    async def arun_assessment(self, customer_id, surveillance_type="full", context=None):
        import asyncio
        trade = comms = alert = None
        if surveillance_type == "full":
            trade, comms, alert = await asyncio.gather(
                run_trade_pattern_analyst(customer_id, context),
                run_communication_monitor(customer_id, context),
                run_surveillance_alert_generator(customer_id, context),
            )
        elif surveillance_type == "trade_only":
            trade = await run_trade_pattern_analyst(customer_id, context)
        elif surveillance_type == "comms_only":
            comms = await run_communication_monitor(customer_id, context)
        elif surveillance_type == "alert_only":
            alert = await run_surveillance_alert_generator(customer_id, context)

        sections = []
        if trade: sections.append(f"## Trade Patterns\n{json.dumps(trade, indent=2)}")
        if comms: sections.append(f"## Communications\n{json.dumps(comms, indent=2)}")
        if alert: sections.append(f"## Alerts\n{json.dumps(alert, indent=2)}")
        prompt = f"Based on:\n{chr(10).join(sections)}\n\nProvide: 1. Decision (CLEAR/INVESTIGATE/ESCALATE/REPORT) 2. Key findings 3. Required actions"
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, prompt))
        return {"customer_id": customer_id, "trade_result": trade, "comms_result": comms, "alert_result": alert, "final_summary": summary}

def parse_trade_pattern(analysis):
    lower = analysis.lower()
    patterns, anomalies = [], []
    for p in ["insider trading", "wash trading", "spoofing", "layering", "front running", "pump and dump"]:
        if p in lower: patterns.append(p.title())
    for a in ["unusual volume", "pre-announcement", "price manipulation", "abnormal"]:
        if a in lower: anomalies.append(a.title())
    score = 75 if "high" in lower else 90 if "critical" in lower else 25 if "low" in lower else 50
    return TradePatternResult(patterns_detected=patterns or ["Standard review"], risk_score=score, anomalies=anomalies, notes=["Analysis complete"])

def parse_comms_result(analysis):
    lower = analysis.lower()
    flagged, concerns = [], []
    if "non-public" in lower or "material" in lower: flagged.append("Potential MNPI sharing")
    if "external" in lower: flagged.append("External communication flagged")
    if "barrier" in lower or "wall" in lower: concerns.append("Information barrier concern")
    if "insider" in lower: concerns.append("Insider trading risk")
    return CommsMonitorResult(flagged_communications=flagged or ["Standard review"], risk_indicators=["Communication reviewed"], compliance_concerns=concerns)

def parse_alert_result(analysis):
    lower = analysis.lower()
    severity = AlertSeverity.HIGH if "high" in lower or "critical" in lower else AlertSeverity.MEDIUM
    if "critical" in lower: severity = AlertSeverity.CRITICAL
    elif "low" in lower: severity = AlertSeverity.LOW
    alert_type = "Insider Trading" if "insider" in lower else "Market Manipulation" if "manipulat" in lower else "Suspicious Activity"
    return AlertResult(severity=severity, alert_type=alert_type, recommended_actions=["Review case", "Document findings"], escalation_required=severity in [AlertSeverity.HIGH, AlertSeverity.CRITICAL])

async def run_market_surveillance(request: SurveillanceRequest) -> SurveillanceResponse:
    orch = SurveillanceOrchestrator()
    state = await orch.arun_assessment(request.customer_id, request.surveillance_type.value, request.additional_context)
    trade = comms = alert = None
    if request.surveillance_type in [SurveillanceType.FULL, SurveillanceType.TRADE_ONLY] and state.get("trade_result"):
        trade = parse_trade_pattern(state["trade_result"].get("analysis", ""))
    if request.surveillance_type in [SurveillanceType.FULL, SurveillanceType.COMMS_ONLY] and state.get("comms_result"):
        comms = parse_comms_result(state["comms_result"].get("analysis", ""))
    if request.surveillance_type in [SurveillanceType.FULL, SurveillanceType.ALERT_ONLY] and state.get("alert_result"):
        alert = parse_alert_result(state["alert_result"].get("analysis", ""))
    return SurveillanceResponse(
        customer_id=request.customer_id, surveillance_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        trade_pattern=trade, comms_monitor=comms, alert=alert,
        summary=state.get("final_summary", "Surveillance assessment completed"),
        raw_analysis={"trade_result": state.get("trade_result"), "comms_result": state.get("comms_result"), "alert_result": state.get("alert_result")},
    )
