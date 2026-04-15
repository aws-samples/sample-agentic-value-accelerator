"""
Trading Insights Use Case Configuration (Strands Implementation).

Trading-insights-specific settings extending the base configuration.
Includes data paths, agent model settings, and trading thresholds.
"""

from config.settings import Settings, get_regional_model_id


class TradingInsightsSettings(Settings):
    """Trading insights specific settings extending base configuration."""

    data_prefix: str = "samples/trading_insights"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def signal_generator_model(self) -> str:
        """Get regional model ID for signal generator."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def cross_asset_analyst_model(self) -> str:
        """Get regional model ID for cross asset analyst."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def scenario_modeler_model(self) -> str:
        """Get regional model ID for scenario modeler."""
        return get_regional_model_id(self.aws_region, self._base_model)

    signal_confidence_threshold: float = 0.7
    correlation_lookback_days: int = 90
    scenario_probability_cutoff: float = 0.05

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_trading_insights_settings() -> TradingInsightsSettings:
    """Get trading insights specific settings instance."""
    return TradingInsightsSettings()
