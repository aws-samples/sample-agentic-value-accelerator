"""Investment Advisory Orchestrator."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.investment_advisory.agents import PortfolioAnalyst, MarketResearcher, ClientProfiler
from use_cases.investment_advisory.agents.portfolio_analyst import analyze_portfolio
from use_cases.investment_advisory.agents.market_researcher import research_market
from use_cases.investment_advisory.agents.client_profiler import profile_client
from use_cases.investment_advisory.models import AdvisoryRequest, AdvisoryResponse, AdvisoryType, PortfolioAnalysis, RiskLevel

class InvestmentAdvisoryState(TypedDict):
    messages: Annotated[list, add_messages]
    client_id: str
    advisory_type: str
    portfolio_analyst_result: dict | None
    market_researcher_result: dict | None
    client_profiler_result: dict | None
    final_summary: str | None

class InvestmentAdvisoryOrchestrator(LangGraphOrchestrator):
    name = "investment_advisory_orchestrator"
    state_schema = InvestmentAdvisoryState
    system_prompt = """You are a Senior Investment Advisory Supervisor.
Your role is to:
1. Coordinate specialist agents (Portfolio Analyst, Market Researcher, Client Profiler)
2. Synthesize their findings into comprehensive investment recommendations
3. Ensure recommendations are suitable for the client's risk profile and goals
Be precise and compliant with fiduciary standards."""

    def __init__(self):
        super().__init__(agents={"portfolio_analyst": PortfolioAnalyst(), "market_researcher": MarketResearcher(), "client_profiler": ClientProfiler()})

    def build_graph(self):
        wf = StateGraph(InvestmentAdvisoryState)
        wf.add_node("parallel_assessment", self._parallel_node)
        wf.add_node("portfolio_analyst", self._pa_node)
        wf.add_node("market_researcher", self._mr_node)
        wf.add_node("client_profiler", self._cp_node)
        wf.add_node("synthesize", self._synthesize_node)
        wf.set_conditional_entry_point(self._router, {"parallel_assessment": "parallel_assessment", "portfolio_analyst": "portfolio_analyst", "market_researcher": "market_researcher", "client_profiler": "client_profiler"})
        wf.add_edge("parallel_assessment", "synthesize")
        wf.add_conditional_edges("portfolio_analyst", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("market_researcher", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("client_profiler", self._router, {"synthesize": "synthesize"})
        wf.add_edge("synthesize", END)
        return wf.compile()

    def _router(self, state) -> Literal["parallel_assessment", "portfolio_analyst", "market_researcher", "client_profiler", "synthesize"]:
        at = state.get("advisory_type", "full")
        pa = state.get("portfolio_analyst_result") is not None
        mr = state.get("market_researcher_result") is not None
        cp = state.get("client_profiler_result") is not None
        if at == "portfolio_review": return "synthesize" if pa else "portfolio_analyst"
        if at == "market_analysis": return "synthesize" if mr else "market_researcher"
        if at == "client_profiling": return "synthesize" if cp else "client_profiler"
        if not pa and not mr and not cp: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        cid, ctx = state["client_id"], self._extract_context(state)
        pa_r, mr_r, cp_r = await asyncio.gather(analyze_portfolio(cid, ctx), research_market(cid, ctx), profile_client(cid, ctx))
        return {**state, "portfolio_analyst_result": pa_r, "market_researcher_result": mr_r, "client_profiler_result": cp_r,
                "messages": state["messages"] + [AIMessage(content=f"Analysis Complete: {json.dumps({'pa': pa_r, 'mr': mr_r, 'cp': cp_r}, indent=2)}")]}

    async def _pa_node(self, state):
        r = await analyze_portfolio(state["client_id"], self._extract_context(state))
        return {**state, "portfolio_analyst_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _mr_node(self, state):
        r = await research_market(state["client_id"], self._extract_context(state))
        return {**state, "market_researcher_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _cp_node(self, state):
        r = await profile_client(state["client_id"], self._extract_context(state))
        return {**state, "client_profiler_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _synthesize_node(self, state):
        sections = []
        for k, l in [("portfolio_analyst_result", "Portfolio"), ("market_researcher_result", "Market"), ("client_profiler_result", "Client")]:
            if state.get(k): sections.append(f"## {l}\n{json.dumps(state[k], indent=2)}")
        summary = await self.synthesize({"pa": state.get("portfolio_analyst_result"), "mr": state.get("market_researcher_result"), "cp": state.get("client_profiler_result")},
            f"Based on findings, provide investment advisory:\n\n{chr(10).join(sections)}\n\nProvide: 1. Risk assessment 2. Recommendations 3. Client-suitable strategies")
        return {**state, "final_summary": summary, "messages": state["messages"] + [AIMessage(content=summary)]}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None

def parse_portfolio_analysis(analysis):
    level, rebal, risks = RiskLevel.MODERATE, False, []
    lower = analysis.lower()
    if "aggressive" in lower: level = RiskLevel.AGGRESSIVE
    elif "conservative" in lower: level = RiskLevel.CONSERVATIVE
    if "rebalanc" in lower: rebal = True
    if "concentrat" in lower: risks.append("Concentration risk identified")
    if "sector" in lower: risks.append("Sector exposure noted")
    return PortfolioAnalysis(risk_level=level, asset_allocation={"equities": 60.0, "fixed_income": 30.0, "cash": 10.0}, performance_summary="Portfolio analyzed", rebalancing_needed=rebal, concentration_risks=risks or ["No significant concentration risks"])

def parse_recommendations(analysis):
    recs = []
    lower = analysis.lower()
    if "diversif" in lower: recs.append("Increase portfolio diversification")
    if "rebalanc" in lower: recs.append("Consider portfolio rebalancing")
    if "risk" in lower: recs.append("Review risk exposure levels")
    return recs or ["Continue current investment strategy"]

async def run_investment_advisory(request: AdvisoryRequest) -> AdvisoryResponse:
    orchestrator = InvestmentAdvisoryOrchestrator()
    initial_state: InvestmentAdvisoryState = {
        "messages": [HumanMessage(content=f"Begin advisory for client: {request.client_id}")],
        "client_id": request.client_id, "advisory_type": request.advisory_type.value,
        "portfolio_analyst_result": None, "market_researcher_result": None, "client_profiler_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final = await orchestrator.arun(initial_state)
    all_analysis = "".join(final.get(k, {}).get("analysis", "") if final.get(k) else "" for k in ("portfolio_analyst_result", "market_researcher_result", "client_profiler_result"))
    return AdvisoryResponse(
        client_id=request.client_id, advisory_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        portfolio_analysis=parse_portfolio_analysis(all_analysis), recommendations=parse_recommendations(all_analysis),
        summary=final.get("final_summary", "Advisory completed"),
        raw_analysis={k: final.get(k) for k in ("portfolio_analyst_result", "market_researcher_result", "client_profiler_result")})
