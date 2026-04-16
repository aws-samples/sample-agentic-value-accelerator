"""Market Surveillance Orchestrator (LangGraph)."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.market_surveillance.agents import TradePatternAnalyst, CommunicationMonitor, SurveillanceAlertGenerator
from use_cases.market_surveillance.agents.trade_pattern_analyst import run_trade_pattern_analyst
from use_cases.market_surveillance.agents.communication_monitor import run_communication_monitor
from use_cases.market_surveillance.agents.surveillance_alert_generator import run_surveillance_alert_generator
from use_cases.market_surveillance.models import (
    SurveillanceRequest, SurveillanceResponse, SurveillanceType,
    TradePatternResult, CommsMonitorResult, AlertResult, AlertSeverity,
)

class SurveillanceState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_id: str
    surveillance_type: str
    trade_result: dict | None
    comms_result: dict | None
    alert_result: dict | None
    final_summary: str | None

class SurveillanceOrchestrator(LangGraphOrchestrator):
    name = "surveillance_orchestrator"
    state_schema = SurveillanceState
    system_prompt = """You are a Senior Market Surveillance Officer.
Coordinate trade pattern analysis, communication monitoring, and alert generation.
Synthesize into a surveillance decision: CLEAR / INVESTIGATE / ESCALATE / REPORT TO REGULATOR."""

    def __init__(self):
        super().__init__(agents={"trade_pattern_analyst": TradePatternAnalyst(), "communication_monitor": CommunicationMonitor(), "surveillance_alert_generator": SurveillanceAlertGenerator()})

    def build_graph(self):
        wf = StateGraph(SurveillanceState)
        wf.add_node("parallel", self._parallel_node)
        wf.add_node("trade_pattern_analyst", self._trade_node)
        wf.add_node("communication_monitor", self._comms_node)
        wf.add_node("surveillance_alert_generator", self._alert_node)
        wf.add_node("synthesize", self._synthesize_node)
        wf.set_conditional_entry_point(self._router, {"parallel": "parallel", "trade_pattern_analyst": "trade_pattern_analyst", "communication_monitor": "communication_monitor", "surveillance_alert_generator": "surveillance_alert_generator"})
        wf.add_edge("parallel", "synthesize")
        wf.add_conditional_edges("trade_pattern_analyst", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("communication_monitor", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("surveillance_alert_generator", self._router, {"synthesize": "synthesize"})
        wf.add_edge("synthesize", END)
        return wf.compile()

    def _router(self, state) -> Literal["parallel", "trade_pattern_analyst", "communication_monitor", "surveillance_alert_generator", "synthesize"]:
        st = state.get("surveillance_type", "full")
        if st == "trade_only": return "synthesize" if state.get("trade_result") else "trade_pattern_analyst"
        if st == "comms_only": return "synthesize" if state.get("comms_result") else "communication_monitor"
        if st == "alert_only": return "synthesize" if state.get("alert_result") else "surveillance_alert_generator"
        if not state.get("trade_result") and not state.get("comms_result") and not state.get("alert_result"): return "parallel"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        cid, ctx = state["customer_id"], self._ctx(state)
        t, c, a = await asyncio.gather(run_trade_pattern_analyst(cid, ctx), run_communication_monitor(cid, ctx), run_surveillance_alert_generator(cid, ctx))
        return {**state, "trade_result": t, "comms_result": c, "alert_result": a, "messages": state["messages"] + [AIMessage(content="All assessments complete")]}

    async def _trade_node(self, state):
        r = await run_trade_pattern_analyst(state["customer_id"], self._ctx(state))
        return {**state, "trade_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _comms_node(self, state):
        r = await run_communication_monitor(state["customer_id"], self._ctx(state))
        return {**state, "comms_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _alert_node(self, state):
        r = await run_surveillance_alert_generator(state["customer_id"], self._ctx(state))
        return {**state, "alert_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _synthesize_node(self, state):
        sections = []
        if state.get("trade_result"): sections.append(f"## Trade Patterns\n{json.dumps(state['trade_result'], indent=2)}")
        if state.get("comms_result"): sections.append(f"## Communications\n{json.dumps(state['comms_result'], indent=2)}")
        if state.get("alert_result"): sections.append(f"## Alerts\n{json.dumps(state['alert_result'], indent=2)}")
        prompt = f"Based on:\n{chr(10).join(sections)}\n\nProvide: 1. Decision (CLEAR/INVESTIGATE/ESCALATE/REPORT) 2. Key findings 3. Required actions"
        summary = await self.synthesize({}, prompt)
        return {**state, "final_summary": summary, "messages": state["messages"] + [AIMessage(content=summary)]}

    def _ctx(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None

# Reuse parsers from strands (identical logic)
from use_cases.market_surveillance.models import TradePatternResult, CommsMonitorResult, AlertResult, AlertSeverity

def parse_trade_pattern(analysis):
    lower = analysis.lower()
    patterns = [p.title() for p in ["insider trading", "wash trading", "spoofing", "layering", "front running"] if p in lower]
    anomalies = [a.title() for a in ["unusual volume", "pre-announcement", "price manipulation"] if a in lower]
    score = 75 if "high" in lower else 90 if "critical" in lower else 25 if "low" in lower else 50
    return TradePatternResult(patterns_detected=patterns or ["Standard review"], risk_score=score, anomalies=anomalies, notes=["Analysis complete"])

def parse_comms_result(analysis):
    lower = analysis.lower()
    flagged = []
    if "non-public" in lower or "material" in lower: flagged.append("Potential MNPI sharing")
    if "external" in lower: flagged.append("External communication flagged")
    concerns = []
    if "barrier" in lower or "wall" in lower: concerns.append("Information barrier concern")
    if "insider" in lower: concerns.append("Insider trading risk")
    return CommsMonitorResult(flagged_communications=flagged or ["Standard review"], risk_indicators=["Communication reviewed"], compliance_concerns=concerns)

def parse_alert_result(analysis):
    lower = analysis.lower()
    severity = AlertSeverity.CRITICAL if "critical" in lower else AlertSeverity.HIGH if "high" in lower else AlertSeverity.LOW if "low" in lower else AlertSeverity.MEDIUM
    alert_type = "Insider Trading" if "insider" in lower else "Market Manipulation" if "manipulat" in lower else "Suspicious Activity"
    return AlertResult(severity=severity, alert_type=alert_type, recommended_actions=["Review case", "Document findings"], escalation_required=severity in [AlertSeverity.HIGH, AlertSeverity.CRITICAL])

async def run_market_surveillance(request: SurveillanceRequest) -> SurveillanceResponse:
    orch = SurveillanceOrchestrator()
    initial_state = {"messages": [HumanMessage(content=f"Begin surveillance for: {request.customer_id}")],
        "customer_id": request.customer_id, "surveillance_type": request.surveillance_type.value,
        "trade_result": None, "comms_result": None, "alert_result": None, "final_summary": None}
    if request.additional_context: initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    state = await orch.arun(initial_state)
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
        summary=state.get("final_summary", "Surveillance completed"),
        raw_analysis={"trade_result": state.get("trade_result"), "comms_result": state.get("comms_result"), "alert_result": state.get("alert_result")})
