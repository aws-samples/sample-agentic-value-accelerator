"""
Customer Engagement Orchestrator (Strands Implementation).

Orchestrates specialist agents (Churn Predictor, Outreach Agent, Policy Optimizer)
for comprehensive customer engagement assessment in insurance.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor

from base.strands import StrandsOrchestrator
from .agents import ChurnPredictor, OutreachAgent, PolicyOptimizer
from .agents.churn_predictor import predict_churn
from .agents.outreach_agent import plan_outreach
from .agents.policy_optimizer import optimize_policy
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    EngagementRequest,
    EngagementResponse,
    AssessmentType,
    ChurnPrediction,
    ChurnRisk,
    OutreachPlan,
    OutreachChannel,
    PolicyRecommendations,
    PolicyAction,
)


class CustomerEngagementOrchestrator(StrandsOrchestrator):
    """
    Customer Engagement Orchestrator using StrandsOrchestrator base class.

    Coordinates Churn Predictor, Outreach Agent, and Policy Optimizer agents
    for comprehensive customer engagement assessment.
    """

    name = "customer_engagement_orchestrator"

    system_prompt = """You are a Senior Customer Engagement Manager for an insurance company.

Your role is to:
1. Coordinate specialist agents (Churn Predictor, Outreach Agent, Policy Optimizer)
2. Synthesize their findings into a comprehensive customer engagement strategy
3. Ensure retention efforts are targeted, personalized, and aligned with business goals

When creating the final summary, consider:
- Churn risk level and urgency of intervention needed
- Alignment between outreach strategy and identified risk factors
- Policy optimization opportunities that address customer pain points
- Overall retention probability given the recommended actions
- Clear next steps for the customer engagement team
- Cost-benefit analysis of recommended retention actions

Be concise but thorough. Your summary will be used by customer engagement specialists and retention managers."""

    def __init__(self):
        super().__init__(
            agents={
                "churn_predictor": ChurnPredictor(),
                "outreach_agent": OutreachAgent(),
                "policy_optimizer": PolicyOptimizer(),
            }
        )

    def run_assessment(
        self,
        customer_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the customer engagement assessment workflow.

        Args:
            customer_id: Customer identifier
            assessment_type: Type of assessment (full, churn_prediction_only, outreach_only, policy_optimization_only)
            context: Additional context for the assessment

        Returns:
            Dictionary with assessment results
        """
        churn_result = None
        outreach_result = None
        policy_result = None

        input_text = self._build_input_text(customer_id, context)

        if assessment_type == "full":
            # Run all three agents in parallel
            results = self.run_parallel(
                ["churn_predictor", "outreach_agent", "policy_optimizer"],
                input_text
            )
            churn_result = {
                "agent": "churn_predictor",
                "customer_id": customer_id,
                "analysis": results["churn_predictor"].output,
            }
            outreach_result = {
                "agent": "outreach_agent",
                "customer_id": customer_id,
                "analysis": results["outreach_agent"].output,
            }
            policy_result = {
                "agent": "policy_optimizer",
                "customer_id": customer_id,
                "analysis": results["policy_optimizer"].output,
            }
        elif assessment_type == "churn_prediction_only":
            result = self.run_agent("churn_predictor", input_text)
            churn_result = {
                "agent": "churn_predictor",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif assessment_type == "outreach_only":
            result = self.run_agent("outreach_agent", input_text)
            outreach_result = {
                "agent": "outreach_agent",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif assessment_type == "policy_optimization_only":
            result = self.run_agent("policy_optimizer", input_text)
            policy_result = {
                "agent": "policy_optimizer",
                "customer_id": customer_id,
                "analysis": result.output,
            }

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(churn_result, outreach_result, policy_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "customer_id": customer_id,
            "churn_prediction": churn_result,
            "outreach_plan": outreach_result,
            "policy_recommendations": policy_result,
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
            assessment_type: Type of assessment (full, churn_prediction_only, outreach_only, policy_optimization_only)
            context: Additional context for the assessment

        Returns:
            Dictionary with assessment results
        """
        import asyncio

        churn_result = None
        outreach_result = None
        policy_result = None

        if assessment_type == "full":
            # Run all three agents in parallel using the standalone functions
            churn_result, outreach_result, policy_result = await asyncio.gather(
                predict_churn(customer_id, context),
                plan_outreach(customer_id, context),
                optimize_policy(customer_id, context)
            )
        elif assessment_type == "churn_prediction_only":
            churn_result = await predict_churn(customer_id, context)
        elif assessment_type == "outreach_only":
            outreach_result = await plan_outreach(customer_id, context)
        elif assessment_type == "policy_optimization_only":
            policy_result = await optimize_policy(customer_id, context)

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(churn_result, outreach_result, policy_result)

        # Run synthesis in executor since Strands is synchronous
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "customer_id": customer_id,
            "churn_prediction": churn_result,
            "outreach_plan": outreach_result,
            "policy_recommendations": policy_result,
            "final_summary": summary,
        }

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for insurance customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        churn_result: Dict[str, Any] | None,
        outreach_result: Dict[str, Any] | None,
        policy_result: Dict[str, Any] | None
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if churn_result:
            sections.append(f"## Churn Prediction Analysis\n{json.dumps(churn_result, indent=2)}")
        if outreach_result:
            sections.append(f"## Outreach Strategy\n{json.dumps(outreach_result, indent=2)}")
        if policy_result:
            sections.append(f"## Policy Optimization Recommendations\n{json.dumps(policy_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final customer engagement recommendation:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Overall Churn Risk Assessment (LOW/MODERATE/HIGH/CRITICAL)
2. Recommended Retention Strategy
3. Priority Actions for the engagement team
4. Expected retention probability given recommended actions
5. Cost-benefit analysis of recommended retention actions"""



async def run_customer_engagement(request):
    """Run the assessment workflow."""
    orchestrator = CustomerEngagementOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        assessment_type=request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
        context=getattr(request, 'additional_context', None))

    churn_prediction = None; outreach_plan = None; policy_recommendations = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("churn_risk_level"):
            churn_prediction = ChurnPrediction(
                risk_level=ChurnRisk(structured.get("churn_risk_level", "medium")),
                churn_probability=structured.get("churn_probability", 0.5),
                risk_factors=structured.get("churn_risk_factors", []),
                behavioral_signals=[], retention_window_days=90, notes=[])
        if structured.get("outreach_channel"):
            outreach_plan = OutreachPlan(
                recommended_channel=OutreachChannel(structured.get("outreach_channel", "email")),
                secondary_channels=[], messaging_theme="", talking_points=structured.get("outreach_talking_points", []),
                optimal_timing="", personalization_elements=[], notes=[])
        policy_recommendations = PolicyRecommendations(recommended_actions=[])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return EngagementResponse(
        customer_id=request.customer_id, engagement_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), churn_prediction=churn_prediction, outreach_plan=outreach_plan, policy_recommendations=policy_recommendations,
        summary=summary,
        raw_analysis={"churn_prediction": final_state.get("churn_prediction"), "outreach_plan": final_state.get("outreach_plan"), "policy_recommendations": final_state.get("policy_recommendations")},
    )
