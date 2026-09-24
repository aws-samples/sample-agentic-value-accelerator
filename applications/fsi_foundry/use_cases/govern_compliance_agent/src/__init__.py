"""
Govern Compliance Agent — self-governing compliance for AVA platform.

AI-powered compliance agent that audits AgentCore runtimes, AWS security posture,
and model governance. Supports multiple agent frameworks: LangGraph (default) and Strands.

Detects:
- Policy violations and missing guardrails
- Security issues (GuardDuty, Security Hub, Config)
- Model drift and revalidation requirements

Can take control plane actions (with approval gates):
- Assign/update guardrails
- Create enforcement policies
- Adjust autonomy tiers
- Pause non-compliant agents
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from .strands.orchestrator import run_compliance_audit
    from .strands.models import ComplianceAuditRequest, ComplianceAuditResponse
    register_agent("govern_compliance_agent", RegisteredAgent(
        entry_point=run_compliance_audit,
        request_model=ComplianceAuditRequest,
        response_model=ComplianceAuditResponse
    ))
else:
    from .langchain_langgraph.orchestrator import run_compliance_audit
    from .langchain_langgraph.models import ComplianceAuditRequest, ComplianceAuditResponse
    register_agent("govern_compliance_agent", RegisteredAgent(
        entry_point=run_compliance_audit,
        request_model=ComplianceAuditRequest,
        response_model=ComplianceAuditResponse
    ))

__all__ = ["run_compliance_audit", "ComplianceAuditRequest", "ComplianceAuditResponse"]
