"""
Life Insurance Agent Orchestrator (Strands Implementation).

Orchestrates specialist agents (Needs Analyst, Product Matcher, Underwriting Assistant)
for comprehensive life insurance advisory.
"""

import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import NeedsAnalyst, ProductMatcher, UnderwritingAssistant
from .agents.needs_analyst import analyze_needs
from .agents.product_matcher import match_products
from .agents.underwriting_assistant import assist_underwriting
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
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


class LifeInsuranceAgentOrchestrator(StrandsOrchestrator):
    """Life Insurance Agent Orchestrator using StrandsOrchestrator base class."""

    name = "life_insurance_agent_orchestrator"

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

    def run_assessment(
        self,
        applicant_id: str,
        analysis_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Run the life insurance assessment workflow."""
        needs_result = None
        product_result = None
        underwriting_result = None

        input_text = self._build_input_text(applicant_id, context)

        if analysis_type == "full":
            results = self.run_parallel(
                ["needs_analyst", "product_matcher", "underwriting_assistant"],
                input_text,
            )
            needs_result = {"agent": "needs_analyst", "applicant_id": applicant_id, "analysis": results["needs_analyst"].output}
            product_result = {"agent": "product_matcher", "applicant_id": applicant_id, "analysis": results["product_matcher"].output}
            underwriting_result = {"agent": "underwriting_assistant", "applicant_id": applicant_id, "analysis": results["underwriting_assistant"].output}
        elif analysis_type == "needs_analysis_only":
            result = self.run_agent("needs_analyst", input_text)
            needs_result = {"agent": "needs_analyst", "applicant_id": applicant_id, "analysis": result.output}
        elif analysis_type == "product_matching_only":
            result = self.run_agent("product_matcher", input_text)
            product_result = {"agent": "product_matcher", "applicant_id": applicant_id, "analysis": result.output}
        elif analysis_type == "underwriting_only":
            result = self.run_agent("underwriting_assistant", input_text)
            underwriting_result = {"agent": "underwriting_assistant", "applicant_id": applicant_id, "analysis": result.output}

        synthesis_prompt = self._build_synthesis_prompt(needs_result, product_result, underwriting_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "applicant_id": applicant_id,
            "needs_analysis": needs_result,
            "product_recommendations": product_result,
            "underwriting_assessment": underwriting_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        applicant_id: str,
        analysis_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        needs_result = None
        product_result = None
        underwriting_result = None

        if analysis_type == "full":
            needs_result, product_result, underwriting_result = await asyncio.gather(
                analyze_needs(applicant_id, context),
                match_products(applicant_id, context),
                assist_underwriting(applicant_id, context),
            )
        elif analysis_type == "needs_analysis_only":
            needs_result = await analyze_needs(applicant_id, context)
        elif analysis_type == "product_matching_only":
            product_result = await match_products(applicant_id, context)
        elif analysis_type == "underwriting_only":
            underwriting_result = await assist_underwriting(applicant_id, context)

        synthesis_prompt = self._build_synthesis_prompt(needs_result, product_result, underwriting_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt),
        )

        return {
            "applicant_id": applicant_id,
            "needs_analysis": needs_result,
            "product_recommendations": product_result,
            "underwriting_assessment": underwriting_result,
            "final_summary": summary,
        }

    def _build_input_text(self, applicant_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for life insurance applicant: {applicant_id}

Steps to follow:
1. Retrieve the applicant's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(self, needs_result, product_result, underwriting_result) -> str:
        agent_results = {}
        if needs_result:
            agent_results["needs_analysis"] = needs_result
        if product_result:
            agent_results["product_recommendations"] = product_result
        if underwriting_result:
            agent_results["underwriting_assessment"] = underwriting_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "needs_analysis": {"life_stage": "young_adult|early_career|family_building|mid_career|pre_retirement|retirement", "recommended_coverage": "float", "coverage_gap": "float", "income_replacement_years": "int", "key_needs": ["list"], "notes": ["list"]},
                "product_recommendations": {"primary_product": "term|whole_life|universal|variable|indexed_universal", "recommended_products": ["list of dicts"], "coverage_amount": "float", "estimated_premium": "float", "comparison_notes": ["list"], "notes": ["list"]},
                "underwriting_assessment": {"risk_category": "preferred_plus|preferred|standard_plus|standard|substandard", "confidence_score": "float 0-1", "health_factors": ["list"], "lifestyle_factors": ["list"], "recommended_actions": ["list"], "notes": ["list"]},
                "summary": "Executive summary with overall advisory recommendation",
            },
            domain_context="You are a Senior Life Insurance Advisory Supervisor.",
        )


async def run_life_insurance_agent(request: InsuranceRequest) -> InsuranceResponse:
    """Run the full life insurance agent workflow (Strands implementation)."""
    orchestrator = LifeInsuranceAgentOrchestrator()
    final_state = await orchestrator.arun_assessment(
        applicant_id=request.applicant_id,
        analysis_type=request.analysis_type.value,
        context=request.additional_context,
    )

    needs_analysis, product_recommendations, underwriting_assessment = None, None, None
    summary = "Assessment completed"

    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.NEEDS_ANALYSIS_ONLY]:
            if structured.get("needs_analysis"):
                needs_analysis = NeedsAnalysis(**structured["needs_analysis"])

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.PRODUCT_MATCHING_ONLY]:
            if structured.get("product_recommendations"):
                product_recommendations = ProductRecommendations(**structured["product_recommendations"])

        if request.analysis_type in [AnalysisType.FULL, AnalysisType.UNDERWRITING_ONLY]:
            if structured.get("underwriting_assessment"):
                underwriting_assessment = UnderwritingAssessment(**structured["underwriting_assessment"])
    except (ValueError, Exception):
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
            "needs_analysis": final_state.get("needs_analysis"),
            "product_recommendations": final_state.get("product_recommendations"),
            "underwriting_assessment": final_state.get("underwriting_assessment"),
        },
    )
