"""
Configuration for Risk Analyst Agent Backend

Loads configuration from environment variables and S3.
"""

import json
import os
import yaml
import boto3
from botocore.config import Config as BotoConfig
from typing import Dict, Any, Optional
from strands.models import BedrockModel

# AWS Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# S3 Configuration
CONFIG_BUCKET = os.getenv("CONFIG_BUCKET", "")
SCHEMA_CONFIG_KEY = os.getenv("SCHEMA_CONFIG_KEY", "configs/risk/schema_config.yaml")

# Database Configuration
DB_HOST = os.getenv("DB_HOST", "")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "")
DB_USERNAME = os.getenv("DB_USERNAME", "")
DB_SECRET_ARN = os.getenv("DB_SECRET_ARN", "")

# Model Configuration
MODEL_ID = os.getenv("MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
MODEL_TEMPERATURE = 0.1
MODEL_MAX_TOKENS = 16384

# Guardrail Configuration
GUARDRAIL_ID = os.getenv("GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.getenv("GUARDRAIL_VERSION", "DRAFT")

ENVIRONMENT = os.getenv("ENVIRONMENT", "dev")

# AgentCore Memory Configuration
MEMORY_ID = os.getenv("BEDROCK_AGENTCORE_MEMORY_ID", "")


def load_config_from_s3(config_key: str) -> Optional[Dict[str, Any]]:
    """Load a YAML configuration file from S3."""
    if not CONFIG_BUCKET or not config_key:
        return None
    try:
        s3_client = boto3.client('s3', region_name=AWS_REGION)
        response = s3_client.get_object(Bucket=CONFIG_BUCKET, Key=config_key)
        content = response['Body'].read().decode('utf-8')
        return yaml.safe_load(content)
    except Exception as e:
        print(f"Error loading config from S3 ({config_key}): {e}")
        return None


def load_schema_config() -> Optional[Dict[str, Any]]:
    """Load risk database schema configuration from S3."""
    return load_config_from_s3(SCHEMA_CONFIG_KEY)


def create_bedrock_model() -> BedrockModel:
    """Create and configure BedrockModel for the Risk Analyst agent."""
    boto_client_config = BotoConfig(
        retries={'max_attempts': 8, 'mode': 'adaptive'},
        read_timeout=300,
        connect_timeout=10,
    )

    model_kwargs = dict(
        model_id=MODEL_ID,
        region_name=AWS_REGION,
        temperature=MODEL_TEMPERATURE,
        max_tokens=MODEL_MAX_TOKENS,
        boto_client_config=boto_client_config,
    )

    if GUARDRAIL_ID:
        model_kwargs["guardrail_id"] = GUARDRAIL_ID
        model_kwargs["guardrail_version"] = GUARDRAIL_VERSION
        model_kwargs["guardrail_trace"] = "enabled"
        print(f"[Config] Guardrail enabled: {GUARDRAIL_ID}")

    return BedrockModel(**model_kwargs)
