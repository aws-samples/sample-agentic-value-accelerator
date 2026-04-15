"""
Agentic Payments Use Case Configuration (Strands Implementation).

Payment-specific settings extending the base configuration.
Includes data paths, agent model settings, and payment thresholds.
"""

from config.settings import Settings, get_regional_model_id


class AgenticPaymentsSettings(Settings):
    """Agentic Payments-specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/agentic_payments"

    # Agent configuration - use regional model IDs
    # Note: These will be overridden by effective_bedrock_model_id in agents
    # that use the base class properly
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def payment_validator_model(self) -> str:
        """Get regional model ID for payment validator."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def routing_agent_model(self) -> str:
        """Get regional model ID for routing agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def reconciliation_agent_model(self) -> str:
        """Get regional model ID for reconciliation agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    # Use case specific thresholds
    max_transaction_amount: float = 1000000.0  # Maximum transaction amount in USD
    sanctions_check_timeout_seconds: int = 30  # Timeout for sanctions screening
    reconciliation_tolerance: float = 0.01  # Tolerance for reconciliation matching (1%)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_agentic_payments_settings() -> AgenticPaymentsSettings:
    """Get Agentic Payments-specific settings instance."""
    return AgenticPaymentsSettings()
