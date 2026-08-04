"""Pipeline input dataclasses — one shape per deployment type.

The deployment Step Functions state machine (see
platform/control_plane/infrastructure/modules/step_functions/main.tf,
InvokeCodeBuild.EnvironmentVariablesOverride) reads every env var from a
fixed set of JSONPaths under `$.parameters`. If any key is missing, the
state machine fails at execution time with "JSONPath could not be found".

This module is the single source of truth for that key set. Every route
that calls sfn_client.start_execution() for the deployment pipeline MUST
build its `parameters` dict through one of these classes.

Adding a new env var override in Terraform? Add a field + safe default
below. That's the only change required — every caller inherits the new
default and stays compatible.
"""

from dataclasses import dataclass, asdict
from typing import Dict


@dataclass
class PipelineInput:
    """Base class — every SFN-mapped env var is a field here with a default.

    Subclasses exist for clarity at call sites (FoundryPipelineInput,
    AppFactoryPipelineInput, TemplatePipelineInput) but share the same
    fields — the type tag is primarily documentation of intent.
    """
    use_case_id: str
    framework: str = "strands"
    deployment_pattern: str = "agentcore"
    enable_tracing: str = "false"
    langfuse_host: str = ""
    langfuse_secret_name: str = ""
    guardrail_id: str = ""
    guardrail_version: str = ""
    submission_id: str = ""
    app_factory_table_name: str = ""
    enable_agentcore_observability: str = "false"
    enable_xray_transaction_search: str = "false"
    create_fleet_dashboard: str = "false"
    # LLM Gateway routing — auto-injected by the deploy handler when a
    # gateway is present in the same account. When empty, foundations
    # falls back to direct Bedrock SDK.
    llm_gateway_base_url: str = ""
    llm_gateway_api_key_secret_arn: str = ""

    def to_sfn_parameters(self) -> Dict[str, str]:
        """Return the UPPERCASE dict consumed by $.parameters in the SFN."""
        d = asdict(self)
        out = {
            "USE_CASE_ID":            d["use_case_id"],
            "FRAMEWORK":              d["framework"],
            "DEPLOYMENT_PATTERN":     d["deployment_pattern"],
            "ENABLE_TRACING":         d["enable_tracing"],
            "LANGFUSE_HOST":          d["langfuse_host"],
            "LANGFUSE_SECRET_NAME":   d["langfuse_secret_name"],
            "GUARDRAIL_ID":           d["guardrail_id"],
            "GUARDRAIL_VERSION":      d["guardrail_version"],
            "SUBMISSION_ID":          d["submission_id"],
            "APP_FACTORY_TABLE_NAME": d["app_factory_table_name"],
            "ENABLE_AGENTCORE_OBSERVABILITY": d["enable_agentcore_observability"],
            "ENABLE_XRAY_TRANSACTION_SEARCH": d["enable_xray_transaction_search"],
            "CREATE_FLEET_DASHBOARD":         d["create_fleet_dashboard"],
            "LLM_GATEWAY_BASE_URL":           d["llm_gateway_base_url"],
            "LLM_GATEWAY_API_KEY_SECRET_ARN": d["llm_gateway_api_key_secret_arn"],
        }
        return {k: ("" if v is None else str(v)) for k, v in out.items()}

    @classmethod
    def from_dict(cls, params: Dict[str, str], **overrides) -> "PipelineInput":
        """Build from a loose dict (e.g. DeploymentCreate.parameters).

        Unknown keys in `params` are ignored — callers may carry extra
        fields in `deployment.parameters` for audit, but only SFN-mapped
        keys ever reach the state machine.
        """
        p = params or {}
        known = {
            "use_case_id":            p.get("USE_CASE_ID", ""),
            "framework":              p.get("FRAMEWORK", "strands"),
            "deployment_pattern":     p.get("DEPLOYMENT_PATTERN", "agentcore"),
            "enable_tracing":         p.get("ENABLE_TRACING", "false"),
            "langfuse_host":          p.get("LANGFUSE_HOST", ""),
            "langfuse_secret_name":   p.get("LANGFUSE_SECRET_NAME", ""),
            "guardrail_id":           p.get("GUARDRAIL_ID", ""),
            "guardrail_version":      p.get("GUARDRAIL_VERSION", ""),
            "submission_id":          p.get("SUBMISSION_ID", ""),
            "app_factory_table_name": p.get("APP_FACTORY_TABLE_NAME", ""),
            "enable_agentcore_observability": p.get("ENABLE_AGENTCORE_OBSERVABILITY", "false"),
            "enable_xray_transaction_search": p.get("ENABLE_XRAY_TRANSACTION_SEARCH", "false"),
            "create_fleet_dashboard":         p.get("CREATE_FLEET_DASHBOARD", "false"),
            "llm_gateway_base_url":           p.get("LLM_GATEWAY_BASE_URL", ""),
            "llm_gateway_api_key_secret_arn": p.get("LLM_GATEWAY_API_KEY_SECRET_ARN", ""),
        }
        known.update(overrides)
        return cls(**known)


@dataclass
class FoundryPipelineInput(PipelineInput):
    """FSI Foundry use cases (S3 Quick Deploy + Deploy-from-Git)."""
    pass


@dataclass
class AppFactoryPipelineInput(PipelineInput):
    """App Factory — submission_id + app_factory_table_name required by builder.py."""
    pass


@dataclass
class TemplatePipelineInput(PipelineInput):
    """Starter templates via /deployments endpoint."""
    pass
