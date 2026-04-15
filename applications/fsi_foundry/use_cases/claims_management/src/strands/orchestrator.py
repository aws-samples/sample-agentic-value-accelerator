"""
Claims Management Orchestrator (Strands Implementation).

Orchestrates specialist agents (Claims Intake Agent, Damage Assessor, Settlement Recommender)
for comprehensive claims management in insurance.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import ClaimsIntakeAgent, DamageAssessor, SettlementRecommender
from .agents.claims_intake_agent import process_intake
from .agents.damage_assessor import assess_damage
from .agents.settlement_recommender import recommend_settlement
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ClaimRequest,
    ClaimResponse,
    AssessmentType,
    IntakeSummary,
    DamageAssessment as DamageAssessmentModel,
    SettlementRecommendation,
    ClaimType,
    ClaimStatus,
    Severity,
)


class ClaimsManagementOrchestrator(StrandsOrchestrator):
    """
    Claims Management Orchestrator using StrandsOrchestrator base class.

    Coordinates Claims Intake Agent, Damage Assessor, and Settlement Recommender
    for comprehensive claims processing.
    """

    name = "claims_management_orchestrator"

    system_prompt = """You are a Senior Claims Manager for an insurance company.

Your role is to:
1. Coordinate specialist agents (Claims Intake Agent, Damage Assessor, Settlement Recommender)
2. Synthesize their findings into a comprehensive claims resolution
3. Ensure claims are processed efficiently, fairly, and in compliance with policy terms

When creating the final summary, consider:
- Completeness and accuracy of the claims intake documentation
- Severity and cost estimates from the damage assessment
- Fairness and policy compliance of the settlement recommendation
- Any red flags or fraud indicators identified during processing
- Clear next steps for the claims adjuster
- Overall claim status and recommended actions

Be concise but thorough. Your summary will be used by claims adjusters and supervisors."""

    def __init__(self):
        super().__init__(
            agents={
                "claims_intake_agent": ClaimsIntakeAgent(),
                "damage_assessor": DamageAssessor(),
                "settlement_recommender": SettlementRecommender(),
            }
        )

    def run_assessment(self, claim_id: str, assessment_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        """Run the claims management workflow."""
        intake_result = None
        damage_result = None
        settlement_result = None

        input_text = self._build_input_text(claim_id, context)

        if assessment_type == "full":
            results = self.run_parallel(
                ["claims_intake_agent", "damage_assessor", "settlement_recommender"],
                input_text
            )
            intake_result = {"agent": "claims_intake_agent", "claim_id": claim_id, "analysis": results["claims_intake_agent"].output}
            damage_result = {"agent": "damage_assessor", "claim_id": claim_id, "analysis": results["damage_assessor"].output}
            settlement_result = {"agent": "settlement_recommender", "claim_id": claim_id, "analysis": results["settlement_recommender"].output}
        elif assessment_type == "claims_intake_only":
            result = self.run_agent("claims_intake_agent", input_text)
            intake_result = {"agent": "claims_intake_agent", "claim_id": claim_id, "analysis": result.output}
        elif assessment_type == "damage_assessment_only":
            result = self.run_agent("damage_assessor", input_text)
            damage_result = {"agent": "damage_assessor", "claim_id": claim_id, "analysis": result.output}
        elif assessment_type == "settlement_only":
            result = self.run_agent("settlement_recommender", input_text)
            settlement_result = {"agent": "settlement_recommender", "claim_id": claim_id, "analysis": result.output}

        synthesis_prompt = self._build_synthesis_prompt(intake_result, damage_result, settlement_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "claim_id": claim_id,
            "claims_intake_agent_result": intake_result,
            "damage_assessor_result": damage_result,
            "settlement_recommender_result": settlement_result,
            "final_summary": summary,
        }

    async def arun_assessment(self, claim_id: str, assessment_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        intake_result = None
        damage_result = None
        settlement_result = None

        if assessment_type == "full":
            intake_result, damage_result, settlement_result = await asyncio.gather(
                process_intake(claim_id, context),
                assess_damage(claim_id, context),
                recommend_settlement(claim_id, context),
            )
        elif assessment_type == "claims_intake_only":
            intake_result = await process_intake(claim_id, context)
        elif assessment_type == "damage_assessment_only":
            damage_result = await assess_damage(claim_id, context)
        elif assessment_type == "settlement_only":
            settlement_result = await recommend_settlement(claim_id, context)

        synthesis_prompt = self._build_synthesis_prompt(intake_result, damage_result, settlement_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "claim_id": claim_id,
            "claims_intake_agent_result": intake_result,
            "damage_assessor_result": damage_result,
            "settlement_recommender_result": settlement_result,
            "final_summary": summary,
        }

    def _build_input_text(self, claim_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for insurance claim: {claim_id}

Steps to follow:
1. Retrieve the claim's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant documentation using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, intake_result, damage_result, settlement_result) -> str:
        agent_results = {}
        if intake_result:
            agent_results["claims_intake"] = intake_result
        if damage_result:
            agent_results["damage_assessment"] = damage_result
        if settlement_result:
            agent_results["settlement_recommendation"] = settlement_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "claim_type": "auto|property|liability|health|life",
                "claim_status": "submitted|under_review|assessed|settled|denied|closed",
                "documentation_complete": "boolean",
                "missing_documents": ["list of missing document names"],
                "severity": "low|moderate|high|catastrophic",
                "estimated_repair_cost": "float",
                "estimated_replacement_cost": "float",
                "damage_findings": ["list of findings"],
                "recommended_amount": "float",
                "confidence_score": "float 0.0-1.0",
                "policy_coverage_applicable": "boolean",
                "justification": ["list of justification points"],
                "summary": "Executive summary with claim status, next steps, and red flags",
            },
            domain_context="You are a Senior Claims Manager synthesizing specialist assessments into a claims resolution.",
        )



async def run_claims_management(request: ClaimRequest) -> ClaimResponse:
    """Run the full claims management workflow (Strands implementation)."""
    orchestrator = ClaimsManagementOrchestrator()
    final_state = await orchestrator.arun_assessment(
        claim_id=request.claim_id,
        assessment_type=request.assessment_type.value,
        context=request.additional_context)

    intake_summary = None
    damage_assessment = None
    settlement_recommendation = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.assessment_type in [AssessmentType.FULL, AssessmentType.CLAIMS_INTAKE_ONLY]:
            if structured.get("claim_type"):
                try:
                    ct = ClaimType(structured["claim_type"])
                except ValueError:
                    ct = ClaimType.AUTO
                try:
                    cs = ClaimStatus(structured.get("claim_status", "submitted"))
                except ValueError:
                    cs = ClaimStatus.UNDER_REVIEW
                intake_summary = IntakeSummary(
                    claim_type=ct, status=cs,
                    documentation_complete=str(structured.get("documentation_complete", False)).lower(),
                    missing_documents=structured.get("missing_documents", []),
                    notes=structured.get("intake_notes", []))
        if request.assessment_type in [AssessmentType.FULL, AssessmentType.DAMAGE_ASSESSMENT_ONLY]:
            if structured.get("severity"):
                try:
                    sev = Severity(structured["severity"])
                except ValueError:
                    sev = Severity.MODERATE
                damage_assessment = DamageAssessmentModel(
                    severity=sev,
                    estimated_repair_cost=structured.get("estimated_repair_cost", 0.0),
                    estimated_replacement_cost=structured.get("estimated_replacement_cost", 0.0),
                    findings=structured.get("damage_findings", []))
        if request.assessment_type in [AssessmentType.FULL, AssessmentType.SETTLEMENT_ONLY]:
            if structured.get("recommended_amount") is not None:
                settlement_recommendation = SettlementRecommendation(
                    recommended_amount=structured.get("recommended_amount", 0.0),
                    confidence_score=structured.get("confidence_score", 0.0),
                    policy_coverage_applicable=structured.get("policy_coverage_applicable", True),
                    justification=structured.get("justification", []))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ClaimResponse(
        claim_id=request.claim_id, assessment_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        intake_summary=intake_summary, damage_assessment=damage_assessment,
        settlement_recommendation=settlement_recommendation, summary=summary,
        raw_analysis={
            "claims_intake": final_state.get("claims_intake_agent_result"),
            "damage_assessment": final_state.get("damage_assessor_result"),
            "settlement_recommendation": final_state.get("settlement_recommender_result")},
    )
