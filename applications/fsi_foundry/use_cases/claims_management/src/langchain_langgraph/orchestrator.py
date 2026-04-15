"""
Claims Management Orchestrator.

Orchestrates specialist agents (Claims Intake Agent, Damage Assessor, Settlement Recommender)
for comprehensive claims management in insurance.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
try:
    from use_cases.claims_management.agents import ClaimsIntakeAgent, DamageAssessor, SettlementRecommender
    from use_cases.claims_management.agents.claims_intake_agent import process_intake
    from use_cases.claims_management.agents.damage_assessor import assess_damage
    from use_cases.claims_management.agents.settlement_recommender import recommend_settlement
    from use_cases.claims_management.models import (
        ClaimRequest, ClaimResponse, AssessmentType, IntakeSummary,
        DamageAssessment as DamageAssessmentModel, SettlementRecommendation,
        ClaimType, ClaimStatus, Severity,
    )
except ImportError:
    from agents import ClaimsIntakeAgent, DamageAssessor, SettlementRecommender
    from agents.claims_intake_agent import process_intake
    from agents.damage_assessor import assess_damage
    from agents.settlement_recommender import recommend_settlement
    from models import (
        ClaimRequest, ClaimResponse, AssessmentType, IntakeSummary,
        DamageAssessment as DamageAssessmentModel, SettlementRecommendation,
        ClaimType, ClaimStatus, Severity,
    )

from pydantic import BaseModel, Field


class ClaimsManagementSynthesisSchema(BaseModel):
    """Structured synthesis output schema for claims_management."""
    claim_type: str = Field(default="auto", description="Claim type: auto, property, liability, health, life")
    claim_status: str = Field(default="submitted", description="Claim status")
    documentation_complete: bool = Field(default=False, description="Whether documentation is complete")
    missing_documents: list[str] = Field(default_factory=list, description="Missing documents")
    severity: str = Field(default="moderate", description="Damage severity: low, moderate, high, catastrophic")
    estimated_repair_cost: float = Field(default=0.0, description="Estimated repair cost")
    estimated_replacement_cost: float = Field(default=0.0, description="Estimated replacement cost")
    damage_findings: list[str] = Field(default_factory=list, description="Damage assessment findings")
    recommended_amount: float = Field(default=0.0, description="Recommended settlement amount")
    confidence_score: float = Field(default=0.0, description="Settlement confidence score 0.0-1.0")
    policy_coverage_applicable: bool = Field(default=True, description="Whether policy coverage applies")
    justification: list[str] = Field(default_factory=list, description="Settlement justification points")
    summary: str = Field(..., description="Executive summary of the claims assessment with recommended actions")


class ClaimsManagementState(TypedDict):
    """State managed by the claims management orchestrator graph."""
    messages: Annotated[list, add_messages]
    claim_id: str
    assessment_type: str
    claims_intake_agent_result: dict | None
    damage_assessor_result: dict | None
    settlement_recommender_result: dict | None
    final_summary: str | None


class ClaimsManagementOrchestrator(LangGraphOrchestrator):
    """
    Claims Management Orchestrator using LangGraphOrchestrator base class.

    Coordinates Claims Intake Agent, Damage Assessor, and Settlement Recommender
    for comprehensive claims processing.
    """

    name = "claims_management_orchestrator"
    state_schema = ClaimsManagementState

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

    def build_graph(self) -> StateGraph:
        """Build the claims management workflow graph."""
        workflow = StateGraph(ClaimsManagementState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("claims_intake_agent", self._claims_intake_agent_node)
        workflow.add_node("damage_assessor", self._damage_assessor_node)
        workflow.add_node("settlement_recommender", self._settlement_recommender_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "claims_intake_agent": "claims_intake_agent",
                "damage_assessor": "damage_assessor",
                "settlement_recommender": "settlement_recommender",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("claims_intake_agent", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("damage_assessor", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("settlement_recommender", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: ClaimsManagementState) -> Literal["parallel_assessment", "claims_intake_agent", "damage_assessor", "settlement_recommender", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        intake_done = state.get("claims_intake_agent_result") is not None
        damage_done = state.get("damage_assessor_result") is not None
        settlement_done = state.get("settlement_recommender_result") is not None

        if assessment_type == "claims_intake_only":
            return "synthesize" if intake_done else "claims_intake_agent"
        if assessment_type == "damage_assessment_only":
            return "synthesize" if damage_done else "damage_assessor"
        if assessment_type == "settlement_only":
            return "synthesize" if settlement_done else "settlement_recommender"

        # Full assessment
        if not intake_done and not damage_done and not settlement_done:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state: ClaimsManagementState) -> ClaimsManagementState:
        """Execute all assessments in parallel."""
        claim_id = state["claim_id"]
        context = self._extract_context(state)

        intake_result, damage_result, settlement_result = await self._run_assessments_parallel(claim_id, context)

        return {
            **state,
            "claims_intake_agent_result": intake_result,
            "damage_assessor_result": damage_result,
            "settlement_recommender_result": settlement_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Claims Intake Complete: {json.dumps(intake_result, indent=2)}"),
                AIMessage(content=f"Damage Assessment Complete: {json.dumps(damage_result, indent=2)}"),
                AIMessage(content=f"Settlement Recommendation Complete: {json.dumps(settlement_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, claim_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            process_intake(claim_id, context),
            assess_damage(claim_id, context),
            recommend_settlement(claim_id, context),
        )

    async def _claims_intake_agent_node(self, state: ClaimsManagementState) -> ClaimsManagementState:
        """Execute claims intake processing."""
        claim_id = state["claim_id"]
        context = self._extract_context(state)
        result = await process_intake(claim_id, context)
        return {
            **state,
            "claims_intake_agent_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Claims Intake Complete: {json.dumps(result, indent=2)}")],
        }

    async def _damage_assessor_node(self, state: ClaimsManagementState) -> ClaimsManagementState:
        """Execute damage assessment."""
        claim_id = state["claim_id"]
        context = self._extract_context(state)
        result = await assess_damage(claim_id, context)
        return {
            **state,
            "damage_assessor_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Damage Assessment Complete: {json.dumps(result, indent=2)}")],
        }

    async def _settlement_recommender_node(self, state: ClaimsManagementState) -> ClaimsManagementState:
        """Execute settlement recommendation."""
        claim_id = state["claim_id"]
        context = self._extract_context(state)
        result = await recommend_settlement(claim_id, context)
        return {
            **state,
            "settlement_recommender_result": result,
            "messages": state["messages"] + [AIMessage(content=f"Settlement Recommendation Complete: {json.dumps(result, indent=2)}")],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "claim_id", "assessment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(ClaimsManagementSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {
            **state, "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],
        }

    def _extract_context(self, state: ClaimsManagementState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_claims_management(request: ClaimRequest) -> ClaimResponse:
    """Run the full claims management workflow."""
    orchestrator = ClaimsManagementOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin claims assessment for: {request.claim_id}")],
        "claim_id": request.claim_id,
        "assessment_type": request.assessment_type.value,
    }
    for key in [k for k in ClaimsManagementState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    intake_summary = None
    damage_assessment = None
    settlement_recommendation = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
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
