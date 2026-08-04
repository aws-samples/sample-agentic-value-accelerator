"""AWS client factory with user-agent tracking."""

import os
from typing import Optional

import boto3
from botocore.config import Config

__version__ = "1.0.0"

USER_AGENT_EXTRA = f"md/ava#mcp#kb-mcp-server#{__version__}"
_config = Config(
    user_agent_extra=USER_AGENT_EXTRA,
    retries={"max_attempts": 3, "mode": "adaptive"},
)


def get_bedrock_agent_client(region_name: Optional[str] = None):
    """Get Bedrock Agent management client (list KBs, data sources, ingestion)."""
    region = region_name or os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("bedrock-agent", region_name=region, config=_config)


def get_bedrock_agent_runtime_client(region_name: Optional[str] = None):
    """Get Bedrock Agent Runtime client (retrieve, retrieve_and_generate)."""
    region = region_name or os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("bedrock-agent-runtime", region_name=region, config=_config)
