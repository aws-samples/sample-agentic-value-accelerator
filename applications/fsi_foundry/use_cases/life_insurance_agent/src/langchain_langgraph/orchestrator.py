"""
Life Insurance Agent Orchestrator (LangGraph Implementation).

Orchestrates specialist agents (Needs Analyst, Product Matcher, Underwriting Assistant)
for comprehensive life insurance advisory.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.life_insurance_agent.agents import NeedsAnalyst, ProductMatcher, UnderwritingAssistant
from use_cases.life_insurance_agent.agents.needs_analyst import analyze_needs
from use_cases.life_insurance_agent.agents.product_matcher import match_products
from use_cases.life_insurance_agent.agents.underwriting_assistant import assist_underwriting
from use_cases.life_insurance_agent.models import (
    AnalysisType,
    InsuranceRequest,
    InsuranceResponse,
    NeedsAnalysis,
    ProductRecommendations,
    UnderwritingAssessment,
    LifeStage,
    RiskCategory,
    ProductType,
)

from pydantic import BaseModel, Field


class LifeInsuranceSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis."""
    needs_life_stage: str = Field(default="family_building", description="Life stage: young_adult, early_career, family_building, mid_career, pre_retirement, retirement")
    needs_recommended_coverage: float = Field(default=0.0, description="Recommended total coverage amount")
    needs_coverage_gap: float = Field(default=0.0, description="Gap between existing and recommended coverage")
    needs_income_replacement_years: int = Field(default=10, description="Years of income replacement needed")
    needs_key_needs: list[str] = Field(default_factory=list, description="Identified insurance needs")
    needs_notes: list[str] = Field(default_factory=list, description="Needs analysis notes")
    product_primary_product: str = Field(default="term", description="Primary product type: term, whole_life, universal, variable, indexed_universal")
    product_recommended_products: list[str] = Field(default_factory=list, description="Ranked product recommendations")
    product_coverage_amount: float = Field(default=0.0, description="Recommended coverage amount")
    product_estimated_premium: float = Field(default=0.0, description="Estimated monthly premium")
    product_comparison_notes: list[str] = Field(default_factory=list, description="Product comparison notes")
    product_notes: list[str] = Field(default_factory=list, description="Product recommendation notes")
    underwriting_risk_category: str = Field(default="standard", description="Risk category: preferred_plus, preferred, standard_plus, standard, substandard")
    underwriting_confidence_score: float = Field(default=0.0, description="Confidence score 0.0 to 1.0")
    underwriting_health_factors: list[str] = Field(default_factory=list, description="Health risk factors")
    underwriting_lifestyle_factors: list[str] = Field(default_factory=list, description="Lifestyle risk factors")
    underwriting_recommended_actions: list[str] = Field(default_factory=list, description="Recommended next steps")
    underwriting_notes: list[str] = Field(default_factory=list, description="Underwriting assessment notes")
    summary: str = Field(..., description="Executive summary with overall life insurance advisory recommendation")


class LifeInsuranceAgentState(TypedDict):
    """State managed by the life insurance agent orchestrator graph."""
    messages: Annotated[list, add_messages]
    applicant_id: str
    analysis_type: str
    needs_analyst_result: dict | None
    product_matcher_result: dict | None
    underwriting_assistant_result: dict | None
    final_summary: str | None


class LifeInsuranceAgentOrchestrator(LangGraphOrchestrator):
    """Life Insurance Agent Orchestrator using LangGraphOrchestrator base class."""

    name = "life_insurance_agent_orchestrator"
    state_schema = LifeInsuranceAgentState

    system_prompt = """You are a Senior Life Insurance Advisory Supervisor.

Your role is to:
1. Coordinate specialist agents (Needs Analyst, Product Matcher, Underwriting Assistant)
2. Synthesize their findings into a comprehensive life insurance advisory report
3. Ensure applicants receive accurate, personalized insurance guidance

When creating the final summary, consider:
- Completeness of the needs analysis and coverage gap assessment
- Appropriateness of product recommendations for the applicant's life stage and budget
- Underwriting risk factors and their impact on eligibility and premium rates
- Clear next steps for the insurance agent and applicant
- Any additional information or medical exams needed
- Overall suitability of the recommended insurance solution

Be concise but thorough. Your summary will be used by life insurance agents serving their customers."""

    def __init__(self):
        super().__init__(
            agents={
                "needs_analyst": NeedsAnalyst(),
                "product_matcher": ProductMatcher(),
                "underwriting_assistant": UnderwritingAssistant(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the life insurance assessment workflow graph."""
        workflow = StateGraph(LifeInsuranceAgentState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("needs_analyst", self._needs_analyst_node)
        workflow.add_node("product_matcher", self._product_matcher_node)
        workflow.add_node("underwriting_assistant", self._underwriting_assistant_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "needs_analyst": "needs_analyst",
                "product_matcher": "product_matcher",
                "underwriting_assistant": "underwriting_assistant",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "needs_analyst",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "product_matcher",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "underwriting_assistant",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: LifeInsuranceAgentState) -> Literal["parallel_assessment", "needs_analyst", "product_matcher", "underwriting_assistant", "synthesize"]:
        """Route to the next node based on current state."""
        analysis_type = state.get("analysis_type", "full")
        needs_done = state.get("needs_analyst_result") is not None
        product_done = state.get("product_matcher_result") is not None
        underwriting_done = state.get("underwriting_assistant_result") is not None

        if analysis_type == "needs_analysis_only":
            return "synthesize" if needs_done else "needs_analyst"
        if analysis_type == "product_matching_only":
            return "synthesize" if product_done else "product_matcher"
        if analysis_type == "underwriting_only":
            return "synthesize" if underwriting_done else "underwriting_assistant"

        # Full assessment
        if not needs_done and not product_done and not underwriting_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: LifeInsuranceAgentState) -> LifeInsuranceAgentState:
        """Execute all assessments in parallel."""
        applicant_id = state["applicant_id"]
        context = self._extract_context(state)


        needs_result, product_result, underwriting_result = await self._run_assessments_parallel(applicant_id, context)

        return {
            **state,
            "needs_analyst_result": needs_result,
            "product_matcher_result": product_result,
            "underwriting_assistant_result": underwriting_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Needs Analysis Complete: {json.dumps(needs_result, indent=2)}"),
                AIMessage(content=f"Product Matching Complete: {json.dumps(product_result, indent=2)}"),
                AIMessage(content=f"Underwriting Assessment Complete: {json.dumps(underwriting_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, applicant_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            analyze_needs(applicant_id, context),
            match_products(applicant_id, context),
            assist_underwriting(applicant_id, context),
        )

    async def _needs_analyst_node(self, state: LifeInsuranceAgentState) -> LifeInsuranceAgentState:
        """Execute needs analysis."""
        applicant_id = state["applicant_id"]
        context = self._extract_context(state)
        result = await analyze_needs(applicant_id, context)

        return {
            **state,
            "needs_analyst_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Needs Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _product_matcher_node(self, state: LifeInsuranceAgentState) -> LifeInsuranceAgentState:
        """Execute product matching."""
        applicant_id = state["applicant_id"]
        context = self._extract_context(state)
        result = await match_products(applicant_id, context)

        return {
            **state,
            "product_matcher_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Product Matching Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _underwriting_assistant_node(self, state: LifeInsuranceAgentState) -> LifeInsuranceAgentState:
        """Execute underwriting assessment."""
        applicant_id = state["applicant_id"]
        context = self._extract_context(state)
        result = await assist_underwriting(applicant_id, context)

        return {
            **state,
            "underwriting_assistant_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Underwriting Assessment Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state: LifeInsuranceAgentState) -> LifeInsuranceAgentState:
        """Synthesize findings into structured assessment using with_structured_output."""
        needs_result = state.get("needs_analyst_result")
        product_result = state.get("product_matcher_result")
        underwriting_result = state.get("underwriting_assistant_result")

        sections = []
        if needs_result:
            sections.append(f"## Needs Analysis\n{json.dumps(needs_result, indent=2)}")
        if product_result:
            sections.append(f"## Product Recommendations\n{json.dumps(product_result, indent=2)}")
        if underwriting_result:
            sections.append(f"## Underwriting Assessment\n{json.dumps(underwriting_result, indent=2)}")

        synthesis_prompt = f"""You are a Senior Life Insurance Advisory Supervisor. Based on the following specialist assessments, produce a structured life insurance advisory report.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, scores, and details — not generic defaults."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(LifeInsuranceSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize(
                {"needs": needs_result, "products": product_result, "underwriting": underwriting_result},
                synthesis_prompt,
            )
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Assessment: {json.dumps(structured)}")],
        }

    def _extract_context(self, state: LifeInsuranceAgentState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_life_insurance_agent(request: InsuranceRequest) -> InsuranceResponse:
    """Run the full life insurance agent workflow."""
    orchestrator = LifeInsuranceAgentOrchestrator()
    initial_state: LifeInsuranceAgentState = {
        "messages": [HumanMessage(content=f"Begin life insurance assessment for applicant: {request.applicant_id}")],
        "applicant_id": request.applicant_id,
        "analysis_type": request.analysis_type.value,
        "needs_analyst_result": None,
        "product_matcher_result": None,
        "underwriting_assistant_result": None,
        "final_summary": None,
    }
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    needs_analysis, product_recommendations, underwriting_assessment = None, None, None
    summary = "Assessment completed"

    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.NEEDS_ANALYSIS_ONLY]:
            if structured.get("needs_life_stage"):
                needs_analysis = NeedsAnalysis(
                    life_stage=LifeStage(structured["needs_life_stage"]),
                    recommended_coverage=structured.get("needs_recommended_coverage", 0.0),
                    coverage_gap=structured.get("needs_coverage_gap", 0.0),
                    income_replacement_years=structured.get("needs_income_replacement_years", 10),
                    key_needs=structured.get("needs_key_needs", []),
                    notes=structured.get("needs_notes", []),
                )

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.PRODUCT_MATCHING_ONLY]:
            if structured.get("product_primary_product"):
                product_recommendations = ProductRecommendations(
                    primary_product=ProductType(structured["product_primary_product"]),
                    recommended_products=[{"name": p} for p in structured.get("product_recommended_products", [])],
                    coverage_amount=structured.get("product_coverage_amount", 0.0),
                    estimated_premium=structured.get("product_estimated_premium", 0.0),
                    comparison_notes=structured.get("product_comparison_notes", []),
                    notes=structured.get("product_notes", []),
                )

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.UNDERWRITING_ONLY]:
            if structured.get("underwriting_risk_category"):
                underwriting_assessment = UnderwritingAssessment(
                    risk_category=RiskCategory(structured["underwriting_risk_category"]),
                    confidence_score=structured.get("underwriting_confidence_score", 0.0),
                    health_factors=structured.get("underwriting_health_factors", []),
                    lifestyle_factors=structured.get("underwriting_lifestyle_factors", []),
                    recommended_actions=structured.get("underwriting_recommended_actions", []),
                    notes=structured.get("underwriting_notes", []),
                )
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    return InsuranceResponse(
        applicant_id=request.applicant_id,
        assessment_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        needs_analysis=needs_analysis,
        product_recommendations=product_recommendations,
        underwriting_assessment=underwriting_assessment,
        summary=summary,
        raw_analysis={
            "needs_analysis": final_state.get("needs_analyst_result"),
            "product_recommendations": final_state.get("product_matcher_result"),
            "underwriting_assessment": final_state.get("underwriting_assistant_result"),
        },
    )
