"""
Investment Management Use Case Configuration (Strands Implementation).

Investment-management-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class InvestmentManagementSettings(Settings):
    """Investment management specific settings."""

    data_prefix: str = "samples/investment_management"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def allocation_optimizer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def rebalancing_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def performance_attributor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    drift_tolerance_pct: float = 5.0
    min_rebalance_threshold: float = 0.02
    attribution_lookback_days: int = 90

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_investment_management_settings() -> InvestmentManagementSettings:
    """Get investment management settings instance."""
    return InvestmentManagementSettings()
