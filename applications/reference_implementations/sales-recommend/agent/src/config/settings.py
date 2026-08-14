# SPDX-License-Identifier: Apache-2.0
"""
Application settings via environment variables (pydantic-settings).

These are read by the telemetry module and can be used by future enhancements.
The core recommend.py reads its own env vars directly for backward compat.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Agent config
    knowledge_base_id: str = ""
    aws_region: str = "us-east-1"
    model_id: str = "global.anthropic.claude-sonnet-4-6"
    max_tokens: int = 16384
    deployment_mode: str = "agentcore"

    # Logging
    log_level: str = "INFO"

    # Observability
    enable_tracing: bool = True
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
