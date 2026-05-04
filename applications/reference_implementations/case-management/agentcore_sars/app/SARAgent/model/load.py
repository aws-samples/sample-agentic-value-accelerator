"""Model configuration for SAR Agent."""

import os
from strands.models import BedrockModel


def load_model():
    """Load the Bedrock model for the SAR agent."""
    model_id = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    return BedrockModel(model_id=model_id, region_name=region)
