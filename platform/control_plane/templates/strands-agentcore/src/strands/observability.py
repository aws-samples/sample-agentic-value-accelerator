"""
Observability setup for ${PROJECT_NAME}
Integrates Langfuse v3 tracing (auto-configured OpenTelemetry)
"""

import os
import json
import boto3
from config import settings

# Module-level client reference
_langfuse_client = None


def _fetch_langfuse_keys(secret_name: str, region: str) -> dict:
    """Fetch Langfuse API keys from AWS Secrets Manager."""
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])


def setup_tracing():
    """
    Configure Langfuse tracing.

    Langfuse v3 automatically sets up OpenTelemetry when the client is initialized.
    This function fetches API keys from Secrets Manager and initializes the client.
    """
    global _langfuse_client

    if not settings.LANGFUSE_ENABLED or not settings.LANGFUSE_SECRET_NAME:
        print("Langfuse tracing disabled")
        return

    # Fetch keys from Secrets Manager
    keys = _fetch_langfuse_keys(settings.LANGFUSE_SECRET_NAME, settings.AWS_REGION)

    # Set environment variables before client initialization
    os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST
    os.environ["LANGFUSE_PUBLIC_KEY"] = keys.get("langfuse_public_key", "")
    os.environ["LANGFUSE_SECRET_KEY"] = keys.get("langfuse_secret_key", "")

    # Initialize Langfuse client (auto-configures OpenTelemetry)
    from langfuse import get_client
    _langfuse_client = get_client()

    print(f"Langfuse tracing enabled: {settings.LANGFUSE_HOST}")


def get_langfuse_client():
    """
    Get the initialized Langfuse client.

    Returns:
        Langfuse client instance, or None if tracing is not enabled
    """
    return _langfuse_client
