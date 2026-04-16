"""Credit Risk Orchestrator (Strands)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import FinancialAnalyst, RiskScorer, PortfolioAnalyst
from .agents.financial_analyst import analyze_financials
from .agents.risk_scorer import score_risk
from .agents.portfolio_analyst import analyze_portfolio
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    AssessmentRequest, AssessmentResponse, AssessmentType,
    CreditRiskScore, RiskLevel, CreditRating, PortfolioImpact,
)


class CreditRiskOrchestrator(StrandsOrchestrator):
    name = "credit_risk_orchestrator"
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

    def run_assessment(self, customer_id: str, assessment_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        financial = risk = portfolio = None
        input_text = self._build_input_text(customer_id, context)

        if assessment_type == "full":
            results = self.run_parallel(["financial_analyst", "risk_scorer", "portfolio_analyst"], input_text)
            financial = {"agent": "financial_analyst", "customer_id": customer_id, "analysis": results["financial_analyst"].output}
            risk = {"agent": "risk_scorer", "customer_id": customer_id, "scoring": results["risk_scorer"].output}
            portfolio = {"agent": "portfolio_analyst", "customer_id": customer_id, "portfolio": results["portfolio_analyst"].output}
        elif assessment_type == "financial_analysis":
            r = self.run_agent("financial_analyst", input_text)
            financial = {"agent": "financial_analyst", "customer_id": customer_id, "analysis": r.output}
        elif assessment_type == "risk_scoring":
            r = self.run_agent("risk_scorer", input_text)
            risk = {"agent": "risk_scorer", "customer_id": customer_id, "scoring": r.output}
        elif assessment_type == "portfolio_analysis":
            r = self.run_agent("portfolio_analyst", input_text)
            portfolio = {"agent": "portfolio_analyst", "customer_id": customer_id, "portfolio": r.output}

        summary = self.synthesize({}, self._build_synthesis_prompt(financial, risk, portfolio))
        return {"customer_id": customer_id, "financial_analysis": financial, "risk_scoring": risk, "portfolio_analysis": portfolio, "final_summary": summary}

    async def arun_assessment(self, customer_id: str, assessment_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        financial = risk = portfolio = None

        if assessment_type == "full":
            financial, risk, portfolio = await asyncio.gather(
                analyze_financials(customer_id, context), score_risk(customer_id, context), analyze_portfolio(customer_id, context))
        elif assessment_type == "financial_analysis":
            financial = await analyze_financials(customer_id, context)
        elif assessment_type == "risk_scoring":
            risk = await score_risk(customer_id, context)
        elif assessment_type == "portfolio_analysis":
            portfolio = await analyze_portfolio(customer_id, context)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(financial, risk, portfolio)))
        return {"customer_id": customer_id, "financial_analysis": financial, "risk_scoring": risk, "portfolio_analysis": portfolio, "final_summary": summary}

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        base = f"Perform comprehensive analysis for borrower: {customer_id}\n\nSteps:\n1. Retrieve the borrower's profile using s3_retriever_tool with data_type='profile'\n2. Analyze all retrieved data\n3. Provide complete assessment"
        return base + (f"\n\nAdditional Context: {context}" if context else "")

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



async def run_credit_risk(request):
    """Run the assessment workflow."""
    orchestrator = CreditRiskOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        assessment_type=request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
        context=getattr(request, 'additional_context', None))

    credit_risk_score = None; portfolio_impact = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
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
        raw_analysis={"financial_analysis": final_state.get("financial_analysis"), "risk_scoring": final_state.get("risk_scoring"), "portfolio_analysis": final_state.get("portfolio_analysis")},
    )
