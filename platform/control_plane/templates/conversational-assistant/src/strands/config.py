"""Configuration loaded from environment variables."""

import os


MODEL_ID = os.getenv("MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.3"))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))
MEMORY_WINDOW_SIZE = int(os.getenv("MEMORY_WINDOW_SIZE", "20"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
PORT = int(os.getenv("PORT", "8000"))

# Observability / Langfuse
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
ENABLE_TRACING = os.getenv("ENABLE_TRACING", "false").lower() in ("true", "1", "yes")
