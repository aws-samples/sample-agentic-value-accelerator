"""
KYC Assessment Orchestrator (Strands Implementation).

Orchestrates specialist agents (Credit Analyst, Compliance Officer)
for comprehensive KYC risk assessment in corporate banking.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor

from base.strands import StrandsOrchestrator
from .agents import CreditAnalyst, ComplianceOfficer
from .agents.credit_analyst import analyze_credit_risk
from .agents.compliance_officer import check_compliance
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    AssessmentRequest,
    AssessmentResponse,
    AssessmentType,
    RiskScore,
    RiskLevel,
    ComplianceStatus,
    ComplianceStatusEnum,
)


class KYCOrchestrator(StrandsOrchestrator):
    """
    KYC Assessment Orchestrator using StrandsOrchestrator base class.
    
    Coordinates Credit Analyst and Compliance Officer agents for
    comprehensive KYC risk assessment.
    """
    
    name = "kyc_orchestrator"
    
    system_prompt = """You are a Senior Risk Assessment Supervisor for corporate banking KYC onboarding.

Your role is to:
1. Coordinate the work of specialist agents (Credit Analyst, Compliance Officer)
2. Synthesize their findings into a comprehensive risk assessment
3. Make final recommendations for the onboarding decision

When creating the final summary, consider:
- Overall risk profile combining credit and compliance assessments
- Any conflicts or discrepancies between specialist reports
- Clear recommendation: APPROVE / REJECT / ESCALATE FOR REVIEW
- Key conditions or requirements for approval if applicable

Be concise but thorough. Your summary will be used by decision-makers."""

    def __init__(self):
        super().__init__(
            agents={
                "credit_analyst": CreditAnalyst(),
                "compliance_officer": ComplianceOfficer(),
            }
        )
    
    def run_assessment(
        self,
        customer_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the KYC assessment workflow.
        
        Args:
            customer_id: Customer identifier
            assessment_type: Type of assessment (full, credit_only, compliance_only)
            context: Additional context for the assessment
            
        Returns:
            Dictionary with assessment results
        """
        credit_analysis = None
        compliance_check = None
        
        input_text = self._build_input_text(customer_id, context)
        
        if assessment_type == "full":
            # Run both agents in parallel
            results = self.run_parallel(
                ["credit_analyst", "compliance_officer"],
                input_text
            )
            credit_analysis = {
                "agent": "credit_analyst",
                "customer_id": customer_id,
                "analysis": results["credit_analyst"].output,
            }
            compliance_check = {
                "agent": "compliance_officer",
                "customer_id": customer_id,
                "assessment": results["compliance_officer"].output,
            }
        elif assessment_type == "credit_only":
            result = self.run_agent("credit_analyst", input_text)
            credit_analysis = {
                "agent": "credit_analyst",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif assessment_type == "compliance_only":
            result = self.run_agent("compliance_officer", input_text)
            compliance_check = {
                "agent": "compliance_officer",
                "customer_id": customer_id,
                "assessment": result.output,
            }
        
        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(credit_analysis, compliance_check)
        summary = self.synthesize({}, synthesis_prompt)
        
        return {
            "customer_id": customer_id,
            "credit_analysis": credit_analysis,
            "compliance_check": compliance_check,
            "final_summary": summary,
        }
    
    async def arun_assessment(
        self,
        customer_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.
        
        Args:
            customer_id: Customer identifier
            assessment_type: Type of assessment (full, credit_only, compliance_only)
            context: Additional context for the assessment
            
        Returns:
            Dictionary with assessment results
        """
        import asyncio
        
        credit_analysis = None
        compliance_check = None
        
        if assessment_type == "full":
            # Run both agents in parallel using the standalone functions
            credit_result, compliance_result = await asyncio.gather(
                analyze_credit_risk(customer_id, context),
                check_compliance(customer_id, context)
            )
            credit_analysis = credit_result
            compliance_check = compliance_result
        elif assessment_type == "credit_only":
            credit_analysis = await analyze_credit_risk(customer_id, context)
        elif assessment_type == "compliance_only":
            compliance_check = await check_compliance(customer_id, context)
        
        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(credit_analysis, compliance_check)
        
        # Run synthesis in executor since Strands is synchronous
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )
        
        return {
            "customer_id": customer_id,
            "credit_analysis": credit_analysis,
            "compliance_check": compliance_check,
            "final_summary": summary,
        }
    
    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for corporate customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""
        
        if context:
            base += f"\n\nAdditional Context: {context}"
        
        return base
    
    def _build_synthesis_prompt(self, credit_analysis, compliance_check) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        if credit_analysis:
            agent_results["credit_analysis"] = credit_analysis
        if compliance_check:
            agent_results["compliance_check"] = compliance_check
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"credit_risk": {"score": "int 0-100", "level": "low|medium|high|critical", "factors": ["list"], "recommendations": ["list"]}, "compliance": {"status": "compliant|non_compliant|review_required", "checks_passed": ["list"], "checks_failed": ["list"], "regulatory_notes": ["list"]}, "summary": "Executive summary with APPROVE/REJECT/ESCALATE recommendation"},
            domain_context="You are a Senior Risk Assessment Supervisor for corporate banking KYC onboarding.")



async def run_kyc_assessment(request: AssessmentRequest) -> AssessmentResponse:
    """Run the full KYC risk assessment workflow (Strands implementation)."""
    orchestrator = KYCOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        assessment_type=request.assessment_type.value,
        context=request.additional_context)

    credit_risk, compliance, summary = None, None, "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.assessment_type in [AssessmentType.FULL, AssessmentType.CREDIT_ONLY]:
            if structured.get("credit_risk"):
                credit_risk = RiskScore(**structured["credit_risk"])
        if request.assessment_type in [AssessmentType.FULL, AssessmentType.COMPLIANCE_ONLY]:
            if structured.get("compliance"):
                compliance = ComplianceStatus(**structured["compliance"])
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return AssessmentResponse(
        customer_id=request.customer_id, assessment_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), credit_risk=credit_risk, compliance=compliance,
        summary=summary, raw_analysis={
            "credit_analysis": final_state.get("credit_analysis"),
            "compliance_check": final_state.get("compliance_check")},
    )
