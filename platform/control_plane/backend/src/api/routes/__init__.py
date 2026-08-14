"""
API routes
"""

from api.routes.projects import router as projects_router
from api.routes.langfuse import router as langfuse_router
from api.routes.health import router as health_router
from api.routes.templates import router as templates_router
from api.routes.bootstrap import router as bootstrap_router
from api.routes.deployments import router as deployments_router
from api.routes.applications import router as applications_router
from api.routes.app_factory import router as app_factory_router
from api.routes.users import router as users_router
from api.routes.fsi_sso import router as fsi_sso_router
from api.routes.codecommit import router as codecommit_router
from api.routes.frontier_agents import router as frontier_agents_router
from api.routes.harness import router as harness_router
from api.routes.catalog import router as catalog_router
from api.routes.memory import router as memory_router
from api.routes.mcp import router as mcp_router
from api.routes.a2a import router as a2a_router
from api.routes.identity_providers import router as identity_providers_router
from api.routes.approval_policies import router as approval_policies_router
from api.routes.approval_requests import router as approval_requests_router
from api.routes.skills import router as skills_router
from api.routes.agents import router as agents_router
from api.routes.custom_resources import router as custom_resources_router
from api.routes.guardrails import router as guardrails_router
from api.routes.prioritization import router as prioritization_router
from api.routes.maturity import router as maturity_router
from api.routes.business_cases import router as business_cases_router
from api.routes.knowledge import router as knowledge_router
from api.routes.operating_model import router as operating_model_router
from api.routes.organization_design import router as organization_design_router
from api.routes.service_approval import router as service_approval_router
from api.routes.policies import router as policies_router
from api.routes.advpo import router as advpo_router
from api.routes.llm_gateway import router as llm_gateway_router
from api.routes.govern_audit import router as govern_audit_router
from api.routes.govern_conformance import router as govern_conformance_router
from api.routes.govern_graduation import router as govern_graduation_router
from api.routes.govern_sr26 import router as govern_sr26_router
from api.routes.govern_enforcement import router as govern_enforcement_router
from api.routes.govern_a2a_trust import router as govern_a2a_trust_router
from api.routes.govern_cost import router as govern_cost_router
from api.routes.govern_models import router as govern_models_router
from api.routes.govern_posture import router as govern_posture_router
from api.routes.govern_evals import router as govern_evals_router
from api.routes.govern_risk_posture import router as govern_risk_posture_router
from api.routes.govern_trail import router as govern_trail_router
from api.routes.govern_security import router as govern_security_router
from api.routes.govern_agentcore import router as govern_agentcore_router
from api.routes.govern_guardrails import router as govern_guardrails_router
from api.routes.govern_invocation_safety import router as govern_invocation_safety_router
from api.routes.govern_data_sources import router as govern_data_sources_router
from api.routes.govern_data_catalog import router as govern_data_catalog_router
from api.routes.govern_fleet import router as govern_fleet_router
from api.routes.govern_compliance import router as govern_compliance_router
from api.routes.govern_sagemaker import router as govern_sagemaker_router
from api.routes.govern_controls import router as govern_controls_router
from api.routes.govern_developer_ai import router as govern_developer_ai_router
from api.routes.govern_guardduty_ai import router as govern_guardduty_ai_router

__all__ = [
    "projects_router",
    "langfuse_router",
    "health_router",
    "templates_router",
    "bootstrap_router",
    "deployments_router",
    "applications_router",
    "app_factory_router",
    "users_router",
    "codecommit_router",
    "frontier_agents_router",
    "harness_router",
    "catalog_router",
    "memory_router",
    "mcp_router",
    "a2a_router",
    "identity_providers_router",
    "approval_policies_router",
    "approval_requests_router",
    "skills_router",
    "agents_router",
    "custom_resources_router",
    "guardrails_router",
    "policies_router",
    "llm_gateway_router",
    "prioritization_router",
    "maturity_router",
    "business_cases_router",
    "knowledge_router",
    "operating_model_router",
    "organization_design_router",
    "service_approval_router",
    "advpo_router",
    "govern_audit_router",
    "govern_conformance_router",
    "govern_graduation_router",
    "govern_sr26_router",
    "govern_enforcement_router",
    "govern_a2a_trust_router",
    "govern_cost_router",
    "govern_models_router",
    "govern_posture_router",
    "govern_evals_router",
    "govern_risk_posture_router",
    "govern_trail_router",
    "govern_security_router",
    "govern_agentcore_router",
    "govern_guardrails_router",
    "govern_invocation_safety_router",
    "govern_data_sources_router",
    "govern_data_catalog_router",
    "govern_fleet_router",
    "govern_compliance_router",
    "govern_sagemaker_router",
    "govern_controls_router",
    "govern_developer_ai_router",
    "govern_guardduty_ai_router",
]
