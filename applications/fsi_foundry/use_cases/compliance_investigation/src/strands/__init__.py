"""Compliance Investigation Use Case - Strands Implementation."""
from .orchestrator import ComplianceInvestigationOrchestrator, run_compliance_investigation
from .models import InvestigationRequest, InvestigationResponse
from base.registry import register_agent, RegisteredAgent

register_agent(name="compliance_investigation", config=RegisteredAgent(
    entry_point=run_compliance_investigation, request_model=InvestigationRequest, response_model=InvestigationResponse))

__all__ = ["ComplianceInvestigationOrchestrator", "run_compliance_investigation", "InvestigationRequest", "InvestigationResponse"]
