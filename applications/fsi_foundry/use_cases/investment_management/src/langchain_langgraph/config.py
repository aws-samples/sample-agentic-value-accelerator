"""
Investment Management Use Case Configuration.

Investment-management-specific settings extending the base configuration.
"""

from config.settings import Settings


class InvestmentManagementSettings(Settings):
    """Investment management specific settings."""

    data_prefix: str = "samples/investment_management"

    allocation_optimizer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    rebalancing_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    performance_attributor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    drift_tolerance_pct: float = 5.0
    min_rebalance_threshold: float = 0.02
    attribution_lookback_days: int = 90

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_investment_management_settings() -> InvestmentManagementSettings:
    """Get investment management settings instance."""
    return InvestmentManagementSettings()
