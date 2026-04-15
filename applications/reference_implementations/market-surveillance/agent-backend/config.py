"""
Configuration for Market Surveillance Multi-Agent System

For AgentCore deployment, configuration is loaded from environment variables
injected by AgentCore Runtime.
"""

import os
import yaml
import boto3
from botocore.config import Config as BotoConfig
from typing import Dict, Any, Optional
from strands.models import BedrockModel

# AWS Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# AgentCore Memory Configuration
MEMORY_ID = os.getenv("BEDROCK_AGENTCORE_MEMORY_ID", "")

# S3 Configuration for agent configs (schema, prompts, etc.)
CONFIG_BUCKET = os.getenv("CONFIG_BUCKET", "")
SCHEMA_CONFIG_KEY = os.getenv("SCHEMA_CONFIG_KEY", "configs/data-shape/schema_config.yaml")
ORCHESTRATOR_CONFIG_KEY = os.getenv("ORCHESTRATOR_CONFIG_KEY", "configs/orchestrator/orchestrator_config.yaml")
RULE_DEFINITION_CONFIG_KEY = os.getenv("RULE_DEFINITION_CONFIG_KEY", "configs/rules/rule_definition_config.yml")
ANALYST_METRICS_CONFIG_KEY = os.getenv("ANALYST_METRICS_CONFIG_KEY", "configs/metrics/analyst_metrics.yaml")
# Database Configuration
DB_HOST = os.getenv("DB_HOST", "")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")

# Gateway Configuration
GATEWAY_URL = os.getenv("GATEWAY_URL", "")
SSM_GATEWAY_URL_PARAM = os.getenv("SSM_GATEWAY_URL_PARAM", "")

# Fetch Gateway URL from SSM if not set directly
if not GATEWAY_URL and SSM_GATEWAY_URL_PARAM:
    try:
        print(f"[Config] Attempting to load GATEWAY_URL from SSM parameter: {SSM_GATEWAY_URL_PARAM}")
        ssm_client = boto3.client('ssm', region_name=AWS_REGION)
        response = ssm_client.get_parameter(Name=SSM_GATEWAY_URL_PARAM, WithDecryption=False)
        GATEWAY_URL = response['Parameter']['Value']
        print(f"[Config] Successfully loaded GATEWAY_URL from SSM: {GATEWAY_URL}")
    except Exception as e:
        print(f"[Config] Failed to load GATEWAY_URL from SSM: {type(e).__name__}: {str(e)}")
        GATEWAY_URL = ""
elif GATEWAY_URL:
    print(f"[Config] GATEWAY_URL loaded from environment: {GATEWAY_URL}")
else:
    print(f"[Config] WARNING: GATEWAY_URL not configured (no env var or SSM parameter)")
    GATEWAY_URL = ""

# Model Configuration
MODEL_ID = "global.anthropic.claude-sonnet-4-20250514-v1:0"
SUB_AGENT_MODEL_ID = os.getenv("SUB_AGENT_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
ECOMM_MODEL_ID = os.getenv("ECOMM_MODEL_ID", "global.anthropic.claude-sonnet-4-5-20250929-v1:0")
ANALYST_MODEL_ID = os.getenv("ANALYST_MODEL_ID", "global.anthropic.claude-sonnet-4-5-20250929-v1:0")
MODEL_TEMPERATURE = 0.1  # Lower temperature for more consistent, factual responses
MODEL_MAX_TOKENS = 24000  # Coordinator writes the full investigation report (needs room for 7+ trades)
SUB_AGENT_MAX_TOKENS = 4096  # Haiku sub-agents: schema lookups, SQL construction
ECOMM_MAX_TOKENS = 8000  # eComm: intent detection and conversation analysis
ANALYST_MAX_TOKENS = 32000  # Trade Analyst: must produce complete rule tables per trade (~29 rules × N trades)

# Bedrock API socket timeout (seconds).
# This is per-chunk for converse_stream — if the model produces no output for this
# duration, the socket read times out.  Observed max single-call duration is ~906s
# (Opus with large context).  Setting to 1200s (20 min) gives headroom above the
# observed max.  Strands hooks (see agent.py) handle retry on timeout for resilience.
BEDROCK_READ_TIMEOUT = int(os.getenv("BEDROCK_READ_TIMEOUT", "1200"))

# Guardrail Configuration
GUARDRAIL_ID = os.getenv("GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.getenv("GUARDRAIL_VERSION", "DRAFT")

# Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "dev")


def load_config_from_s3(config_key: str) -> Optional[Dict[str, Any]]:
    """
    Load a YAML configuration file from S3.
    
    Args:
        config_key: S3 key for the config file
        
    Returns:
        Parsed YAML configuration as dictionary, or None if error
    """
    if not CONFIG_BUCKET or not config_key:
        return None
    
    try:
        s3_client = boto3.client('s3', region_name=AWS_REGION)
        response = s3_client.get_object(Bucket=CONFIG_BUCKET, Key=config_key)
        config_content = response['Body'].read().decode('utf-8')
        return yaml.safe_load(config_content)
    except Exception as e:
        print(f"Error loading config from S3 ({config_key}): {e}")
        return None


def load_schema_config() -> Optional[Dict[str, Any]]:
    """Load database schema configuration from S3."""
    return load_config_from_s3(SCHEMA_CONFIG_KEY)


def load_orchestrator_config() -> Optional[Dict[str, Any]]:
    """Load orchestrator configuration from S3."""
    return load_config_from_s3(ORCHESTRATOR_CONFIG_KEY)


def load_rule_definition_config() -> Optional[Dict[str, Any]]:
    """Load rule definition configuration from S3."""
    return load_config_from_s3(RULE_DEFINITION_CONFIG_KEY)


def load_analyst_metrics_config() -> Optional[Dict[str, Any]]:
    """Load analyst metrics configuration from S3."""
    return load_config_from_s3(ANALYST_METRICS_CONFIG_KEY)


def _base_boto_config() -> BotoConfig:
    """Shared botocore config for all Bedrock model clients."""
    return BotoConfig(
        retries={
            'max_attempts': 8,
            'mode': 'adaptive',
        },
        read_timeout=BEDROCK_READ_TIMEOUT,
        connect_timeout=10,
    )


def _apply_guardrail(model_kwargs: dict) -> None:
    """Add guardrail config to model kwargs if configured."""
    if GUARDRAIL_ID:
        model_kwargs["guardrail_id"] = GUARDRAIL_ID
        model_kwargs["guardrail_version"] = GUARDRAIL_VERSION
        model_kwargs["guardrail_trace"] = "enabled"


def create_bedrock_model() -> BedrockModel:
    """
    Create and configure BedrockModel with optimal settings for Market Surveillance agents.

    Configuration:
    - Temperature: 0.1 (more deterministic, less creative)
    - Max Tokens: 16384 (Claude Sonnet 4.5 maximum output tokens)
    - Guardrail: Applied if GUARDRAIL_ID is set via environment variable
    - Retry: Adaptive mode with up to 8 attempts for throttling resilience

    Note: Claude Sonnet 4.5 does not support both temperature and top_p.
    Using only temperature for consistency.

    Returns:
        Configured BedrockModel instance
    """
    boto_client_config = _base_boto_config()

    model_kwargs = dict(
        model_id=MODEL_ID,
        region_name=AWS_REGION,
        temperature=MODEL_TEMPERATURE,
        max_tokens=MODEL_MAX_TOKENS,
        boto_client_config=boto_client_config,
    )

    _apply_guardrail(model_kwargs)
    print(f"[Config] Bedrock model: {MODEL_ID}, max_tokens={MODEL_MAX_TOKENS}, read_timeout={BEDROCK_READ_TIMEOUT}s")

    return BedrockModel(**model_kwargs)


def create_sub_agent_model() -> BedrockModel:
    """
    Create a lightweight BedrockModel for data sub-agents (data enrichment, data contract).

    Uses Haiku for fast SQL construction and schema lookups.
    Configurable via SUB_AGENT_MODEL_ID environment variable.
    """
    boto_client_config = _base_boto_config()

    model_kwargs = dict(
        model_id=SUB_AGENT_MODEL_ID,
        region_name=AWS_REGION,
        temperature=MODEL_TEMPERATURE,
        max_tokens=SUB_AGENT_MAX_TOKENS,
        boto_client_config=boto_client_config,
    )

    _apply_guardrail(model_kwargs)
    print(f"[Config] Sub-agent model: {SUB_AGENT_MODEL_ID}, max_tokens={SUB_AGENT_MAX_TOKENS}")

    return BedrockModel(**model_kwargs)


def create_ecomm_model() -> BedrockModel:
    """
    Create a BedrockModel for the eComm Specialist Agent.

    Uses Sonnet for intent detection and communications analysis — needs more
    reasoning capability than Haiku but doesn't require Opus.
    Configurable via ECOMM_MODEL_ID environment variable.
    """
    boto_client_config = _base_boto_config()

    model_kwargs = dict(
        model_id=ECOMM_MODEL_ID,
        region_name=AWS_REGION,
        temperature=MODEL_TEMPERATURE,
        max_tokens=ECOMM_MAX_TOKENS,
        boto_client_config=boto_client_config,
    )

    _apply_guardrail(model_kwargs)
    print(f"[Config] eComm model: {ECOMM_MODEL_ID}, max_tokens={ECOMM_MAX_TOKENS}")

    return BedrockModel(**model_kwargs)


def create_analyst_model() -> BedrockModel:
    """
    Create a BedrockModel for the Trade Analyst Agent.

    Uses Sonnet for structured rule evaluation — matching trade data against
    decision tree rules, computing metrics, and producing disposition tables.
    This is procedural work that doesn't require Opus-level reasoning.
    Configurable via ANALYST_MODEL_ID environment variable.
    """
    boto_client_config = _base_boto_config()

    model_kwargs = dict(
        model_id=ANALYST_MODEL_ID,
        region_name=AWS_REGION,
        temperature=MODEL_TEMPERATURE,
        max_tokens=ANALYST_MAX_TOKENS,
        boto_client_config=boto_client_config,
    )

    _apply_guardrail(model_kwargs)

    print(f"[Config] Trade Analyst model: {ANALYST_MODEL_ID}, max_tokens={ANALYST_MAX_TOKENS}")

    return BedrockModel(**model_kwargs)
