"""
Customer Service Use Case Configuration (Strands Implementation).

Customer-service-specific settings extending the base configuration.
Includes data paths, agent model settings, and service thresholds.
"""

from config.settings import Settings, get_regional_model_id


class CustomerServiceSettings(Settings):
    """Customer service specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/customer_service"

    # Agent configuration - use regional model IDs
    # Note: These will be overridden by effective_bedrock_model_id in agents
    # that use the base class properly
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def inquiry_handler_model(self) -> str:
        """Get regional model ID for inquiry handler."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def transaction_specialist_model(self) -> str:
        """Get regional model ID for transaction specialist."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def product_advisor_model(self) -> str:
        """Get regional model ID for product advisor."""
        return get_regional_model_id(self.aws_region, self._base_model)

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
