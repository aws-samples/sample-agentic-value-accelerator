"""
Investment Management Orchestrator.

Orchestrates specialist agents (Allocation Optimizer, Rebalancing Agent, Performance Attributor)
for comprehensive investment management assessment.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.investment_management.agents import AllocationOptimizer, RebalancingAgent, PerformanceAttributor
from use_cases.investment_management.agents.allocation_optimizer import optimize_allocation
from use_cases.investment_management.agents.rebalancing_agent import analyze_rebalancing
from use_cases.investment_management.agents.performance_attributor import attribute_performance
from use_cases.investment_management.models import (
    ManagementRequest,
    ManagementResponse,
    AssessmentType,
    PortfolioAnalysisDetail,
    RiskProfile,
    RebalanceUrgency,
)

from pydantic import BaseModel, Field


class InvestmentManagementSynthesisSchema(BaseModel):
    """Structured synthesis output schema for investment management."""
    risk_profile: str = Field(default="moderate", description="Portfolio risk profile: conservative, moderate, aggressive, or ultra_aggressive")
    rebalance_urgency: str = Field(default="low", description="Rebalancing urgency: low, medium, high, or critical")
    drift_pct: float = Field(default=0.0, description="Portfolio drift percentage from target")
    allocation_score: float = Field(default=0.5, description="Allocation optimality score 0-1")
    attribution_factors: list[str] = Field(default_factory=list, description="Key performance attribution factors")
    trade_recommendations: list[str] = Field(default_factory=list, description="Recommended trades for rebalancing")
    recommendations: list[str] = Field(default_factory=list, description="Investment recommendations")
    summary: str = Field(..., description="Executive summary of the investment management assessment")


class InvestmentManagementState(TypedDict):
    """State managed by the investment management orchestrator graph."""
    messages: Annotated[list, add_messages]
    entity_id: str
    assessment_type: str
    allocation_optimizer_result: dict | None
    rebalancing_agent_result: dict | None
    performance_attributor_result: dict | None
    final_summary: str | None


class InvestmentManagementOrchestrator(LangGraphOrchestrator):
    """
    Investment Management Orchestrator using LangGraphOrchestrator base class.

    Coordinates Allocation Optimizer, Rebalancing Agent, and Performance Attributor
    for comprehensive investment management assessment.
    """

    name = "investment_management_orchestrator"
    state_schema = InvestmentManagementState

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

    def build_graph(self) -> StateGraph:
        """Build the investment management workflow graph."""
        workflow = StateGraph(InvestmentManagementState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("allocation_optimizer", self._allocation_optimizer_node)
        workflow.add_node("rebalancing_agent", self._rebalancing_agent_node)
        workflow.add_node("performance_attributor", self._performance_attributor_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "allocation_optimizer": "allocation_optimizer",
                "rebalancing_agent": "rebalancing_agent",
                "performance_attributor": "performance_attributor",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "allocation_optimizer",
            self._router,
            {"synthesize": "synthesize", "rebalancing_agent": "rebalancing_agent"},
        )
        workflow.add_conditional_edges(
            "rebalancing_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "performance_attributor",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: InvestmentManagementState) -> Literal["parallel_assessment", "allocation_optimizer", "rebalancing_agent", "performance_attributor", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        alloc_done = state.get("allocation_optimizer_result") is not None
        rebal_done = state.get("rebalancing_agent_result") is not None
        attrib_done = state.get("performance_attributor_result") is not None

        if assessment_type == "allocation_optimization":
            return "synthesize" if alloc_done else "allocation_optimizer"

        if assessment_type == "rebalancing":
            return "synthesize" if alloc_done and rebal_done else ("rebalancing_agent" if alloc_done else "allocation_optimizer")

        if assessment_type == "performance_attribution":
            return "synthesize" if attrib_done else "performance_attributor"

        # Full assessment
        if not alloc_done and not rebal_done and not attrib_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: InvestmentManagementState) -> InvestmentManagementState:
        """Execute all assessments in parallel."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)

        alloc_result, rebal_result, attrib_result = await self._run_assessments_parallel(entity_id, context)

        return {
            **state,
            "allocation_optimizer_result": alloc_result,
            "rebalancing_agent_result": rebal_result,
            "performance_attributor_result": attrib_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Allocation Optimization Complete: {json.dumps(alloc_result, indent=2)}"),
                AIMessage(content=f"Rebalancing Analysis Complete: {json.dumps(rebal_result, indent=2)}"),
                AIMessage(content=f"Performance Attribution Complete: {json.dumps(attrib_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, entity_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            optimize_allocation(entity_id, context),
            analyze_rebalancing(entity_id, context),
            attribute_performance(entity_id, context),
        )

    async def _allocation_optimizer_node(self, state: InvestmentManagementState) -> InvestmentManagementState:
        """Execute allocation optimization."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await optimize_allocation(entity_id, context)

        return {
            **state,
            "allocation_optimizer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Allocation Optimization Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _rebalancing_agent_node(self, state: InvestmentManagementState) -> InvestmentManagementState:
        """Execute rebalancing analysis."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await analyze_rebalancing(entity_id, context)

        return {
            **state,
            "rebalancing_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Rebalancing Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _performance_attributor_node(self, state: InvestmentManagementState) -> InvestmentManagementState:
        """Execute performance attribution."""
        entity_id = state["entity_id"]
        context = self._extract_context(state)
        result = await attribute_performance(entity_id, context)

        return {
            **state,
            "performance_attributor_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Performance Attribution Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "entity_id", "assessment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured investment management response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(InvestmentManagementSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final Assessment: {json.dumps(structured)}")],}

    def _extract_context(self, state: InvestmentManagementState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_investment_management(request: ManagementRequest) -> ManagementResponse:
    """Run the full investment management assessment workflow."""
    orchestrator = InvestmentManagementOrchestrator()
    initial_state: InvestmentManagementState = {
        "messages": [HumanMessage(content=f"Begin investment management assessment for portfolio: {request.entity_id}")],
        "entity_id": request.entity_id,
        "assessment_type": request.assessment_type.value,
        "allocation_optimizer_result": None,
        "rebalancing_agent_result": None,
        "performance_attributor_result": None,
        "final_summary": None,
    }
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    portfolio_analysis = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", [])

        if structured.get("risk_profile"):
            portfolio_analysis = PortfolioAnalysisDetail(
                risk_profile=RiskProfile(structured.get("risk_profile", "moderate")),
                rebalance_urgency=RebalanceUrgency(structured.get("rebalance_urgency", "low")),
                drift_pct=structured.get("drift_pct", 0.0),
                allocation_score=structured.get("allocation_score", 0.5),
                attribution_factors=structured.get("attribution_factors", []),
                trade_recommendations=structured.get("trade_recommendations", []),
            )
    except Exception:
        summary = str(final_state.get("final_summary", summary))

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
