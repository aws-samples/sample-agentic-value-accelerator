"""Agentic Commerce Orchestrator (Strands)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import OfferEngine, FulfillmentAgent, ProductMatcher
from .agents.offer_engine import generate_offers
from .agents.fulfillment_agent import process_fulfillment
from .agents.product_matcher import match_products
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    CommerceRequest, CommerceResponse, CommerceType,
    OfferResult, OfferStatus, FulfillmentResult, FulfillmentStatus, MatchResult,
)

class CommerceOrchestrator(StrandsOrchestrator):
    name = "commerce_orchestrator"
    system_prompt = """You are a Senior Banking Commerce Strategist.
Coordinate offer generation, product matching, and fulfillment.
Synthesize into a commerce recommendation: PROCEED / HOLD / REVISE."""

    def __init__(self):
        super().__init__(agents={
            "offer_engine": OfferEngine(),
            "fulfillment_agent": FulfillmentAgent(),
            "product_matcher": ProductMatcher(),
        })

    async def arun_assessment(self, customer_id, commerce_type="full", context=None):
        import asyncio
        offer_result = fulfillment_result = match_result = None
        if commerce_type == "full":
            offer_result, fulfillment_result, match_result = await asyncio.gather(
                generate_offers(customer_id, context),
                process_fulfillment(customer_id, context),
                match_products(customer_id, context),
            )
        elif commerce_type == "offer_only":
            offer_result = await generate_offers(customer_id, context)
        elif commerce_type == "fulfillment_only":
            fulfillment_result = await process_fulfillment(customer_id, context)
        elif commerce_type == "matching_only":
            match_result = await match_products(customer_id, context)

        sections = []
        if offer_result: sections.append(f"## Offers\n{json.dumps(offer_result, indent=2)}")
        if fulfillment_result: sections.append(f"## Fulfillment\n{json.dumps(fulfillment_result, indent=2)}")
        if match_result: sections.append(f"## Product Matching\n{json.dumps(match_result, indent=2)}")

        prompt = f"""Based on the following:\n{chr(10).join(sections)}\n\nProvide: 1. Recommendation (PROCEED/HOLD/REVISE) 2. Key findings 3. Next steps"""
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, prompt))
        return {"customer_id": customer_id, "offer_result": offer_result, "fulfillment_result": fulfillment_result, "match_result": match_result, "final_summary": summary}


async def run_agentic_commerce(request):
    """Run the assessment workflow."""
    orchestrator = CommerceOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        commerce_type=request.commerce_type.value if hasattr(request.commerce_type, 'value') else str(request.commerce_type),
        context=getattr(request, 'additional_context', None))

    recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return CommerceResponse(
        customer_id=request.customer_id, commerce_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), recommendations=recommendations,
        summary=summary,
        raw_analysis={"offer_result": final_state.get("offer_result"), "fulfillment_result": final_state.get("fulfillment_result"), "match_result": final_state.get("match_result")},
    )
