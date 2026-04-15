"""Investment Advisory Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import PortfolioAnalyst, MarketResearcher, ClientProfiler
from .agents.portfolio_analyst import analyze_portfolio
from .agents.market_researcher import research_market
from .agents.client_profiler import profile_client
from .models import AdvisoryRequest, AdvisoryResponse, AdvisoryType, PortfolioAnalysis, RiskLevel

class InvestmentAdvisoryOrchestrator(StrandsOrchestrator):
    name = "investment_advisory_orchestrator"
    system_prompt = """You are a Senior Investment Advisory Supervisor.
Your role is to:
1. Coordinate specialist agents (Portfolio Analyst, Market Researcher, Client Profiler)
2. Synthesize their findings into comprehensive investment recommendations
3. Ensure recommendations are suitable for the client's risk profile and goals
Be precise and compliant with fiduciary standards."""

    def __init__(self):
        super().__init__(agents={"portfolio_analyst": PortfolioAnalyst(), "market_researcher": MarketResearcher(), "client_profiler": ClientProfiler()})

    def run_assessment(self, client_id, advisory_type="full", context=None):
        pa_r = mr_r = cp_r = None
        input_text = self._build_input_text(client_id, context)
        if advisory_type == "full":
            results = self.run_parallel(["portfolio_analyst", "market_researcher", "client_profiler"], input_text)
            pa_r = {"agent": "portfolio_analyst", "customer_id": client_id, "analysis": results["portfolio_analyst"].output}
            mr_r = {"agent": "market_researcher", "customer_id": client_id, "analysis": results["market_researcher"].output}
            cp_r = {"agent": "client_profiler", "customer_id": client_id, "analysis": results["client_profiler"].output}
        elif advisory_type == "portfolio_review":
            r = self.run_agent("portfolio_analyst", input_text)
            pa_r = {"agent": "portfolio_analyst", "customer_id": client_id, "analysis": r.output}
        elif advisory_type == "market_analysis":
            r = self.run_agent("market_researcher", input_text)
            mr_r = {"agent": "market_researcher", "customer_id": client_id, "analysis": r.output}
        elif advisory_type == "client_profiling":
            r = self.run_agent("client_profiler", input_text)
            cp_r = {"agent": "client_profiler", "customer_id": client_id, "analysis": r.output}
        else:
            results = self.run_parallel(["portfolio_analyst", "client_profiler"], input_text)
            pa_r = {"agent": "portfolio_analyst", "customer_id": client_id, "analysis": results["portfolio_analyst"].output}
            cp_r = {"agent": "client_profiler", "customer_id": client_id, "analysis": results["client_profiler"].output}
        summary = self.synthesize({}, self._build_synthesis_prompt(pa_r, mr_r, cp_r))
        return {"customer_id": client_id, "portfolio_result": pa_r, "market_result": mr_r, "client_result": cp_r, "final_summary": summary}

    async def arun_assessment(self, client_id, advisory_type="full", context=None):
        import asyncio
        pa_r = mr_r = cp_r = None
        if advisory_type == "full":
            pa_r, mr_r, cp_r = await asyncio.gather(analyze_portfolio(client_id, context), research_market(client_id, context), profile_client(client_id, context))
        elif advisory_type == "portfolio_review":
            pa_r = await analyze_portfolio(client_id, context)
        elif advisory_type == "market_analysis":
            mr_r = await research_market(client_id, context)
        elif advisory_type == "client_profiling":
            cp_r = await profile_client(client_id, context)
        else:
            pa_r, cp_r = await asyncio.gather(analyze_portfolio(client_id, context), profile_client(client_id, context))
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(pa_r, mr_r, cp_r)))
        return {"customer_id": client_id, "portfolio_result": pa_r, "market_result": mr_r, "client_result": cp_r, "final_summary": summary}

    def _build_input_text(self, client_id, context=None):
        base = f"Perform investment analysis for client: {client_id}\nSteps: 1. Retrieve client profile using s3_retriever_tool with data_type='profile' 2. Analyze and provide assessment"
        return base + (f"\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, pa_r, mr_r, cp_r):
        sections = []
        if pa_r: sections.append(f"## Portfolio Analysis\n{json.dumps(pa_r, indent=2)}")
        if mr_r: sections.append(f"## Market Research\n{json.dumps(mr_r, indent=2)}")
        if cp_r: sections.append(f"## Client Profile\n{json.dumps(cp_r, indent=2)}")
        return f"Based on the following findings, provide investment advisory:\n\n{chr(10).join(sections)}\n\nProvide: 1. Portfolio risk assessment 2. Market-informed recommendations 3. Client-suitable strategies 4. Rebalancing needs"

def parse_portfolio_analysis(analysis):
    level, alloc, rebal, risks = RiskLevel.MODERATE, {}, False, []
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
    state = await orchestrator.arun_assessment(client_id=request.client_id, advisory_type=request.advisory_type.value, context=request.additional_context)
    all_analysis = "".join(state.get(k, {}).get("analysis", "") if state.get(k) else "" for k in ("portfolio_result", "market_result", "client_result"))
    return AdvisoryResponse(
        client_id=request.client_id, advisory_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        portfolio_analysis=parse_portfolio_analysis(all_analysis), recommendations=parse_recommendations(all_analysis),
        summary=state.get("final_summary", "Advisory completed"),
        raw_analysis={k: state.get(k) for k in ("portfolio_result", "market_result", "client_result")})
