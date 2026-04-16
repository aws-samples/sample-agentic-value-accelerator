"""
Investment Management Orchestrator (Strands Implementation).

Orchestrates specialist agents (Allocation Optimizer, Rebalancing Agent, Performance Attributor)
for comprehensive investment management assessment.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import AllocationOptimizer, RebalancingAgent, PerformanceAttributor
from .agents.allocation_optimizer import optimize_allocation
from .agents.rebalancing_agent import analyze_rebalancing
from .agents.performance_attributor import attribute_performance
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ManagementRequest,
    ManagementResponse,
    AssessmentType,
    PortfolioAnalysisDetail,
    RiskProfile,
    RebalanceUrgency,
)


class InvestmentManagementOrchestrator(StrandsOrchestrator):
    """
    Investment Management Orchestrator using StrandsOrchestrator base class.

    Coordinates Allocation Optimizer, Rebalancing Agent, and Performance Attributor
    for comprehensive investment management assessment.
    """

    name = "investment_management_orchestrator"

    system_prompt = """You are a Senior Portfolio Manager and Investment Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Allocation Optimizer, Rebalancing Agent, Performance Attributor)
2. Synthesize their findings into a comprehensive investment management assessment
3. Ensure portfolio decisions are well-founded, risk-aware, and actionable

When creating the final summary, consider:
- Allocation optimality and recommended adjustments with risk-return impact
- Rebalancing urgency, drift magnitude, and proposed trade list efficiency
- Performance attribution insights including key drivers and detractors
- Overall portfolio health and alignment with investment objectives
- Actionable next steps for portfolio managers

Be concise but thorough. Your summary will be used by portfolio managers and investment committees for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "allocation_optimizer": AllocationOptimizer(),
                "rebalancing_agent": RebalancingAgent(),
                "performance_attributor": PerformanceAttributor(),
            }
        )

    def run_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run the investment management assessment workflow."""
        alloc_result = None
        rebal_result = None
        attrib_result = None

        input_text = self._build_input_text(entity_id, context)

        if assessment_type == "full":
            results = self.run_parallel(
                ["allocation_optimizer", "rebalancing_agent", "performance_attributor"],
                input_text
            )
            alloc_result = {
                "agent": "allocation_optimizer",
                "entity_id": entity_id,
                "analysis": results["allocation_optimizer"].output,
            }
            rebal_result = {
                "agent": "rebalancing_agent",
                "entity_id": entity_id,
                "analysis": results["rebalancing_agent"].output,
            }
            attrib_result = {
                "agent": "performance_attributor",
                "entity_id": entity_id,
                "analysis": results["performance_attributor"].output,
            }
        elif assessment_type == "allocation_optimization":
            result = self.run_agent("allocation_optimizer", input_text)
            alloc_result = {
                "agent": "allocation_optimizer",
                "entity_id": entity_id,
                "analysis": result.output,
            }
        elif assessment_type == "rebalancing":
            alloc_r = self.run_agent("allocation_optimizer", input_text)
            alloc_result = {
                "agent": "allocation_optimizer",
                "entity_id": entity_id,
                "analysis": alloc_r.output,
            }
            rebal_r = self.run_agent("rebalancing_agent", input_text)
            rebal_result = {
                "agent": "rebalancing_agent",
                "entity_id": entity_id,
                "analysis": rebal_r.output,
            }
        elif assessment_type == "performance_attribution":
            result = self.run_agent("performance_attributor", input_text)
            attrib_result = {
                "agent": "performance_attributor",
                "entity_id": entity_id,
                "analysis": result.output,
            }

        synthesis_prompt = self._build_synthesis_prompt(alloc_result, rebal_result, attrib_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "entity_id": entity_id,
            "allocation_optimizer_result": alloc_result,
            "rebalancing_agent_result": rebal_result,
            "performance_attributor_result": attrib_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        alloc_result = None
        rebal_result = None
        attrib_result = None

        if assessment_type == "full":
            alloc_result, rebal_result, attrib_result = await asyncio.gather(
                optimize_allocation(entity_id, context),
                analyze_rebalancing(entity_id, context),
                attribute_performance(entity_id, context),
            )
        elif assessment_type == "allocation_optimization":
            alloc_result = await optimize_allocation(entity_id, context)
        elif assessment_type == "rebalancing":
            alloc_result, rebal_result = await asyncio.gather(
                optimize_allocation(entity_id, context),
                analyze_rebalancing(entity_id, context),
            )
        elif assessment_type == "performance_attribution":
            attrib_result = await attribute_performance(entity_id, context)

        synthesis_prompt = self._build_synthesis_prompt(alloc_result, rebal_result, attrib_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "entity_id": entity_id,
            "allocation_optimizer_result": alloc_result,
            "rebalancing_agent_result": rebal_result,
            "performance_attributor_result": attrib_result,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(self, alloc_result, rebal_result, attrib_result) -> str:
        """Build structured synthesis prompt from agent results."""
        agent_results = {}
        if alloc_result:
            agent_results["allocation_optimization"] = alloc_result
        if rebal_result:
            agent_results["rebalancing_analysis"] = rebal_result
        if attrib_result:
            agent_results["performance_attribution"] = attrib_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "portfolio_analysis": {
                    "risk_profile": "conservative|moderate|aggressive|ultra_aggressive",
                    "rebalance_urgency": "low|medium|high|critical",
                    "drift_pct": "float",
                    "allocation_score": "float 0-1",
                    "attribution_factors": ["list"],
                    "trade_recommendations": ["list"],
                },
                "recommendations": ["list of investment recommendations"],
                "summary": "Executive summary with portfolio health assessment and actionable next steps",
            },
            domain_context="You are a Senior Portfolio Manager and Investment Supervisor for a capital markets institution.")


async def run_investment_management(request: ManagementRequest) -> ManagementResponse:
    """Run the full investment management assessment workflow (Strands implementation)."""
    orchestrator = InvestmentManagementOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        assessment_type=request.assessment_type.value,
        context=request.additional_context)

    portfolio_analysis = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", [])

        pa = structured.get("portfolio_analysis", {})
        if pa:
            portfolio_analysis = PortfolioAnalysisDetail(
                risk_profile=RiskProfile(pa.get("risk_profile", "moderate")),
                rebalance_urgency=RebalanceUrgency(pa.get("rebalance_urgency", "low")),
                drift_pct=pa.get("drift_pct", 0.0),
                allocation_score=pa.get("allocation_score", 0.5),
                attribution_factors=pa.get("attribution_factors", []),
                trade_recommendations=pa.get("trade_recommendations", []),
            )
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return ManagementResponse(
        entity_id=request.entity_id,
        management_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        portfolio_analysis=portfolio_analysis,
        recommendations=recommendations,
        summary=summary,
        raw_analysis={
            "allocation_optimizer": final_state.get("allocation_optimizer_result"),
            "rebalancing_agent": final_state.get("rebalancing_agent_result"),
            "performance_attributor": final_state.get("performance_attributor_result"),
        },
    )
