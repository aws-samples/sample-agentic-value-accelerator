"""Agentic Commerce Orchestrator (LangGraph)."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.agentic_commerce.agents import OfferEngine, FulfillmentAgent, ProductMatcher
from use_cases.agentic_commerce.agents.offer_engine import generate_offers
from use_cases.agentic_commerce.agents.fulfillment_agent import process_fulfillment
from use_cases.agentic_commerce.agents.product_matcher import match_products
from use_cases.agentic_commerce.models import (
    CommerceRequest, CommerceResponse, CommerceType,
    OfferResult, OfferStatus, FulfillmentResult, FulfillmentStatus, MatchResult,
)

from pydantic import BaseModel, Field

class AgenticCommerceSynthesisSchema(BaseModel):
    """Structured synthesis for agentic commerce."""
    offer_description: str = Field(default="", description="Description of the generated offer")
    offer_discount_pct: int = Field(default=0, description="Discount percentage offered")
    fulfillment_status: str = Field(default="pending", description="Fulfillment status")
    fulfillment_steps: list[str] = Field(default_factory=list, description="List of fulfillment steps")
    matched_products: list[str] = Field(default_factory=list, description="List of matched product names")
    recommendations: list[str] = Field(default_factory=list, description="List of commerce recommendations")
    summary: str = Field(..., description="Executive summary of commerce interaction")


class CommerceState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_id: str
    commerce_type: str
    offer_result: dict | None
    fulfillment_result: dict | None
    match_result: dict | None
    final_summary: str | None

class CommerceOrchestrator(LangGraphOrchestrator):
    name = "commerce_orchestrator"
    state_schema = CommerceState
    system_prompt = """You are a Senior Banking Commerce Strategist.
Coordinate offer generation, product matching, and fulfillment.
Synthesize into a commerce recommendation: PROCEED / HOLD / REVISE."""

    def __init__(self):
        super().__init__(agents={"offer_engine": OfferEngine(), "fulfillment_agent": FulfillmentAgent(), "product_matcher": ProductMatcher()})

    def build_graph(self):
        wf = StateGraph(CommerceState)
        wf.add_node("parallel", self._parallel_node)
        wf.add_node("offer_engine", self._offer_node)
        wf.add_node("fulfillment_agent", self._fulfillment_node)
        wf.add_node("product_matcher", self._match_node)
        wf.add_node("synthesize", self._synthesize_node)
        wf.set_conditional_entry_point(self._router, {"parallel": "parallel", "offer_engine": "offer_engine", "fulfillment_agent": "fulfillment_agent", "product_matcher": "product_matcher"})
        wf.add_edge("parallel", "synthesize")
        wf.add_conditional_edges("offer_engine", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("fulfillment_agent", self._router, {"synthesize": "synthesize"})
        wf.add_conditional_edges("product_matcher", self._router, {"synthesize": "synthesize"})
        wf.add_edge("synthesize", END)
        return wf.compile()

    def _router(self, state) -> Literal["parallel", "offer_engine", "fulfillment_agent", "product_matcher", "synthesize"]:
        ct = state.get("commerce_type", "full")
        if ct == "offer_only": return "synthesize" if state.get("offer_result") else "offer_engine"
        if ct == "fulfillment_only": return "synthesize" if state.get("fulfillment_result") else "fulfillment_agent"
        if ct == "matching_only": return "synthesize" if state.get("match_result") else "product_matcher"
        if not state.get("offer_result") and not state.get("fulfillment_result") and not state.get("match_result"): return "parallel"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        cid, ctx = state["customer_id"], self._extract_context(state)
        o, f, m = await asyncio.gather(generate_offers(cid, ctx), process_fulfillment(cid, ctx), match_products(cid, ctx))
        return {**state, "offer_result": o, "fulfillment_result": f, "match_result": m,
                "messages": state["messages"] + [AIMessage(content=f"All assessments complete")]}

    async def _offer_node(self, state):
        r = await generate_offers(state["customer_id"], self._extract_context(state))
        return {**state, "offer_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _fulfillment_node(self, state):
        r = await process_fulfillment(state["customer_id"], self._extract_context(state))
        return {**state, "fulfillment_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _match_node(self, state):
        r = await match_products(state["customer_id"], self._extract_context(state))
        return {**state, "match_result": r, "messages": state["messages"] + [AIMessage(content=json.dumps(r, indent=2))]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "commerce_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(AgenticCommerceSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_agentic_commerce(request):
    """Run the assessment workflow."""
    orchestrator = CommerceOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "commerce_type": request.commerce_type.value if hasattr(request.commerce_type, 'value') else str(request.commerce_type),
    }
    for key in [k for k in CommerceState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    recommendations = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return CommerceResponse(
        customer_id=request.customer_id, commerce_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), recommendations=recommendations,
        summary=summary,
        raw_analysis={"offer_result": final_state.get("offer_result"), "fulfillment_result": final_state.get("fulfillment_result"), "match_result": final_state.get("match_result")},
    )
