"""
Customer Service Use Case Configuration.

Customer-service-specific settings extending the base configuration.
Includes data paths, agent model settings, and service thresholds.
"""

from config.settings import Settings


class CustomerServiceSettings(Settings):
    """Customer service specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/customer_service"

    # Agent configuration
    inquiry_handler_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    transaction_specialist_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    product_advisor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    # Use case specific thresholds
    max_response_time_seconds: int = 30
    escalation_threshold: float = 0.8
    satisfaction_target: float = 0.9

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_service_settings() -> CustomerServiceSettings:
    """Get customer service specific settings instance."""
    return CustomerServiceSettings()
