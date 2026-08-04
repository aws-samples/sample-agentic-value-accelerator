"""Configuration loaded from environment variables."""

import os

MODEL_ID = os.getenv("MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "3"))
QUALITY_THRESHOLD = int(os.getenv("QUALITY_THRESHOLD", "4"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
PORT = int(os.getenv("PORT", "8000"))
