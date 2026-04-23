"""
Customer Engagement Use Case Configuration (Strands Implementation).

Customer-engagement-specific settings extending the base configuration.
Includes data paths, agent model settings, and engagement thresholds.
"""

from config.settings import Settings, get_regional_model_id


class CustomerEngagementSettings(Settings):
    """Customer engagement specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/customer_engagement"

    # Agent configuration - use regional model IDs
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def churn_predictor_model(self) -> str:
        """Get regional model ID for churn predictor."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def outreach_agent_model(self) -> str:
        """Get regional model ID for outreach agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def policy_optimizer_model(self) -> str:
        """Get regional model ID for policy optimizer."""
        return get_regional_model_id(self.aws_region, self._base_model)

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
