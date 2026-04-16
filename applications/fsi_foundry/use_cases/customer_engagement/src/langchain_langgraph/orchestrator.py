"""
Customer Engagement Orchestrator.

Orchestrates specialist agents (Churn Predictor, Outreach Agent, Policy Optimizer)
for comprehensive customer engagement assessment in insurance.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.customer_engagement.agents import ChurnPredictor, OutreachAgent, PolicyOptimizer
from use_cases.customer_engagement.agents.churn_predictor import predict_churn
from use_cases.customer_engagement.agents.outreach_agent import plan_outreach
from use_cases.customer_engagement.agents.policy_optimizer import optimize_policy
from use_cases.customer_engagement.models import (
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

from pydantic import BaseModel, Field

class CustomerEngagementSynthesisSchema(BaseModel):
    """Structured synthesis output schema for customer_engagement."""
    churn_risk_level: str = Field(default="medium", description="Churn risk: low, medium, high, or critical")
    churn_probability: float = Field(default=0.5, description="Churn probability 0 to 1")
    churn_risk_factors: list[str] = Field(default_factory=list, description="Key risk factors")
    outreach_channel: str = Field(default="email", description="Recommended outreach channel")
    outreach_talking_points: list[str] = Field(default_factory=list, description="Key talking points")
    policy_actions: list[str] = Field(default_factory=list, description="Recommended policy actions")
    summary: str = Field(..., description="Executive summary of engagement assessment")



class CustomerEngagementState(TypedDict):
    """State managed by the customer engagement orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    assessment_type: str
    churn_predictor_result: dict | None
    outreach_agent_result: dict | None
    policy_optimizer_result: dict | None
    final_summary: str | None


class CustomerEngagementOrchestrator(LangGraphOrchestrator):
    """
    Customer Engagement Orchestrator using LangGraphOrchestrator base class.

    Coordinates Churn Predictor, Outreach Agent, and Policy Optimizer agents
    for comprehensive customer engagement assessment.
    """

    name = "customer_engagement_orchestrator"
    state_schema = CustomerEngagementState

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

    def build_graph(self) -> StateGraph:
        """Build the customer engagement assessment workflow graph."""
        workflow = StateGraph(CustomerEngagementState)

        # Add nodes
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("churn_predictor", self._churn_predictor_node)
        workflow.add_node("outreach_agent", self._outreach_agent_node)
        workflow.add_node("policy_optimizer", self._policy_optimizer_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # Set conditional entry point
        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "churn_predictor": "churn_predictor",
                "outreach_agent": "outreach_agent",
                "policy_optimizer": "policy_optimizer",
            },
        )

        # Define edges
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "churn_predictor",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "outreach_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "policy_optimizer",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(self, state: CustomerEngagementState) -> Literal["parallel_assessment", "churn_predictor", "outreach_agent", "policy_optimizer", "synthesize"]:
        """Route to the next node based on current state."""
        assessment_type = state.get("assessment_type", "full")
        churn_done = state.get("churn_predictor_result") is not None
        outreach_done = state.get("outreach_agent_result") is not None
        policy_done = state.get("policy_optimizer_result") is not None

        if assessment_type == "churn_prediction_only":
            return "synthesize" if churn_done else "churn_predictor"

        if assessment_type == "outreach_only":
            return "synthesize" if outreach_done else "outreach_agent"

        if assessment_type == "policy_optimization_only":
            return "synthesize" if policy_done else "policy_optimizer"

        # Full assessment
        if not churn_done and not outreach_done and not policy_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: CustomerEngagementState) -> CustomerEngagementState:
        """Execute all three assessments in parallel using base class helper."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)


        # Also run the standalone functions for backward compatibility
        churn_result, outreach_result, policy_result = await self._run_assessments_parallel(customer_id, context)

        return {
            **state,
            "churn_predictor_result": churn_result,
            "outreach_agent_result": outreach_result,
            "policy_optimizer_result": policy_result,
            "messages": state["messages"] + [
                AIMessage(content=f"Churn Prediction Complete: {json.dumps(churn_result, indent=2)}"),
                AIMessage(content=f"Outreach Plan Complete: {json.dumps(outreach_result, indent=2)}"),
                AIMessage(content=f"Policy Optimization Complete: {json.dumps(policy_result, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, customer_id: str, context: str | None):
        """Run all three assessments in parallel."""
        import asyncio
        churn_task = predict_churn(customer_id, context)
        outreach_task = plan_outreach(customer_id, context)
        policy_task = optimize_policy(customer_id, context)
        return await asyncio.gather(churn_task, outreach_task, policy_task)

    async def _churn_predictor_node(self, state: CustomerEngagementState) -> CustomerEngagementState:
        """Execute churn prediction analysis."""
        if state.get("assessment_type") in ["outreach_only", "policy_optimization_only"]:
            return state

        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await predict_churn(customer_id, context)

        return {
            **state,
            "churn_predictor_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Churn Prediction Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _outreach_agent_node(self, state: CustomerEngagementState) -> CustomerEngagementState:
        """Execute outreach planning."""
        if state.get("assessment_type") in ["churn_prediction_only", "policy_optimization_only"]:
            return state

        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await plan_outreach(customer_id, context)

        return {
            **state,
            "outreach_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Outreach Plan Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _policy_optimizer_node(self, state: CustomerEngagementState) -> CustomerEngagementState:
        """Execute policy optimization."""
        if state.get("assessment_type") in ["churn_prediction_only", "outreach_only"]:
            return state

        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await optimize_policy(customer_id, context)

        return {
            **state,
            "policy_optimizer_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Policy Optimization Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "assessment_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm(); llm.max_tokens = 2048
            structured_llm = llm.with_structured_output(CustomerEngagementSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: CustomerEngagementState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_customer_engagement(request):
    """Run the assessment workflow."""
    orchestrator = CustomerEngagementOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "assessment_type": request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
    }
    for key in [k for k in CustomerEngagementState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    churn_prediction = None; outreach_plan = None; policy_recommendations = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
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
        raw_analysis={"churn_prediction": final_state.get("churn_predictor_result"), "outreach_plan": final_state.get("outreach_agent_result"), "policy_recommendations": final_state.get("policy_optimizer_result")},
    )
