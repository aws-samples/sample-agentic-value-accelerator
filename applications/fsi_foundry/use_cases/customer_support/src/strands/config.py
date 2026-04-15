"""
Customer Support Use Case Configuration (Strands Implementation).

Customer-support-specific settings extending the base configuration.
Includes data paths, agent model settings, and support thresholds.
"""

from config.settings import Settings, get_regional_model_id


class CustomerSupportSettings(Settings):
    """Customer support specific settings extending base configuration."""

    data_prefix: str = "samples/customer_support"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def ticket_classifier_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def resolution_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def escalation_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_resolution_time_seconds: int = 30
    escalation_confidence_threshold: float = 0.85
    auto_resolve_confidence: float = 0.9

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_support_settings() -> CustomerSupportSettings:
    """Get customer support specific settings instance."""
    return CustomerSupportSettings()
