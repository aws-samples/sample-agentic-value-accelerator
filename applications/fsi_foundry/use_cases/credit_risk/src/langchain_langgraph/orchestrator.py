"""Credit Risk Orchestrator."""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.credit_risk.agents import FinancialAnalyst, RiskScorer, PortfolioAnalyst
from use_cases.credit_risk.agents.financial_analyst import analyze_financials
from use_cases.credit_risk.agents.risk_scorer import score_risk
from use_cases.credit_risk.agents.portfolio_analyst import analyze_portfolio
from use_cases.credit_risk.models import (
    AssessmentRequest, AssessmentResponse, AssessmentType,
    CreditRiskScore, RiskLevel, CreditRating, PortfolioImpact,
)

from pydantic import BaseModel, Field

class CreditRiskSynthesisSchema(BaseModel):
    """Structured synthesis for credit risk assessment."""
    credit_score: int = Field(default=50, description="Credit risk score from 0 to 100")
    risk_level: str = Field(default="medium", description="Risk level: low, medium, high, or critical")
    credit_rating: str = Field(default="BB", description="Credit rating: AAA, AA, A, BBB, BB, B, CCC, CC, C, D")
    probability_of_default: str = Field(default="0.05", description="Probability of default as decimal string")
    risk_factors: list[str] = Field(default_factory=list, description="List of identified risk factors")
    portfolio_impact_assessment: str = Field(default="", description="Assessment of portfolio-level impact")
    recommendations: list[str] = Field(default_factory=list, description="List of risk mitigation recommendations")
    summary: str = Field(..., description="Executive summary of the credit risk assessment")



class CreditRiskState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_id: str
    assessment_type: str
    financial_analyst_result: dict | None
    risk_scorer_result: dict | None
    portfolio_analyst_result: dict | None
    final_summary: str | None


class CreditRiskOrchestrator(LangGraphOrchestrator):
    name = "credit_risk_orchestrator"
    state_schema = CreditRiskState
    system_prompt = """You are a Senior Credit Risk Officer for a financial institution.

Your role is to:
1. Coordinate specialist agents (Financial Analyst, Risk Scorer, Portfolio Analyst)
2. Synthesize their findings into a comprehensive credit risk assessment
3. Ensure lending decisions are well-informed and risk-appropriate

When creating the final summary, consider:
- Financial health indicators from statement analysis
- Credit risk scores, probability of default, and loss given default
- Portfolio impact including concentration risk and diversification
- Credit rating assignment with supporting rationale
- Recommended lending terms, conditions, or mitigants

Be precise and evidence-based. Your assessment will be used by credit committees."""

    def __init__(self):
        super().__init__(agents={
            "financial_analyst": FinancialAnalyst(),
            "risk_scorer": RiskScorer(),
            "portfolio_analyst": PortfolioAnalyst(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(CreditRiskState)
        workflow.add_node("parallel_assessment", self._parallel_node)
        workflow.add_node("financial_analyst", self._financial_node)
        workflow.add_node("risk_scorer", self._risk_node)
        workflow.add_node("portfolio_analyst", self._portfolio_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "financial_analyst": "financial_analyst",
            "risk_scorer": "risk_scorer",
            "portfolio_analyst": "portfolio_analyst",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        for node in ["financial_analyst", "risk_scorer", "portfolio_analyst"]:
            workflow.add_conditional_edges(node, self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "financial_analyst", "risk_scorer", "portfolio_analyst", "synthesize"]:
        at = state.get("assessment_type", "full")
        fa_done = state.get("financial_analyst_result") is not None
        rs_done = state.get("risk_scorer_result") is not None
        pa_done = state.get("portfolio_analyst_result") is not None

        if at == "financial_analysis": return "synthesize" if fa_done else "financial_analyst"
        if at == "risk_scoring": return "synthesize" if rs_done else "risk_scorer"
        if at == "portfolio_analysis": return "synthesize" if pa_done else "portfolio_analyst"
        if not fa_done and not rs_done and not pa_done: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        cid, ctx = state["customer_id"], self._extract_context(state)
        fa, rs, pa = await asyncio.gather(analyze_financials(cid, ctx), score_risk(cid, ctx), analyze_portfolio(cid, ctx))
        return {**state, "financial_analyst_result": fa, "risk_scorer_result": rs, "portfolio_analyst_result": pa,
                "messages": state["messages"] + [AIMessage(content=f"All assessments complete")]}

    async def _financial_node(self, state):
        r = await analyze_financials(state["customer_id"], self._extract_context(state))
        return {**state, "financial_analyst_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _risk_node(self, state):
        r = await score_risk(state["customer_id"], self._extract_context(state))
        return {**state, "risk_scorer_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _portfolio_node(self, state):
        r = await analyze_portfolio(state["customer_id"], self._extract_context(state))
        return {**state, "portfolio_analyst_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "assessment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(CreditRiskSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None



async def run_credit_risk(request):
    """Run the assessment workflow."""
    orchestrator = CreditRiskOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "assessment_type": request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
    }
    for key in [k for k in CreditRiskState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    credit_risk_score = None; portfolio_impact = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("credit_score") is not None:
            credit_risk_score = CreditRiskScore(score=structured.get("credit_score", 50),
                level=RiskLevel(structured.get("risk_level", "medium")),
                rating=CreditRating(structured.get("credit_rating", "BB")),
                probability_of_default=float(structured.get("probability_of_default", "0.05")),
                factors=structured.get("risk_factors", []),
                recommendations=structured.get("recommendations", []))
        if structured.get("portfolio_impact_assessment"):
            portfolio_impact = PortfolioImpact(assessment=structured.get("portfolio_impact_assessment", ""),
                concentration_risk=[], recommendations=structured.get("recommendations", []))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return AssessmentResponse(
        customer_id=request.customer_id, assessment_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), credit_risk=credit_risk_score, portfolio_impact=portfolio_impact,
        summary=summary,
        raw_analysis={"financial_analysis": final_state.get("financial_analyst_result"), "risk_scoring": final_state.get("risk_scorer_result"), "portfolio_analysis": final_state.get("portfolio_analyst_result")},
    )
