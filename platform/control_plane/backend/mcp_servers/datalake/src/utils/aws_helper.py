"""AWS client factory with region/profile resolution and user-agent tracking."""

import os
from typing import Optional

import boto3
from botocore.config import Config

__version__ = "1.0.0"


class AwsHelper:
    """Helper for creating boto3 clients with consistent configuration."""

    @staticmethod
    def get_region() -> str:
        """Resolve AWS region from environment or boto3 session."""
        return (
            os.environ.get("AWS_REGION")
            or os.environ.get("AWS_DEFAULT_REGION")
            or boto3.Session().region_name
            or "us-east-1"
        )

    @classmethod
    def create_client(cls, service_name: str, region_name: Optional[str] = None):
        """Create a boto3 client with user-agent and region."""
        region = region_name or cls.get_region()
        config = Config(
            user_agent_extra=f"md/ava#mcp#datalake-mcp-server#{__version__}",
            retries={"max_attempts": 3, "mode": "adaptive"},
        )
        return boto3.client(service_name, region_name=region, config=config)
