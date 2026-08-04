"""
Deployment hooks for LiteLLM Gateway integration.

Hooks into the existing deployment flow to:
- On deploy: provision a LiteLLM virtual key with budget/model scope,
  store the secret name in the DynamoDB deployment record, and inject
  gateway environment variables into the agent's ECS task.
- On undeploy: revoke the virtual key and clean up Secrets Manager.

These hooks are called by the deployment routes after the core deployment
record is created (on deploy) or before the destroy pipeline runs (on undeploy).
"""

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from services.litellm_provisioning import (
    BudgetConfig,
    DuplicateKeyError,
    KeyRevocationError,
    LiteLLMProvisioningService,
    ProvisioningError,
    VirtualKeyResult,
)

logger = logging.getLogger(__name__)

# Environment variable names injected into agent ECS tasks
ENV_GATEWAY_URL = "LITELLM_GATEWAY_URL"
ENV_VIRTUAL_KEY_SECRET = "LITELLM_VIRTUAL_KEY_SECRET"

# Default budget configuration for use cases without explicit budget
DEFAULT_BUDGET_USD = 500.0
DEFAULT_BUDGET_DURATION = "monthly"
DEFAULT_RPM_LIMIT = 100
DEFAULT_TPM_LIMIT = 100_000


@dataclass
class DeploymentGatewayConfig:
    """Configuration extracted from deployment parameters for gateway provisioning.

    Attributes:
        use_case: The use case identifier (e.g., "kyc_banking").
        team: The team identifier (e.g., "fsi-compliance").
        budget_usd: Monthly budget in USD.
        budget_duration: Budget reset period ("monthly", "daily").
        models: List of model identifiers this use case can access.
        rpm_limit: Requests per minute limit.
        tpm_limit: Tokens per minute limit.
    """

    use_case: str
    team: str
    budget_usd: float = DEFAULT_BUDGET_USD
    budget_duration: str = DEFAULT_BUDGET_DURATION
    models: List[str] = None
    rpm_limit: int = DEFAULT_RPM_LIMIT
    tpm_limit: int = DEFAULT_TPM_LIMIT

    def __post_init__(self):
        if self.models is None:
            self.models = []


@dataclass
class GatewayProvisioningResult:
    """Result of gateway provisioning during deployment.

    Attributes:
        secret_name: The Secrets Manager secret name for the virtual key.
        gateway_url: The LiteLLM gateway URL.
        env_vars: Environment variables to inject into the agent task.
        key_name: The LiteLLM key alias.
    """

    secret_name: str
    gateway_url: str
    env_vars: Dict[str, str]
    key_name: str


def extract_gateway_config(
    template_id: str,
    deployment_name: str,
    parameters: Dict[str, Any],
) -> DeploymentGatewayConfig:
    """Extract gateway configuration from deployment parameters.

    Derives the use case name, team, budget, and model list from the
    deployment's template_id and parameters dict.

    Args:
        template_id: The deployment template identifier.
        deployment_name: The human-readable deployment name.
        parameters: The deployment parameters dict.

    Returns:
        DeploymentGatewayConfig with extracted settings.
    """
    # Derive use_case from template_id (strip "foundry-" prefix if present)
    use_case = template_id
    if template_id.startswith("foundry-"):
        use_case = template_id[len("foundry-"):]

    # Extract team from parameters or default
    team = parameters.get("team", parameters.get("team_id", "default"))

    # Extract budget from parameters
    budget_usd = float(parameters.get("gateway_budget_usd", DEFAULT_BUDGET_USD))
    budget_duration = parameters.get(
        "gateway_budget_duration", DEFAULT_BUDGET_DURATION
    )

    # Extract model list from parameters
    models_param = parameters.get("gateway_models", [])
    if isinstance(models_param, str):
        models = [m.strip() for m in models_param.split(",") if m.strip()]
    elif isinstance(models_param, list):
        models = models_param
    else:
        models = []

    # Extract rate limits
    rpm_limit = int(parameters.get("gateway_rpm_limit", DEFAULT_RPM_LIMIT))
    tpm_limit = int(parameters.get("gateway_tpm_limit", DEFAULT_TPM_LIMIT))

    return DeploymentGatewayConfig(
        use_case=use_case,
        team=team,
        budget_usd=budget_usd,
        budget_duration=budget_duration,
        models=models,
        rpm_limit=rpm_limit,
        tpm_limit=tpm_limit,
    )


def on_deploy(
    template_id: str,
    deployment_name: str,
    parameters: Dict[str, Any],
    provisioning_service: LiteLLMProvisioningService,
    gateway_url: str,
) -> GatewayProvisioningResult:
    """Hook called during use case deployment to provision a gateway virtual key.

    This function:
    1. Extracts gateway configuration from deployment parameters.
    2. Calls provision_key() to create a LiteLLM virtual key with budget/models.
    3. Builds environment variables for the agent's ECS task.
    4. Returns the result including the secret name to store in the deployment record.

    Args:
        template_id: The deployment template identifier.
        deployment_name: The human-readable deployment name.
        parameters: The deployment parameters dict.
        provisioning_service: The LiteLLM provisioning service instance.
        gateway_url: The LiteLLM gateway URL (e.g., "https://gateway.internal:4000").

    Returns:
        GatewayProvisioningResult with secret name, env vars, etc.

    Raises:
        ProvisioningError: If key provisioning fails after retries.
        DuplicateKeyError: If an active key already exists for this use case.
    """
    config = extract_gateway_config(template_id, deployment_name, parameters)

    budget = BudgetConfig(
        max_budget=config.budget_usd,
        budget_duration=config.budget_duration,
        rpm_limit=config.rpm_limit,
        tpm_limit=config.tpm_limit,
    )

    logger.info(
        "Provisioning gateway key for use_case=%s, team=%s, "
        "budget=%.2f %s, models=%d",
        config.use_case,
        config.team,
        config.budget_usd,
        config.budget_duration,
        len(config.models),
    )

    # Validate team budget cap before provisioning
    try:
        from core.config import settings
        team_budget_cap = settings.LITELLM_TEAM_BUDGET_CAP_USD
    except Exception:
        team_budget_cap = 10000.0
    provisioning_service.validate_team_budget_cap(
        team=config.team,
        team_budget_cap=team_budget_cap,
        new_use_case_budget=config.budget_usd,
    )

    result = provisioning_service.provision_key(
        use_case=config.use_case,
        team=config.team,
        budget=budget,
        models=config.models,
    )

    # Build environment variables for the agent ECS task
    env_vars = {
        ENV_GATEWAY_URL: gateway_url,
        ENV_VIRTUAL_KEY_SECRET: result.secret_name,
    }

    logger.info(
        "Gateway provisioning complete: use_case=%s, secret=%s",
        config.use_case,
        result.secret_name,
    )

    return GatewayProvisioningResult(
        secret_name=result.secret_name,
        gateway_url=gateway_url,
        env_vars=env_vars,
        key_name=result.key_name,
    )


def on_undeploy(
    template_id: str,
    parameters: Dict[str, Any],
    provisioning_service: LiteLLMProvisioningService,
) -> None:
    """Hook called during use case undeployment to revoke the gateway virtual key.

    This function:
    1. Derives the use case name from template_id.
    2. Calls revoke_key() to revoke the LiteLLM key and delete the Secrets Manager entry.

    Args:
        template_id: The deployment template identifier.
        parameters: The deployment parameters dict.
        provisioning_service: The LiteLLM provisioning service instance.

    Raises:
        KeyRevocationError: If key revocation fails.
    """
    # Derive use_case from template_id
    use_case = template_id
    if template_id.startswith("foundry-"):
        use_case = template_id[len("foundry-"):]

    logger.info("Revoking gateway key for use_case=%s", use_case)

    provisioning_service.revoke_key(use_case)

    logger.info("Gateway key revoked for use_case=%s", use_case)


def build_deployment_outputs(
    existing_outputs: Dict[str, str],
    gateway_result: GatewayProvisioningResult,
) -> Dict[str, str]:
    """Merge gateway provisioning outputs into the deployment record outputs.

    Adds the virtual key secret name and gateway URL to the deployment's
    outputs dict for storage in DynamoDB.

    Args:
        existing_outputs: Current deployment outputs dict.
        gateway_result: The gateway provisioning result.

    Returns:
        Updated outputs dict with gateway fields added.
    """
    updated = dict(existing_outputs)
    updated["gateway_key_secret"] = gateway_result.secret_name
    updated["gateway_url"] = gateway_result.gateway_url
    updated["gateway_key_name"] = gateway_result.key_name
    return updated


def get_provisioning_service(
    gateway_url: Optional[str] = None,
    master_key: Optional[str] = None,
    region: Optional[str] = None,
) -> Optional[LiteLLMProvisioningService]:
    """Create a LiteLLMProvisioningService from environment or explicit args.

    Returns None if gateway_url or master_key are not available (gateway
    not configured for this environment).

    Args:
        gateway_url: LiteLLM gateway URL. Falls back to LITELLM_GATEWAY_URL env var.
        master_key: LiteLLM master key. Falls back to LITELLM_MASTER_KEY env var.
        region: AWS region. Falls back to AWS_REGION env var or "us-east-2".

    Returns:
        A configured LiteLLMProvisioningService or None if not configured.
    """
    url = gateway_url or os.environ.get("LITELLM_GATEWAY_URL", "")
    key = master_key or os.environ.get("LITELLM_MASTER_KEY", "")
    aws_region = region or os.environ.get("AWS_REGION", "us-east-2")

    if not url or not key:
        logger.debug(
            "LiteLLM gateway not configured (LITELLM_GATEWAY_URL=%s, "
            "LITELLM_MASTER_KEY=%s)",
            bool(url),
            bool(key),
        )
        return None

    return LiteLLMProvisioningService(
        gateway_url=url,
        master_key=key,
        region=aws_region,
    )
