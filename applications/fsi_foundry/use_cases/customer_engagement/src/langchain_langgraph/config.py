"""
Customer Engagement Use Case Configuration.

Customer-engagement-specific settings extending the base configuration.
Includes data paths, agent model settings, and engagement thresholds.
"""

from config.settings import Settings


class CustomerEngagementSettings(Settings):
    """Customer engagement specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/customer_engagement"

    # Agent configuration
    churn_predictor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    outreach_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    policy_optimizer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    # Use case specific thresholds
    churn_risk_threshold: float = 0.7
    retention_target_rate: float = 0.9
    min_policy_value: float = 1000.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_engagement_settings() -> CustomerEngagementSettings:
    """Get customer engagement specific settings instance."""
    return CustomerEngagementSettings()
