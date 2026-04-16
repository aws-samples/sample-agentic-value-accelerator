"""
Agentic Payments Orchestrator (Strands Implementation).

Orchestrates specialist agents (Payment Validator, Routing Agent, Reconciliation Agent)
for comprehensive payment processing workflows.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import PaymentValidator, RoutingAgent, ReconciliationAgent
from .agents.payment_validator import validate_payment
from .agents.routing_agent import route_payment
from .agents.reconciliation_agent import reconcile_payment
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    PaymentRequest,
    PaymentResponse,
    PaymentType,
    ValidationResult,
    ValidationStatus,
    RoutingDecision,
    PaymentRail,
    ReconciliationStatus,
)


class AgenticPaymentsOrchestrator(StrandsOrchestrator):
    """
    Agentic Payments Orchestrator using StrandsOrchestrator base class.

    Coordinates Payment Validator, Routing Agent, and Reconciliation Agent
    for comprehensive payment processing.
    """

    name = "agentic_payments_orchestrator"

    system_prompt = """You are a Senior Payment Operations Supervisor for financial transaction processing.

Your role is to:
1. Coordinate the work of specialist agents (Payment Validator, Routing Agent, Reconciliation Agent)
2. Synthesize their findings into a comprehensive payment processing decision
3. Make final recommendations for payment execution

When creating the final summary, consider:
- Overall payment viability combining validation, routing, and reconciliation
- Any conflicts or concerns raised by specialist agents
- Clear recommendation: EXECUTE / REJECT / ESCALATE FOR REVIEW
- Optimal routing selection and risk mitigation strategies

Be concise but thorough. Your summary will be used by payment operations teams."""

    def __init__(self):
        super().__init__(
            agents={
                "payment_validator": PaymentValidator(),
                "routing_agent": RoutingAgent(),
                "reconciliation_agent": ReconciliationAgent(),
            }
        )

    def run_assessment(
        self,
        payment_id: str,
        payment_type: str = "wire",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the payment processing workflow.

        Args:
            payment_id: Payment identifier
            payment_type: Type of payment (wire, ach, real_time, international, domestic)
            context: Additional context for payment processing

        Returns:
            Dictionary with payment processing results
        """
        validation_result = None
        routing_result = None
        reconciliation_result = None

        input_text = self._build_input_text(payment_id, context)

        # Always run validation and routing in parallel
        results = self.run_parallel(
            ["payment_validator", "routing_agent"],
            input_text
        )
        validation_result = {
            "agent": "payment_validator",
            "payment_id": payment_id,
            "validation": results["payment_validator"].output,
        }
        routing_result = {
            "agent": "routing_agent",
            "payment_id": payment_id,
            "routing": results["routing_agent"].output,
        }

        # Run reconciliation for completed payments
        if payment_type in ["wire", "ach", "international"]:
            reconciliation = self.run_agent("reconciliation_agent", input_text)
            reconciliation_result = {
                "agent": "reconciliation_agent",
                "payment_id": payment_id,
                "reconciliation": reconciliation.output,
            }

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(
            validation_result, routing_result, reconciliation_result
        )
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "payment_id": payment_id,
            "validation_result": validation_result,
            "routing_result": routing_result,
            "reconciliation_result": reconciliation_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        payment_id: str,
        payment_type: str = "wire",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.

        Args:
            payment_id: Payment identifier
            payment_type: Type of payment
            context: Additional context for payment processing

        Returns:
            Dictionary with payment processing results
        """
        import asyncio

        validation_result = None
        routing_result = None
        reconciliation_result = None

        # Always run validation and routing in parallel
        validation_task = validate_payment(payment_id, context)
        routing_task = route_payment(payment_id, context)

        tasks = [validation_task, routing_task]

        # Add reconciliation for certain payment types
        if payment_type in ["wire", "ach", "international"]:
            tasks.append(reconcile_payment(payment_id, context))
            validation_result, routing_result, reconciliation_result = await asyncio.gather(*tasks)
        else:
            validation_result, routing_result = await asyncio.gather(*tasks)

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(
            validation_result, routing_result, reconciliation_result
        )

        # Run synthesis in executor since Strands is synchronous
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "payment_id": payment_id,
            "validation_result": validation_result,
            "routing_result": routing_result,
            "reconciliation_result": reconciliation_result,
            "final_summary": summary,
        }

    def _build_input_text(self, payment_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform comprehensive analysis for payment: {payment_id}

Steps to follow:
1. Retrieve the payment profile data using the s3_retriever_tool with data_type='profile'
2. Analyze all payment data and provide complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        validation_result: Dict[str, Any] | None,
        routing_result: Dict[str, Any] | None,
        reconciliation_result: Dict[str, Any] | None
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if validation_result:
            sections.append(f"## Payment Validation\n{json.dumps(validation_result, indent=2)}")
        if routing_result:
            sections.append(f"## Payment Routing\n{json.dumps(routing_result, indent=2)}")
        if reconciliation_result:
            sections.append(f"## Payment Reconciliation\n{json.dumps(reconciliation_result, indent=2)}")

        return f"""Based on the following specialist assessments, provide a final payment processing recommendation:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Overall Payment Status (APPROVED/REJECTED/REQUIRES_REVIEW)
2. Validation Assessment (rules checked, violations, sanctions status)
3. Routing Recommendation (selected rail, cost, settlement time)
4. {"Reconciliation Status (matched, discrepancies)" if reconciliation_result else "Reconciliation: N/A"}
5. Final Recommendation (EXECUTE/REJECT/ESCALATE)
6. Critical findings that influenced the decision"""



async def run_agentic_payments(request):
    """Run the assessment workflow."""
    orchestrator = AgenticPaymentsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        payment_id=request.payment_id,
        payment_type=request.payment_type.value if hasattr(request.payment_type, 'value') else str(request.payment_type),
        context=getattr(request, 'additional_context', None))

    validation_result = None; routing_decision = None; reconciliation_status = ReconciliationStatus.PENDING
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("validation_status"):
            validation_result = ValidationResult(
                status=ValidationStatus(structured.get("validation_status", "requires_review")),
                rules_checked=structured.get("validation_rules_checked", []),
                violations=structured.get("validation_violations", []),
                sanctions_clear=structured.get("validation_sanctions_clear", True),
                risk_score=structured.get("validation_risk_score", 50),
                notes=["Validation completed"])
        if structured.get("routing_selected_rail"):
            routing_decision = RoutingDecision(
                selected_rail=PaymentRail(structured.get("routing_selected_rail", "fedwire")),
                alternative_rails=[],
                estimated_settlement_time=structured.get("routing_settlement_time", "Same day"),
                routing_cost=structured.get("routing_cost", 25.0),
                routing_rationale=structured.get("routing_rationale", ""))
        if structured.get("reconciliation_status"):
            reconciliation_status = ReconciliationStatus(structured.get("reconciliation_status", "pending"))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return PaymentResponse(
        payment_id=request.payment_id, transaction_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), validation_result=validation_result, routing_decision=routing_decision, reconciliation_status=reconciliation_status,
        summary=summary,
        raw_analysis={"validation_result": final_state.get("validation_result"), "routing_result": final_state.get("routing_result"), "reconciliation_result": final_state.get("reconciliation_result")},
    )
