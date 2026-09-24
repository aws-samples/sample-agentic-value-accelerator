"""
KYC Controlled Quality Output — Assessment Orchestrator.

Orchestrates specialist agents (Credit Analyst, Compliance Officer) and then
runs a deterministic governance pipeline over their findings: deterministic
financial checks, sanctions / PEP screening, a three-layer policy cascade
(ORG / APP / REQUEST), and an LLM-as-Judge quality score. The final decision
(APPROVE / ESCALATE / DECLINE / BLOCK) is produced by the governance layer and
is non-bypassable by the agents — e.g. a sanctions match blocks the onboarding
regardless of the agents' recommendation.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.kyc_governance_insights.agents import CreditAnalyst, ComplianceOfficer
from use_cases.kyc_governance_insights.agents.credit_analyst import analyze_credit_risk
from use_cases.kyc_governance_insights.agents.compliance_officer import check_compliance
from use_cases.kyc_governance_insights.governance_pipeline import run_governance, assemble_response
from use_cases.kyc_governance_insights.models import (
    AssessmentRequest,
    AssessmentResponse,
    AssessmentType,
)

from pydantic import BaseModel, Field

import structlog

logger = structlog.get_logger(__name__)


class KYCSynthesisSchema(BaseModel):
    """Flat schema for structured synthesis — avoids nested Optional models that break Bedrock tool spec."""
    credit_risk_score: int = Field(default=50, description="Credit risk score from 0 to 100")
    credit_risk_level: str = Field(default="medium", description="Risk level: low, medium, high, or critical")
    credit_risk_factors: list[str] = Field(default_factory=list, description="List of contributing risk factors")
    credit_risk_recommendations: list[str] = Field(default_factory=list, description="List of risk mitigation recommendations")
    compliance_status: str = Field(default="review_required", description="Compliance status: compliant, non_compliant, or review_required")
    compliance_checks_passed: list[str] = Field(default_factory=list, description="List of compliance checks that passed")
    compliance_checks_failed: list[str] = Field(default_factory=list, description="List of compliance checks that failed")
    compliance_regulatory_notes: list[str] = Field(default_factory=list, description="Regulatory notes and observations")
    summary: str = Field(..., description="Executive summary with overall risk assessment, recommendation APPROVE or REJECT or ESCALATE, and key findings")


class KYCState(TypedDict):
    """State managed by the KYC orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    assessment_type: str
    credit_analysis: dict | None
    compliance_check: dict | None
    final_summary: str | None
    governance: dict | None


class KYCOrchestrator(LangGraphOrchestrator):
    """
    KYC Controlled Quality Output Orchestrator.

    Coordinates Credit Analyst and Compliance Officer agents, then applies the
    deterministic governance pipeline (deterministic checks, sanctions/PEP,
    policy cascade, LLM-judge) to produce a non-bypassable decision.
    """

    name = "kyc_governance_orchestrator"
    state_schema = KYCState

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

Note: an independent governance layer applies deterministic controls (sanctions
screening, policy cascade, financial validation) AFTER your synthesis and may
override your recommendation. State your assessment on the merits.

Be concise but thorough. Your summary will be used by decision-makers."""

    def __init__(self):
        super().__init__(
            agents={
                "credit_analyst": CreditAnalyst(),
                "compliance_officer": ComplianceOfficer(),
            }
        )

    def build_graph(self) -> StateGraph:
        """Build the KYC assessment workflow graph."""
        workflow = StateGraph(KYCState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("credit_analyst", self._credit_analyst_node)
        workflow.add_node("compliance_officer", self._compliance_officer_node)
        workflow.add_node("synthesize", self._synthesize_node)
        # Node name must differ from the "governance" state key (LangGraph
        # forbids a node sharing a name with a state channel).
        workflow.add_node("governance_review", self._governance_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "credit_analyst": "credit_analyst",
                "compliance_officer": "compliance_officer",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("credit_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("compliance_officer", self._router, {"synthesize": "synthesize"})
        # Governance runs after synthesis, before END.
        workflow.add_edge("synthesize", "governance_review")
        workflow.add_edge("governance_review", END)

        return workflow.compile()

    def _router(self, state: KYCState) -> Literal["parallel_assessment", "credit_analyst", "compliance_officer", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        credit_done = state.get("credit_analysis") is not None
        compliance_done = state.get("compliance_check") is not None

        if assessment_type == "credit_only":
            return "synthesize" if credit_done else "credit_analyst"
        if assessment_type == "compliance_only":
            return "synthesize" if compliance_done else "compliance_officer"
        if not credit_done and not compliance_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: KYCState) -> KYCState:
        """Execute both assessments in parallel using base class helper."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        credit_result, compliance_result = await self._run_assessments_parallel(customer_id, context)
        return {
            **state,
            "credit_analysis": credit_result,
            "compliance_check": compliance_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Credit Analysis Complete: {json.dumps(credit_result, indent=2)}"),
                AIMessage(content=f"Compliance Check Complete: {json.dumps(compliance_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, customer_id: str, context: str | None):
        """Run credit and compliance assessments in parallel."""
        import asyncio
        credit_task = analyze_credit_risk(customer_id, context)
        compliance_task = check_compliance(customer_id, context)
        return await asyncio.gather(credit_task, compliance_task)

    async def _credit_analyst_node(self, state: KYCState) -> KYCState:
        """Execute credit risk analysis."""
        if state.get("assessment_type") == "compliance_only":
            return state
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await analyze_credit_risk(customer_id, context)
        return {
            **state,
            "credit_analysis": result,
            "messages": state["messages"] + [AIMessage(content=f"Credit Analysis Complete: {json.dumps(result, indent=2)}")],
        }

    async def _compliance_officer_node(self, state: KYCState) -> KYCState:
        """Execute compliance check."""
        if state.get("assessment_type") == "credit_only":
            return state
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await check_compliance(customer_id, context)
        return {
            **state,
            "compliance_check": result,
            "messages": state["messages"] + [AIMessage(content=f"Compliance Check Complete: {json.dumps(result, indent=2)}")],
        }

    async def _synthesize_node(self, state: KYCState) -> KYCState:
        """Synthesize findings into structured assessment using with_structured_output."""
        credit_analysis = state.get("credit_analysis")
        compliance_check = state.get("compliance_check")

        sections = []
        if credit_analysis:
            sections.append(f"## Credit Risk Analysis\n{json.dumps(credit_analysis, indent=2)}")
        if compliance_check:
            sections.append(f"## Compliance Assessment\n{json.dumps(compliance_check, indent=2)}")

        synthesis_prompt = f"""You are a Senior Risk Assessment Supervisor. Based on the following specialist assessments, produce a structured KYC assessment.

{chr(10).join(sections)}

Fill in all fields based on the agent assessments above. Use actual findings, scores, and details — not generic defaults."""

        try:
            llm = self._create_llm(disable_guardrail=True)
            structured_llm = llm.with_structured_output(KYCSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            logger.warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({"credit": credit_analysis, "compliance": compliance_check}, synthesis_prompt)
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Assessment: {json.dumps(structured)}")],
        }

    async def _governance_node(self, state: KYCState) -> KYCState:
        """Run the deterministic governance pipeline over the synthesized findings."""
        try:
            structured = json.loads(state.get("final_summary", "{}"))
        except (json.JSONDecodeError, TypeError):
            structured = {}

        governance_result = await run_governance(state["customer_id"], structured)
        return {
            **state,
            "governance": governance_result,
            "messages": state["messages"] + [AIMessage(content=f"Governance: {json.dumps(governance_result)}")],
        }

    def _extract_context(self, state: KYCState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None


async def run_kyc_assessment(request: AssessmentRequest) -> AssessmentResponse:
    """Run the full governance-controlled KYC assessment workflow."""
    orchestrator = KYCOrchestrator()
    initial_state: KYCState = {
        "messages": [HumanMessage(content=f"Begin KYC assessment for customer: {request.customer_id}")],
        "customer_id": request.customer_id,
        "assessment_type": request.assessment_type.value,
        "credit_analysis": None, "compliance_check": None, "final_summary": None, "governance": None,
    }
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
    except (json.JSONDecodeError, TypeError):
        structured = {"summary": final_state.get("final_summary", "Assessment completed")}

    return assemble_response(
        request=request,
        structured=structured,
        credit_analysis=final_state.get("credit_analysis"),
        compliance_check=final_state.get("compliance_check"),
        gov=final_state.get("governance") or {},
    )
