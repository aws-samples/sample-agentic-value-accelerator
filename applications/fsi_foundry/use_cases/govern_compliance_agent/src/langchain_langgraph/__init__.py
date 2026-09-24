"""LangGraph implementation of the Govern Compliance Agent."""

from .orchestrator import GovernComplianceOrchestrator, run_compliance_audit
from .models import ComplianceAuditRequest, ComplianceAuditResponse
from .agents import PolicyAuditor, SecurityScanner, DriftDetector, RemediationPlanner
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="govern_compliance_agent",
    config=RegisteredAgent(
        entry_point=run_compliance_audit,
        request_model=ComplianceAuditRequest,
        response_model=ComplianceAuditResponse
    )
)

__all__ = [
    "GovernComplianceOrchestrator",
    "run_compliance_audit",
    "ComplianceAuditRequest",
    "ComplianceAuditResponse",
    "PolicyAuditor",
    "SecurityScanner",
    "DriftDetector",
    "RemediationPlanner",
]
