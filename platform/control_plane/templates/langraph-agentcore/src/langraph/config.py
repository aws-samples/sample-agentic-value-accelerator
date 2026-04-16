"""
Configuration for ${PROJECT_NAME}
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""

    # Project
    PROJECT_NAME: str = "${PROJECT_NAME}"
    AWS_REGION: str = "${AWS_REGION}"

    # Bedrock
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"

    # Langfuse
    LANGFUSE_ENABLED: bool = True
    LANGFUSE_HOST: str = "${LANGFUSE_HOST}"
    LANGFUSE_SECRET_NAME: str = "${LANGFUSE_SECRET_NAME}"

    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "dev")

    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
