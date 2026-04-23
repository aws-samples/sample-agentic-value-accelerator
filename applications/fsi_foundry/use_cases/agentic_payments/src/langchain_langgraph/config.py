"""
Agentic Payments Use Case Configuration.

Payment-specific settings extending the base configuration.
Includes data paths, agent model settings, and payment thresholds.
"""

from config.settings import Settings


class AgenticPaymentsSettings(Settings):
    """Agentic Payments-specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/agentic_payments"

    # Agent configuration - direct model IDs for LangGraph
    payment_validator_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    routing_agent_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    reconciliation_agent_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

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
