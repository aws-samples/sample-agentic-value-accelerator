"""
Corporate Sales Orchestrator (Strands Implementation).

Orchestrates specialist agents (Lead Scorer, Opportunity Analyst, Pitch Preparer)
for comprehensive corporate sales assessment in banking.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import LeadScorer, OpportunityAnalyst, PitchPreparer
from .agents.lead_scorer import score_lead
from .agents.opportunity_analyst import analyze_opportunity
from .agents.pitch_preparer import prepare_pitch
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    SalesRequest,
    SalesResponse,
    AnalysisType,
    LeadScore,
    LeadTier,
    OpportunityDetail,
    OpportunityStage,
)


class CorporateSalesOrchestrator(StrandsOrchestrator):
    """
    Corporate Sales Orchestrator using StrandsOrchestrator base class.

    Coordinates Lead Scorer, Opportunity Analyst, and Pitch Preparer agents
    for comprehensive corporate sales assessment.
    """

    name = "corporate_sales_orchestrator"

    system_prompt = """You are a Senior Corporate Sales Strategist for a banking institution.

Your role is to:
1. Coordinate specialist agents (Lead Scorer, Opportunity Analyst, Pitch Preparer)
2. Synthesize their findings into a comprehensive sales assessment
3. Ensure sales professionals have actionable intelligence for client engagement

When creating the final summary, consider:
- Lead quality and prioritization based on scoring factors
- Opportunity viability and recommended engagement strategies
- Customized pitch materials and value propositions
- Clear next steps and timeline recommendations
- Competitive positioning and differentiation points

Be concise but thorough. Your summary will be used by relationship managers and sales teams."""

    def __init__(self):
        super().__init__(
            agents={
                "lead_scorer": LeadScorer(),
                "opportunity_analyst": OpportunityAnalyst(),
                "pitch_preparer": PitchPreparer(),
            }
        )

    def run_assessment(
        self,
        customer_id: str,
        analysis_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the corporate sales assessment workflow.

        Args:
            customer_id: Prospect identifier
            analysis_type: Type of analysis (full, lead_scoring, opportunity_analysis, pitch_preparation)
            context: Additional context for the assessment

        Returns:
            Dictionary with assessment results
        """
        lead_result = None
        opportunity_result = None
        pitch_result = None

        input_text = self._build_input_text(customer_id, context)

        if analysis_type == "full":
            results = self.run_parallel(
                ["lead_scorer", "opportunity_analyst", "pitch_preparer"],
                input_text
            )
            lead_result = {
                "agent": "lead_scorer",
                "customer_id": customer_id,
                "analysis": results["lead_scorer"].output,
            }
            opportunity_result = {
                "agent": "opportunity_analyst",
                "customer_id": customer_id,
                "analysis": results["opportunity_analyst"].output,
            }
            pitch_result = {
                "agent": "pitch_preparer",
                "customer_id": customer_id,
                "analysis": results["pitch_preparer"].output,
            }
        elif analysis_type == "lead_scoring":
            result = self.run_agent("lead_scorer", input_text)
            lead_result = {
                "agent": "lead_scorer",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif analysis_type == "opportunity_analysis":
            result = self.run_agent("opportunity_analyst", input_text)
            opportunity_result = {
                "agent": "opportunity_analyst",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif analysis_type == "pitch_preparation":
            result = self.run_agent("pitch_preparer", input_text)
            pitch_result = {
                "agent": "pitch_preparer",
                "customer_id": customer_id,
                "analysis": result.output,
            }

        synthesis_prompt = self._build_synthesis_prompt(lead_result, opportunity_result, pitch_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "customer_id": customer_id,
            "lead_scorer_result": lead_result,
            "opportunity_analyst_result": opportunity_result,
            "pitch_preparer_result": pitch_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        customer_id: str,
        analysis_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.

        Args:
            customer_id: Prospect identifier
            analysis_type: Type of analysis
            context: Additional context

        Returns:
            Dictionary with assessment results
        """
        import asyncio

        lead_result = None
        opportunity_result = None
        pitch_result = None

        if analysis_type == "full":
            lead_result, opportunity_result, pitch_result = await asyncio.gather(
                score_lead(customer_id, context),
                analyze_opportunity(customer_id, context),
                prepare_pitch(customer_id, context),
            )
        elif analysis_type == "lead_scoring":
            lead_result = await score_lead(customer_id, context)
        elif analysis_type == "opportunity_analysis":
            opportunity_result = await analyze_opportunity(customer_id, context)
        elif analysis_type == "pitch_preparation":
            pitch_result = await prepare_pitch(customer_id, context)

        synthesis_prompt = self._build_synthesis_prompt(lead_result, opportunity_result, pitch_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "customer_id": customer_id,
            "lead_scorer_result": lead_result,
            "opportunity_analyst_result": opportunity_result,
            "pitch_preparer_result": pitch_result,
            "final_summary": summary,
        }

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for corporate prospect: {customer_id}

Steps to follow:
1. Retrieve the prospect's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        lead_result: Dict[str, Any] | None,
        opportunity_result: Dict[str, Any] | None,
        pitch_result: Dict[str, Any] | None
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if lead_result:
            sections.append(f"## Lead Scoring\n{json.dumps(lead_result, indent=2)}")
        if opportunity_result:
            sections.append(f"## Opportunity Analysis\n{json.dumps(opportunity_result, indent=2)}")
        if pitch_result:
            sections.append(f"## Pitch Preparation\n{json.dumps(pitch_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final corporate sales recommendation:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Lead Priority and Tier Classification
2. Opportunity Stage and Deal Confidence
3. Key Pitch Points and Value Propositions
4. Recommended Next Steps and Timeline
5. Critical factors that influenced the assessment"""



async def run_corporate_sales(request):
    """Run the assessment workflow."""
    orchestrator = CorporateSalesOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        analysis_type=request.analysis_type.value if hasattr(request.analysis_type, 'value') else str(request.analysis_type),
        context=getattr(request, 'additional_context', None))

    lead_score = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("lead_score_value") is not None:
            lead_score = LeadScore(
                score=structured.get("lead_score_value", 50),
                tier=LeadTier(structured.get("lead_score_tier", "warm")),
                factors=structured.get("lead_score_factors", []),
                recommendations=structured.get("recommendations", []))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return SalesResponse(
        customer_id=request.customer_id, assessment_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), lead_score=lead_score, recommendations=recommendations,
        summary=summary,
        raw_analysis={"lead_scorer": final_state.get("lead_scorer_result"), "opportunity_analyst": final_state.get("opportunity_analyst_result"), "pitch_preparer": final_state.get("pitch_preparer_result")},
    )
