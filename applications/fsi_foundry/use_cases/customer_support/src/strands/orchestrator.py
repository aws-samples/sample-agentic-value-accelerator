"""
Customer Support Orchestrator (Strands Implementation).

Orchestrates specialist agents (Ticket Classifier, Resolution Agent, Escalation Agent)
for comprehensive customer support in banking.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import TicketClassifier, ResolutionAgent, EscalationAgent
from .agents.ticket_classifier import classify_ticket
from .agents.resolution_agent import suggest_resolution
from .agents.escalation_agent import evaluate_escalation
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    SupportRequest,
    SupportResponse,
    TicketType,
    TicketClassification,
    UrgencyLevel,
    ResolutionSuggestion,
    EscalationDecision,
    EscalationStatus,
)


class CustomerSupportOrchestrator(StrandsOrchestrator):
    """
    Customer Support Orchestrator using StrandsOrchestrator base class.

    Coordinates Ticket Classifier, Resolution Agent, and Escalation Agent
    for comprehensive customer support.
    """

    name = "customer_support_orchestrator"

    system_prompt = """You are a Senior Customer Support Supervisor for a banking institution.

Your role is to:
1. Coordinate specialist agents (Ticket Classifier, Resolution Agent, Escalation Agent)
2. Synthesize their findings into a comprehensive support response
3. Ensure customer tickets are classified, resolved, or escalated appropriately

When creating the final summary, consider:
- Ticket classification accuracy and urgency assessment
- Resolution suggestion quality and confidence level
- Escalation necessity and appropriate routing
- Clear next steps for the support representative
- Overall customer satisfaction and response timeliness

Be concise but thorough. Your summary will be used by customer support representatives."""

    def __init__(self):
        super().__init__(
            agents={
                "ticket_classifier": TicketClassifier(),
                "resolution_agent": ResolutionAgent(),
                "escalation_agent": EscalationAgent(),
            }
        )

    def run_assessment(
        self,
        customer_id: str,
        ticket_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Run the customer support workflow."""
        classification = None
        resolution = None
        escalation = None

        input_text = self._build_input_text(customer_id, context)

        if ticket_type == "full":
            results = self.run_parallel(
                ["ticket_classifier", "resolution_agent", "escalation_agent"],
                input_text,
            )
            classification = {"agent": "ticket_classifier", "customer_id": customer_id, "classification": results["ticket_classifier"].output}
            resolution = {"agent": "resolution_agent", "customer_id": customer_id, "resolution": results["resolution_agent"].output}
            escalation = {"agent": "escalation_agent", "customer_id": customer_id, "escalation": results["escalation_agent"].output}
        elif ticket_type in ("general", "technical"):
            results = self.run_parallel(["ticket_classifier", "resolution_agent"], input_text)
            classification = {"agent": "ticket_classifier", "customer_id": customer_id, "classification": results["ticket_classifier"].output}
            resolution = {"agent": "resolution_agent", "customer_id": customer_id, "resolution": results["resolution_agent"].output}
        elif ticket_type in ("billing", "account"):
            results = self.run_parallel(["ticket_classifier", "resolution_agent", "escalation_agent"], input_text)
            classification = {"agent": "ticket_classifier", "customer_id": customer_id, "classification": results["ticket_classifier"].output}
            resolution = {"agent": "resolution_agent", "customer_id": customer_id, "resolution": results["resolution_agent"].output}
            escalation = {"agent": "escalation_agent", "customer_id": customer_id, "escalation": results["escalation_agent"].output}

        synthesis_prompt = self._build_synthesis_prompt(classification, resolution, escalation)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "customer_id": customer_id,
            "classification": classification,
            "resolution": resolution,
            "escalation": escalation,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        customer_id: str,
        ticket_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        classification = None
        resolution = None
        escalation = None

        if ticket_type == "full" or ticket_type in ("billing", "account"):
            classification, resolution, escalation = await asyncio.gather(
                classify_ticket(customer_id, context),
                suggest_resolution(customer_id, context),
                evaluate_escalation(customer_id, context),
            )
        elif ticket_type in ("general", "technical"):
            classification, resolution = await asyncio.gather(
                classify_ticket(customer_id, context),
                suggest_resolution(customer_id, context),
            )

        synthesis_prompt = self._build_synthesis_prompt(classification, resolution, escalation)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt),
        )

        return {
            "customer_id": customer_id,
            "classification": classification,
            "resolution": resolution,
            "escalation": escalation,
            "final_summary": summary,
        }

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for customer support request: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(
        self,
        classification: Dict[str, Any] | None,
        resolution: Dict[str, Any] | None,
        escalation: Dict[str, Any] | None,
    ) -> str:
        sections = []
        if classification:
            sections.append(f"## Ticket Classification\n{json.dumps(classification, indent=2)}")
        if resolution:
            sections.append(f"## Resolution Suggestion\n{json.dumps(resolution, indent=2)}")
        if escalation:
            sections.append(f"## Escalation Assessment\n{json.dumps(escalation, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final customer support recommendation:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Ticket Category and Urgency Assessment
2. Recommended Resolution with confidence level
3. Escalation Decision (NOT_NEEDED/RECOMMENDED/REQUIRED)
4. Clear next steps for the support representative
5. Key findings that influenced the decision"""



async def run_customer_support(request):
    """Run the assessment workflow."""
    orchestrator = CustomerSupportOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        ticket_type=request.ticket_type.value if hasattr(request.ticket_type, 'value') else str(request.ticket_type),
        context=getattr(request, 'additional_context', None))

    classification = None; resolution = None; escalation = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("classification_category"):
            classification = TicketClassification(
                category=structured.get("classification_category", "general"),
                urgency=UrgencyLevel(structured.get("classification_urgency", "medium")),
                required_expertise=[], tags=[])
        if structured.get("resolution_suggestion"):
            resolution = ResolutionSuggestion(
                suggested_resolution=structured.get("resolution_suggestion", ""),
                confidence=structured.get("resolution_confidence", 0.5),
                similar_cases=[], steps=structured.get("resolution_steps", []), knowledge_base_refs=[])
        if structured.get("escalation_status"):
            escalation = EscalationDecision(
                status=EscalationStatus(structured.get("escalation_status", "not_needed")),
                reason=structured.get("escalation_reason") or None,
                recommended_team=None, priority_override=None)
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return SupportResponse(
        customer_id=request.customer_id, ticket_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), classification=classification, resolution=resolution, escalation=escalation,
        summary=summary,
        raw_analysis={"classification": final_state.get("classification"), "resolution": final_state.get("resolution"), "escalation": final_state.get("escalation")},
    )
