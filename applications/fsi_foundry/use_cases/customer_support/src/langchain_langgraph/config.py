"""
Customer Support Use Case Configuration.

Customer-support-specific settings extending the base configuration.
Includes data paths, agent model settings, and support thresholds.
"""

from config.settings import Settings


class CustomerSupportSettings(Settings):
    """Customer support specific settings extending base configuration."""

    data_prefix: str = "samples/customer_support"

    ticket_classifier_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    resolution_agent_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    escalation_agent_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    max_resolution_time_seconds: int = 30
    escalation_confidence_threshold: float = 0.85
    auto_resolve_confidence: float = 0.9

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_support_settings() -> CustomerSupportSettings:
    """Get customer support specific settings instance."""
    return CustomerSupportSettings()
