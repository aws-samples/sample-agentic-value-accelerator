# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


def get_regional_model_id(region: str, base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0") -> str:
    """
    Get the appropriate inference profile ID based on AWS region.
    
    Cross-region inference profiles use regional prefixes:
    - us.* for US regions (us-east-1, us-east-2, us-west-2)
    - eu.* for EU regions (eu-west-1, eu-west-2, eu-central-1)
    - apac.* for APAC regions (ap-southeast-1, ap-northeast-1)
    
    Args:
        region: AWS region code
        base_model: Base model ID without regional prefix
        
    Returns:
        Regional inference profile ID
    """
    # Map regions to inference profile prefixes
    if region.startswith("us-"):
        return f"us.{base_model}"
    elif region.startswith("eu-"):
        return f"eu.{base_model}"
    elif region.startswith("ap-"):
        return f"apac.{base_model}"
    else:
        # Default to US for unknown regions
        return f"us.{base_model}"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # AWS Configuration
    aws_region: str = "us-east-1"
    # Note: AWS credentials should be provided via IAM roles, instance profiles,
    # or the default credential chain (environment variables, ~/.aws/credentials).
    # Do not hardcode credentials in configuration files or source code.
    # See: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html

    # S3 Configuration
    s3_bucket_name: str = "financial-risk-data"

    # Amazon Bedrock Configuration
    # Note: This is the base model ID. Use get_bedrock_model_id() for regional inference profile.
    _bedrock_base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_model_id: Optional[str] = None  # Will be computed based on region
    
    @property
    def effective_bedrock_model_id(self) -> str:
        """Get the effective Bedrock model ID based on region."""
        if self.bedrock_model_id:
            return self.bedrock_model_id
        return get_regional_model_id(self.aws_region, self._bedrock_base_model)

    # Application Configuration
    app_env: str = "development"
    log_level: str = "INFO"
    
    # Deployment Mode Configuration
    # Options: fastapi | agentcore | lambda
    deployment_mode: str = "agentcore"
    
    # Use Case Configuration
    # Identifies which use case is being deployed (e.g., "kyc_banking", "fraud_detection")
    use_case_id: str = "kyc_banking"
    # Prefix for data paths in Amazon S3, set by use case configs (e.g., "samples/kyc/banking_customers")
    data_prefix: str = ""

    # Agent Selection
    # Which agent to run (must be registered in the agent registry)
    agent_name: str = "kyc_banking"
    
    # Agent Framework Selection
    # Options: langchain_langgraph | strands
    agent_framework: str = "langchain_langgraph"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
