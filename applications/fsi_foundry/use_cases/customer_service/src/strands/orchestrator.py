"""
Customer Service Orchestrator (Strands Implementation).

Orchestrates specialist agents (Inquiry Handler, Transaction Specialist, Product Advisor)
for comprehensive customer service resolution in banking.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor

from base.strands import StrandsOrchestrator
from .agents import InquiryHandler, TransactionSpecialist, ProductAdvisor
from .agents.inquiry_handler import handle_inquiry
from .agents.transaction_specialist import investigate_transaction
from .agents.product_advisor import advise_products
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ServiceRequest,
    ServiceResponse,
    InquiryType,
    ResolutionDetail,
    ResolutionStatus,
    Priority,
)


class CustomerServiceOrchestrator(StrandsOrchestrator):
    """
    Customer Service Orchestrator using StrandsOrchestrator base class.

    Coordinates Inquiry Handler, Transaction Specialist, and Product Advisor
    agents for comprehensive customer service resolution.
    """

    name = "customer_service_orchestrator"

    system_prompt = """You are a Senior Customer Service Supervisor for a banking institution.

Your role is to:
1. Coordinate specialist agents (Inquiry Handler, Transaction Specialist, Product Advisor)
2. Synthesize their findings into a comprehensive customer service resolution
3. Ensure customer inquiries are resolved efficiently and satisfactorily

When creating the final summary, consider:
- Resolution status and completeness of the customer's inquiry
- Any escalation needs or follow-up actions required
- Product recommendations that match the customer's profile and needs
- Clear next steps for the customer
- Overall service quality and satisfaction indicators

Be concise but thorough. Your summary will be used by customer service representatives."""

    def __init__(self):
        super().__init__(
            agents={
                "inquiry_handler": InquiryHandler(),
                "transaction_specialist": TransactionSpecialist(),
                "product_advisor": ProductAdvisor(),
            }
        )

    def run_assessment(
        self,
        customer_id: str,
        inquiry_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Run the customer service workflow.

        Args:
            customer_id: Customer identifier
            inquiry_type: Type of inquiry (full, general, transaction_dispute, product_inquiry, service_request)
            context: Additional context for the inquiry

        Returns:
            Dictionary with service results
        """
        inquiry_result = None
        transaction_result = None
        product_result = None

        input_text = self._build_input_text(customer_id, context)

        if inquiry_type == "full":
            # Run all three agents in parallel
            results = self.run_parallel(
                ["inquiry_handler", "transaction_specialist", "product_advisor"],
                input_text
            )
            inquiry_result = {
                "agent": "inquiry_handler",
                "customer_id": customer_id,
                "analysis": results["inquiry_handler"].output,
            }
            transaction_result = {
                "agent": "transaction_specialist",
                "customer_id": customer_id,
                "analysis": results["transaction_specialist"].output,
            }
            product_result = {
                "agent": "product_advisor",
                "customer_id": customer_id,
                "analysis": results["product_advisor"].output,
            }
        elif inquiry_type == "general":
            result = self.run_agent("inquiry_handler", input_text)
            inquiry_result = {
                "agent": "inquiry_handler",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif inquiry_type == "transaction_dispute":
            result = self.run_agent("transaction_specialist", input_text)
            transaction_result = {
                "agent": "transaction_specialist",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif inquiry_type == "product_inquiry":
            result = self.run_agent("product_advisor", input_text)
            product_result = {
                "agent": "product_advisor",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif inquiry_type == "service_request":
            # Run inquiry handler and transaction specialist in parallel
            results = self.run_parallel(
                ["inquiry_handler", "transaction_specialist"],
                input_text
            )
            inquiry_result = {
                "agent": "inquiry_handler",
                "customer_id": customer_id,
                "analysis": results["inquiry_handler"].output,
            }
            transaction_result = {
                "agent": "transaction_specialist",
                "customer_id": customer_id,
                "analysis": results["transaction_specialist"].output,
            }

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(
            inquiry_result, transaction_result, product_result
        )
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "customer_id": customer_id,
            "inquiry_result": inquiry_result,
            "transaction_result": transaction_result,
            "product_result": product_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        customer_id: str,
        inquiry_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.

        Args:
            customer_id: Customer identifier
            inquiry_type: Type of inquiry (full, general, transaction_dispute, product_inquiry, service_request)
            context: Additional context for the inquiry

        Returns:
            Dictionary with service results
        """
        import asyncio

        inquiry_result = None
        transaction_result = None
        product_result = None

        if inquiry_type == "full":
            # Run all three agents in parallel using standalone functions
            inquiry_result, transaction_result, product_result = await asyncio.gather(
                handle_inquiry(customer_id, context),
                investigate_transaction(customer_id, context),
                advise_products(customer_id, context)
            )
        elif inquiry_type == "general":
            inquiry_result = await handle_inquiry(customer_id, context)
        elif inquiry_type == "transaction_dispute":
            transaction_result = await investigate_transaction(customer_id, context)
        elif inquiry_type == "product_inquiry":
            product_result = await advise_products(customer_id, context)
        elif inquiry_type == "service_request":
            # Run inquiry handler and transaction specialist in parallel
            inquiry_result, transaction_result = await asyncio.gather(
                handle_inquiry(customer_id, context),
                investigate_transaction(customer_id, context)
            )

        # Synthesize results
        synthesis_prompt = self._build_synthesis_prompt(
            inquiry_result, transaction_result, product_result
        )

        # Run synthesis in executor since Strands is synchronous
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "customer_id": customer_id,
            "inquiry_result": inquiry_result,
            "transaction_result": transaction_result,
            "product_result": product_result,
            "final_summary": summary,
        }

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant history data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        inquiry_result: Dict[str, Any] | None,
        transaction_result: Dict[str, Any] | None,
        product_result: Dict[str, Any] | None
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if inquiry_result:
            sections.append(f"## Inquiry Analysis\n{json.dumps(inquiry_result, indent=2)}")
        if transaction_result:
            sections.append(f"## Transaction Investigation\n{json.dumps(transaction_result, indent=2)}")
        if product_result:
            sections.append(f"## Product Advisory\n{json.dumps(product_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final customer service resolution:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Resolution Status (RESOLVED/PENDING/ESCALATED)
2. Priority Level (LOW/MEDIUM/HIGH/URGENT)
3. Actions Taken (list of steps completed)
4. Follow-up Requirements (if any)
5. Product Recommendations (if applicable)
6. Key findings that influenced the resolution"""



async def run_customer_service(request):
    """Run the assessment workflow."""
    orchestrator = CustomerServiceOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        inquiry_type=request.inquiry_type.value if hasattr(request.inquiry_type, 'value') else str(request.inquiry_type),
        context=getattr(request, 'additional_context', None))

    resolution = None; recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("resolution_status"):
            resolution = ResolutionDetail(
                status=structured.get("resolution_status", "pending"),
                actions_taken=structured.get("resolution_actions_taken", []),
                follow_up_required=structured.get("resolution_follow_up_required", False))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ServiceResponse(
        customer_id=request.customer_id, service_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), resolution=resolution, recommendations=recommendations,
        summary=summary,
        raw_analysis={"inquiry_result": final_state.get("inquiry_result"), "transaction_result": final_state.get("transaction_result"), "product_result": final_state.get("product_result")},
    )
