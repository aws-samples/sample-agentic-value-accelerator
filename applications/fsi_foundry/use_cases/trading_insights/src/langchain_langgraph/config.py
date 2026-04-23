"""
Trading Insights Use Case Configuration.

Trading-insights-specific settings extending the base configuration.
Includes data paths, agent model settings, and trading thresholds.
"""

from config.settings import Settings


class TradingInsightsSettings(Settings):
    """Trading insights specific settings extending base configuration."""

    data_prefix: str = "samples/trading_insights"

    signal_generator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    cross_asset_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    scenario_modeler_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    signal_confidence_threshold: float = 0.7
    correlation_lookback_days: int = 90
    scenario_probability_cutoff: float = 0.05

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_trading_insights_settings() -> TradingInsightsSettings:
    """Get trading insights specific settings instance."""
    return TradingInsightsSettings()
