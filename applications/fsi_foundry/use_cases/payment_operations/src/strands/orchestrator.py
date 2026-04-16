"""Payment Operations Orchestrator (Strands)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import ExceptionHandler, SettlementAgent
from .agents.exception_handler import handle_exception
from .agents.settlement_agent import process_settlement
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    OperationsRequest, OperationsResponse, OperationType,
    ExceptionResolution, ExceptionSeverity,
    SettlementResult, SettlementStatus,
)


class PaymentOpsOrchestrator(StrandsOrchestrator):
    name = "payment_ops_orchestrator"

    system_prompt = """You are a Senior Payment Operations Supervisor.

Your role is to:
1. Coordinate exception handling and settlement processing
2. Synthesize findings into an operations decision
3. Recommend: PROCEED / HOLD / REJECT / ESCALATE

Be concise. Your summary drives operational decisions."""

    def __init__(self):
        super().__init__(agents={
            "exception_handler": ExceptionHandler(),
            "settlement_agent": SettlementAgent(),
        })

    def run_assessment(self, customer_id: str, operation_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        exception_result = None
        settlement_result = None
        input_text = self._build_input_text(customer_id, context)

        if operation_type == "full":
            results = self.run_parallel(["exception_handler", "settlement_agent"], input_text)
            exception_result = {"agent": "exception_handler", "customer_id": customer_id, "analysis": results["exception_handler"].output}
            settlement_result = {"agent": "settlement_agent", "customer_id": customer_id, "assessment": results["settlement_agent"].output}
        elif operation_type == "exception_only":
            result = self.run_agent("exception_handler", input_text)
            exception_result = {"agent": "exception_handler", "customer_id": customer_id, "analysis": result.output}
        elif operation_type == "settlement_only":
            result = self.run_agent("settlement_agent", input_text)
            settlement_result = {"agent": "settlement_agent", "customer_id": customer_id, "assessment": result.output}

        synthesis_prompt = self._build_synthesis_prompt(exception_result, settlement_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {"customer_id": customer_id, "exception_result": exception_result, "settlement_result": settlement_result, "final_summary": summary}

    async def arun_assessment(self, customer_id: str, operation_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        exception_result = None
        settlement_result = None

        if operation_type == "full":
            exception_result, settlement_result = await asyncio.gather(
                handle_exception(customer_id, context),
                process_settlement(customer_id, context),
            )
        elif operation_type == "exception_only":
            exception_result = await handle_exception(customer_id, context)
        elif operation_type == "settlement_only":
            settlement_result = await process_settlement(customer_id, context)

        synthesis_prompt = self._build_synthesis_prompt(exception_result, settlement_result)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))

        return {"customer_id": customer_id, "exception_result": exception_result, "settlement_result": settlement_result, "final_summary": summary}

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        base = f"""Analyze payment operations for: {customer_id}

Steps:
1. Retrieve payment data using s3_retriever_tool with data_type='profile'
2. Analyze all retrieved data and provide assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        for a in args:
            if isinstance(a, dict) and a:
                for k, v in a.items():
                    if v is not None: agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None: agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured assessment fields"},
            domain_context=self.system_prompt)



async def run_payment_operations(request):
    """Run the assessment workflow."""
    orchestrator = PaymentOpsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        operation_type=request.operation_type.value if hasattr(request.operation_type, 'value') else str(request.operation_type),
        context=getattr(request, 'additional_context', None))

    exception_resolution = None; settlement_result = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("exception_severity"):
            exception_resolution = ExceptionResolution(
                severity=ExceptionSeverity(structured.get("exception_severity", "medium")),
                resolution=structured.get("exception_resolution", "Pending review"),
                actions_taken=structured.get("exception_actions", []),
                requires_escalation=structured.get("exception_requires_escalation", False))
        if structured.get("settlement_status"):
            settlement_result = SettlementResult(
                status=SettlementStatus(structured.get("settlement_status", "pending")),
                settlement_date=None, reconciled=structured.get("settlement_reconciled", False),
                notes=structured.get("settlement_notes", []))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return OperationsResponse(
        customer_id=request.customer_id, operation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), exception_resolution=exception_resolution, settlement_result=settlement_result,
        summary=summary,
        raw_analysis={"exception_result": final_state.get("exception_result"), "settlement_result": final_state.get("settlement_result")},
    )
