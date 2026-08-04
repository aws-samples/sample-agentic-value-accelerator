"""
Config Generator service for LiteLLM Gateway.

Produces LiteLLM config.yaml from AVA's model catalog. The generated config
includes model_list, litellm_settings, general_settings, and router_settings
sections required by the LiteLLM proxy. Validates configs against a JSON
schema, publishes versioned configs to S3, and triggers ECS rolling deployments.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
import jsonschema
import yaml

logger = logging.getLogger(__name__)

# Provider prefix mapping: AVA provider name → LiteLLM model prefix
PROVIDER_PREFIX_MAP: Dict[str, str] = {
    "bedrock": "bedrock/",
    "bedrock-mantle": "bedrock_mantle/",
}

# S3 bucket and prefix for config version history — read from settings at runtime
CONFIG_S3_BUCKET = "ava-litellm-config"
CONFIG_S3_PREFIX = "litellm"

# Try to read from settings if available
try:
    from core.config import settings as _settings
    if _settings.LITELLM_CONFIG_S3_BUCKET:
        CONFIG_S3_BUCKET = _settings.LITELLM_CONFIG_S3_BUCKET
    if _settings.LITELLM_CONFIG_S3_PREFIX:
        CONFIG_S3_PREFIX = _settings.LITELLM_CONFIG_S3_PREFIX
except Exception:
    pass  # Use defaults if settings not available (e.g., in tests)

# ECS service identifiers for rolling deployments
ECS_CLUSTER_NAME = "ava-control-plane"
ECS_SERVICE_NAME = "ava-litellm"

# Override ECS identifiers from settings if configured
try:
    from core.config import settings as _settings
    if _settings.LITELLM_ECS_CLUSTER:
        ECS_CLUSTER_NAME = _settings.LITELLM_ECS_CLUSTER
    if _settings.LITELLM_ECS_SERVICE:
        ECS_SERVICE_NAME = _settings.LITELLM_ECS_SERVICE
except Exception:
    pass

# LiteLLM configuration JSON Schema for validation
LITELLM_CONFIG_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "LiteLLM Configuration",
    "type": "object",
    "required": ["model_list", "litellm_settings", "general_settings", "router_settings"],
    "properties": {
        "model_list": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["model_name", "litellm_params"],
                "properties": {
                    "model_name": {"type": "string", "minLength": 1},
                    "litellm_params": {
                        "type": "object",
                        "required": ["model"],
                        "properties": {
                            "model": {"type": "string", "minLength": 1},
                            "aws_region_name": {"type": "string"},
                            "api_key": {"type": "string"},
                            "api_base": {"type": "string"},
                        },
                    },
                    "model_info": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "mode": {
                                "type": "string",
                                "enum": ["chat", "embedding", "completion"],
                            },
                            "input_cost_per_token": {"type": "number", "minimum": 0},
                            "output_cost_per_token": {"type": "number", "minimum": 0},
                            "max_input_tokens": {"type": "integer", "minimum": 0},
                            "max_output_tokens": {"type": "integer", "minimum": 0},
                        },
                    },
                },
            },
        },
        "litellm_settings": {
            "type": "object",
            "properties": {
                "drop_params": {"type": "boolean"},
                "set_verbose": {"type": "boolean"},
                "cache": {"type": "boolean"},
                "cache_params": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "host": {"type": "string"},
                        "port": {"type": "integer"},
                        "password": {"type": "string"},
                    },
                },
                "success_callback": {"type": "array", "items": {"type": "string"}},
                "failure_callback": {"type": "array", "items": {"type": "string"}},
                "custom_callback": {"type": "string"},
                "langfuse_default_tags": {"type": "array", "items": {"type": "string"}},
                "langfuse_flush_at": {"type": "integer", "minimum": 1},
                "langfuse_flush_interval": {"type": "integer", "minimum": 1},
                "num_retries": {"type": "integer", "minimum": 0},
                "request_timeout": {"type": "integer", "minimum": 1},
            },
        },
        "general_settings": {
            "type": "object",
            "required": ["master_key", "database_url"],
            "properties": {
                "master_key": {"type": "string", "minLength": 1},
                "database_url": {"type": "string", "minLength": 1},
                "alerting": {"type": "array", "items": {"type": "string"}},
                "alert_types": {"type": "array", "items": {"type": "string"}},
                "alerting_args": {
                    "type": "object",
                    "properties": {
                        "slack_webhook_url": {"type": "string"},
                        "budget_alert_ttl": {"type": "integer", "minimum": 0},
                    },
                },
                "budget_alert_threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "enforce_budget": {"type": "boolean"},
                "budget_enforcement_action": {"type": "string"},
                "retry_after_seconds": {"type": "integer", "minimum": 0},
                "rate_limit_enforcement": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "default_rpm_limit": {"type": "integer", "minimum": 1},
                        "default_tpm_limit": {"type": "integer", "minimum": 1},
                        "include_retry_after_header": {"type": "boolean"},
                        "retry_after_seconds": {"type": "integer", "minimum": 0},
                    },
                },
                "global_max_parallel_requests": {"type": "integer", "minimum": 1},
                "max_request_size_mb": {"type": "integer", "minimum": 1},
                "custom_headers": {"type": "object"},
            },
        },
        "router_settings": {
            "type": "object",
            "properties": {
                "routing_strategy": {"type": "string"},
                "num_retries": {"type": "integer", "minimum": 0},
                "timeout": {"type": "integer", "minimum": 1},
                "fallbacks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["model_name", "fallback_models"],
                        "properties": {
                            "model_name": {"type": "string"},
                            "fallback_models": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
            },
        },
    },
}


@dataclass
class ValidationResult:
    """Result of config validation against LiteLLM schema.

    Attributes:
        is_valid: Whether the config passes schema validation.
        errors: List of validation error messages (empty if valid).
    """

    is_valid: bool
    errors: List[str] = field(default_factory=list)


@dataclass
class ModelCatalogEntry:
    """Represents a single model in AVA's model catalog.

    Attributes:
        model_id: The full model identifier (e.g. "us.anthropic.claude-sonnet-4-20250514-v1:0")
        display_name: Human-readable model name (e.g. "Claude Sonnet 4")
        provider: Provider type ("bedrock" or "bedrock-mantle")
        litellm_prefix: LiteLLM routing prefix ("bedrock/" or "bedrock_mantle/")
        region: AWS region for the model endpoint (e.g. "us-east-2")
        mode: Model capability mode ("chat" or "embedding")
        input_cost_per_token: Cost per input token in USD
        output_cost_per_token: Cost per output token in USD
        max_input_tokens: Maximum input token count supported
        max_output_tokens: Maximum output token count supported
        active: Whether the model is currently active
        fallback_models: Ordered list of fallback model IDs for this model
    """

    model_id: str
    display_name: str
    provider: str
    litellm_prefix: str
    region: str
    mode: str
    input_cost_per_token: float = 0.0
    output_cost_per_token: float = 0.0
    max_input_tokens: int = 0
    max_output_tokens: int = 0
    active: bool = True
    fallback_models: List[str] = field(default_factory=list)


class ConfigGenerator:
    """Generates LiteLLM config.yaml from AVA's model catalog.

    The generator reads model catalog entries and produces a complete LiteLLM
    proxy configuration including model routing, caching, observability,
    and fallback chain settings. Also handles validation, S3 publishing,
    and ECS rolling deployment triggers.
    """

    def __init__(
        self,
        s3_client: Optional[Any] = None,
        ecs_client: Optional[Any] = None,
        s3_bucket: str = CONFIG_S3_BUCKET,
        s3_prefix: str = CONFIG_S3_PREFIX,
        ecs_cluster: str = ECS_CLUSTER_NAME,
        ecs_service: str = ECS_SERVICE_NAME,
    ):
        """Initialize ConfigGenerator with optional AWS clients.

        Args:
            s3_client: Boto3 S3 client. Created on demand if not provided.
            ecs_client: Boto3 ECS client. Created on demand if not provided.
            s3_bucket: S3 bucket name for config storage.
            s3_prefix: S3 key prefix for config files.
            ecs_cluster: ECS cluster name for rolling deployments.
            ecs_service: ECS service name for rolling deployments.
        """
        self._s3_client = s3_client
        self._ecs_client = ecs_client
        self._s3_bucket = s3_bucket
        self._s3_prefix = s3_prefix
        self._ecs_cluster = ecs_cluster
        self._ecs_service = ecs_service

    @property
    def s3_client(self):
        """Lazily create S3 client if not injected."""
        if self._s3_client is None:
            self._s3_client = boto3.client("s3")
        return self._s3_client

    @property
    def ecs_client(self):
        """Lazily create ECS client if not injected."""
        if self._ecs_client is None:
            self._ecs_client = boto3.client("ecs")
        return self._ecs_client

    def generate(self, model_catalog: List[ModelCatalogEntry]) -> str:
        """Generate config.yaml content from the model catalog.

        Produces a valid LiteLLM configuration with:
        - model_list: one entry per active catalog model with correct provider prefix
        - litellm_settings: caching, callbacks, retry/timeout settings
        - general_settings: master key, database, alerting
        - router_settings: routing strategy, retries, fallback chains

        Args:
            model_catalog: List of ModelCatalogEntry instances from AVA's catalog.

        Returns:
            A YAML string representing the complete LiteLLM config.
        """
        config = {
            "model_list": self._build_model_list(model_catalog),
            "litellm_settings": self._build_litellm_settings(),
            "general_settings": self._build_general_settings(),
            "router_settings": self._build_router_settings(model_catalog),
        }

        logger.info(
            "Generated LiteLLM config with %d model(s)", len(model_catalog)
        )

        return yaml.dump(config, default_flow_style=False, sort_keys=False)

    def validate(self, config_yaml: str) -> "ValidationResult":
        """Validate a config YAML string against LiteLLM's configuration schema.

        Parses the YAML and validates the resulting dict against the
        LITELLM_CONFIG_SCHEMA JSON Schema.

        Args:
            config_yaml: A YAML string representing the LiteLLM config.

        Returns:
            A ValidationResult indicating whether the config is valid,
            with any error messages if validation failed.
        """
        try:
            config = yaml.safe_load(config_yaml)
        except yaml.YAMLError as e:
            return ValidationResult(
                is_valid=False,
                errors=[f"YAML parse error: {e}"],
            )

        if config is None:
            return ValidationResult(
                is_valid=False,
                errors=["Config is empty (parsed to None)"],
            )

        validator = jsonschema.Draft7Validator(LITELLM_CONFIG_SCHEMA)
        errors = sorted(validator.iter_errors(config), key=lambda e: list(e.path))

        if errors:
            error_messages = []
            for error in errors:
                path = ".".join(str(p) for p in error.absolute_path)
                msg = f"{path}: {error.message}" if path else error.message
                error_messages.append(msg)
            return ValidationResult(is_valid=False, errors=error_messages)

        return ValidationResult(is_valid=True, errors=[])

    def publish(self, config_yaml: str, version: Optional[str] = None) -> str:
        """Upload a versioned config to S3.

        Stores the config at `s3://{bucket}/{prefix}/config-{version}.yaml`.
        If no version is provided, a UTC timestamp is used.

        Args:
            config_yaml: The validated config YAML string to upload.
            version: Optional version identifier. Defaults to UTC timestamp
                     in ISO format (e.g., "20250615T120000Z").

        Returns:
            The full S3 key where the config was stored.

        Raises:
            botocore.exceptions.ClientError: If the S3 upload fails.
        """
        if version is None:
            version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

        s3_key = f"{self._s3_prefix}/config-{version}.yaml"

        self.s3_client.put_object(
            Bucket=self._s3_bucket,
            Key=s3_key,
            Body=config_yaml.encode("utf-8"),
            ContentType="text/yaml",
            Metadata={
                "version": version,
                "generator": "ava-config-generator",
            },
        )

        # Also write as latest pointer so fresh ECS tasks can boot
        latest_key = f"{self._s3_prefix}/config-latest.yaml"
        self.s3_client.put_object(
            Bucket=self._s3_bucket,
            Key=latest_key,
            Body=config_yaml.encode("utf-8"),
            ContentType="text/yaml",
            Metadata={"version": version, "generator": "ava-config-generator"},
        )

        logger.info(
            "Published config version %s to s3://%s/%s (+ latest)",
            version,
            self._s3_bucket,
            s3_key,
        )

        return s3_key

    def trigger_rolling_update(self, version: str) -> str:
        """Trigger an ECS rolling deployment with the new config version.

        Registers a new task definition revision with the updated
        LITELLM_CONFIG_S3_URI pointing to the new config version, then
        updates the ECS service to use that revision. The ECS deployment
        circuit breaker ensures automatic rollback if health checks fail.

        Args:
            version: The config version identifier (used in S3 key).

        Returns:
            The ECS deployment ID of the triggered deployment.

        Raises:
            botocore.exceptions.ClientError: If the ECS update fails.
        """
        # Get the current task definition to create a new revision
        service_resp = self.ecs_client.describe_services(
            cluster=self._ecs_cluster,
            services=[self._ecs_service],
        )
        current_task_def_arn = service_resp["services"][0]["taskDefinition"]

        # Describe the current task definition
        task_def_resp = self.ecs_client.describe_task_definition(
            taskDefinition=current_task_def_arn
        )
        task_def = task_def_resp["taskDefinition"]

        # Update LITELLM_CONFIG_S3_URI in container environment
        new_s3_uri = f"s3://{self._s3_bucket}/{self._s3_prefix}/config-{version}.yaml"
        container_defs = task_def["containerDefinitions"]
        for container in container_defs:
            if container.get("name") == "litellm":
                env_vars = container.get("environment", [])
                updated = False
                for env in env_vars:
                    if env["name"] == "LITELLM_CONFIG_S3_URI":
                        env["value"] = new_s3_uri
                        updated = True
                        break
                if not updated:
                    env_vars.append({"name": "LITELLM_CONFIG_S3_URI", "value": new_s3_uri})
                container["environment"] = env_vars
                break

        # Register a new task definition revision
        register_kwargs = {
            "family": task_def["family"],
            "containerDefinitions": container_defs,
            "taskRoleArn": task_def.get("taskRoleArn", ""),
            "executionRoleArn": task_def.get("executionRoleArn", ""),
            "networkMode": task_def.get("networkMode", "awsvpc"),
            "requiresCompatibilities": task_def.get("requiresCompatibilities", ["FARGATE"]),
            "cpu": task_def.get("cpu", "1024"),
            "memory": task_def.get("memory", "2048"),
        }

        # Preserve volumes if present
        if task_def.get("volumes"):
            register_kwargs["volumes"] = task_def["volumes"]

        new_task_def_resp = self.ecs_client.register_task_definition(**register_kwargs)
        new_task_def_arn = new_task_def_resp["taskDefinition"]["taskDefinitionArn"]

        # Update the service to use the new task definition
        response = self.ecs_client.update_service(
            cluster=self._ecs_cluster,
            service=self._ecs_service,
            taskDefinition=new_task_def_arn,
            forceNewDeployment=True,
        )

        deployment_id = ""
        deployments = response.get("service", {}).get("deployments", [])
        for deployment in deployments:
            if deployment.get("status") == "PRIMARY":
                deployment_id = deployment.get("id", "")
                break

        logger.info(
            "Triggered rolling update for config version %s, "
            "deployment_id=%s, cluster=%s, service=%s, task_def=%s",
            version,
            deployment_id,
            self._ecs_cluster,
            self._ecs_service,
            new_task_def_arn,
        )

        return deployment_id

    def _build_model_list(
        self, model_catalog: List[ModelCatalogEntry]
    ) -> List[Dict[str, Any]]:
        """Build the model_list section of the config.

        Each catalog entry produces TWO model_list items:
        1. Display name alias (used by UI/playground)
        2. Raw Bedrock model ID alias (used by agent foundations via gateway_model_id())

        Both aliases route to the same backend. This ensures that agents
        sending raw Bedrock model IDs (e.g., 'us.anthropic.claude-haiku-4-5-20251001-v1:0')
        resolve correctly through the gateway.

        Args:
            model_catalog: The model catalog entries.

        Returns:
            List of model configuration dictionaries.
        """
        model_list: List[Dict[str, Any]] = []

        for entry in model_catalog:
            prefix = self._resolve_provider_prefix(entry.provider)
            litellm_model = f"{prefix}{entry.model_id}"

            litellm_params: Dict[str, Any] = {
                "model": litellm_model,
            }

            # Bedrock Mantle models use api_key + api_base instead of aws_region_name
            if entry.provider == "bedrock-mantle":
                litellm_params["api_key"] = "${BEDROCK_MANTLE_API_KEY}"
                litellm_params["api_base"] = f"https://bedrock-mantle.{entry.region}.api.aws/v1"
                # Force chat completions mode — LiteLLM auto-detects openai.*
                # model IDs as Responses API mode, which is incorrect for
                # bedrock_mantle providers routed via chat completions.
                litellm_params["mode"] = "chat"
            else:
                litellm_params["aws_region_name"] = entry.region

            model_info: Dict[str, Any] = {
                "id": entry.model_id,
                "mode": entry.mode,
                "input_cost_per_token": entry.input_cost_per_token,
                "output_cost_per_token": entry.output_cost_per_token,
                "max_input_tokens": entry.max_input_tokens,
                "max_output_tokens": entry.max_output_tokens,
            }

            # 1. Display name alias (for UI/playground)
            model_list.append({
                "model_name": entry.display_name,
                "litellm_params": dict(litellm_params),
                "model_info": dict(model_info),
            })

            # 2. Raw Bedrock model ID alias (for agent foundations)
            # Only add if display_name differs from model_id to avoid duplicates
            if entry.display_name != entry.model_id:
                model_list.append({
                    "model_name": entry.model_id,
                    "litellm_params": dict(litellm_params),
                    "model_info": dict(model_info),
                })

        return model_list

    def _build_litellm_settings(self) -> Dict[str, Any]:
        """Build the litellm_settings section.

        Configures caching (Redis), Langfuse callbacks with trace propagation
        and metadata tagging, custom CloudWatch metrics callback, retry
        behavior, request timeouts, and Langfuse buffering for resilience.

        Langfuse Observability (Requirements 6.1-6.5):
        - success_callback/failure_callback: ["langfuse"] sends trace data on
          every request (Req 6.1)
        - langfuse_default_tags: tags traces with use_case and team derived
          from virtual key metadata (Req 6.5)
        - Trace propagation is handled by the gateway client passing trace ID
          in request headers (x-ava-trace-id / traceparent) which LiteLLM's
          Langfuse callback correlates automatically (Req 6.3)
        - langfuse_flush_at: batch size for trace delivery (buffering, Req 6.4)
        - langfuse_flush_interval: seconds between flush attempts, enabling
          local buffering for up to 5 minutes when Langfuse is unreachable

        Returns:
            LiteLLM settings dictionary.
        """
        return {
            "drop_params": True,
            "set_verbose": False,
            "cache": True,
            "cache_params": {
                "type": "redis",
                "host": "${REDIS_HOST}",
                "port": 6379,
                "password": "${REDIS_PASSWORD}",
                "ssl": True,
            },
            # Only use natively-supported callbacks. Custom callback modules
            # (e.g., gateway_client.litellm_metrics_logger) are NOT
            # loadable in the upstream LiteLLM image and would crash on boot.
            "success_callback": ["langfuse"],
            "failure_callback": ["langfuse"],
            "langfuse_default_tags": ["use_case", "team"],
            "langfuse_flush_at": 15,
            "langfuse_flush_interval": 60,
            "num_retries": 2,
            "request_timeout": 60,
        }

    def _build_general_settings(self) -> Dict[str, Any]:
        """Build the general_settings section.

        Configures the master key, database connection, alerting, budget
        enforcement, and rate limit policies.

        Budget controls (Task 11.3, Requirements 11.1, 11.2, 11.4, 11.5):
        - Slack webhook alert at 80% budget threshold
        - Hard enforcement (HTTP 429 rejection) at 100% budget
        - Per-key rate limits with Retry-After header in 429 responses

        Returns:
            General settings dictionary.
        """
        import importlib
        import os

        # Import budget enforcement service (handle different import contexts)
        try:
            from services.budget_enforcement import BudgetEnforcementService
        except ModuleNotFoundError:
            # Fallback: load from relative file path (used in test contexts)
            budget_module_path = os.path.join(
                os.path.dirname(__file__), "budget_enforcement.py"
            )
            spec = importlib.util.spec_from_file_location(
                "budget_enforcement", budget_module_path
            )
            budget_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(budget_module)
            BudgetEnforcementService = budget_module.BudgetEnforcementService

        budget_svc = BudgetEnforcementService()
        budget_config = budget_svc.build_litellm_budget_enforcement_config()

        general_settings: Dict[str, Any] = {
            "master_key": "${LITELLM_MASTER_KEY}",
            "database_url": "${DATABASE_URL}",
        }

        # Merge budget enforcement config into general_settings
        general_settings.update(budget_config)

        return general_settings

    def _build_router_settings(
        self, model_catalog: List[ModelCatalogEntry]
    ) -> Dict[str, Any]:
        """Build the router_settings section including fallback chains.

        Generates fallback entries for any model that has a non-empty
        fallback_models list. Each fallback entry maps a model's display_name
        to its ordered list of fallback display_names.

        Args:
            model_catalog: The model catalog entries.

        Returns:
            Router settings dictionary with routing strategy and fallbacks.
        """
        router_settings: Dict[str, Any] = {
            "routing_strategy": "simple-shuffle",
            "num_retries": 2,
            "timeout": 30,
        }

        # Build fallback chains from catalog entries that have fallback_models
        fallbacks = self._build_fallback_chains(model_catalog)
        if fallbacks:
            router_settings["fallbacks"] = fallbacks

        return router_settings

    def _build_fallback_chains(
        self, model_catalog: List[ModelCatalogEntry]
    ) -> List[Dict[str, Any]]:
        """Build fallback chain entries for router_settings.

        For each model with a non-empty fallback_models list, creates
        a fallback entry mapping the model's display_name to the ordered
        list of fallback model display_names.

        Args:
            model_catalog: The model catalog entries.

        Returns:
            List of fallback chain dictionaries.
        """
        # Build a lookup from model_id to display_name
        id_to_display_name: Dict[str, str] = {
            entry.model_id: entry.display_name for entry in model_catalog
        }

        fallbacks: List[Dict[str, Any]] = []

        for entry in model_catalog:
            if entry.fallback_models:
                # Resolve fallback model IDs to display names
                fallback_display_names = []
                for fallback_id in entry.fallback_models:
                    if fallback_id in id_to_display_name:
                        fallback_display_names.append(
                            id_to_display_name[fallback_id]
                        )
                    else:
                        # If fallback model is not in catalog, use the raw ID
                        fallback_display_names.append(fallback_id)

                fallbacks.append({
                    "model_name": entry.display_name,
                    "fallback_models": fallback_display_names,
                })

        return fallbacks

    @staticmethod
    def _resolve_provider_prefix(provider: str) -> str:
        """Resolve a provider name to its LiteLLM model prefix.

        Args:
            provider: The provider field from a ModelCatalogEntry
                      (e.g. "bedrock", "bedrock-mantle").

        Returns:
            The LiteLLM prefix string (e.g. "bedrock/", "bedrock/mantle/").

        Raises:
            ValueError: If the provider is not recognized.
        """
        prefix = PROVIDER_PREFIX_MAP.get(provider)
        if prefix is None:
            raise ValueError(
                f"Unknown provider '{provider}'. "
                f"Supported providers: {list(PROVIDER_PREFIX_MAP.keys())}"
            )
        return prefix
