"""
Data Analytics Use Case Configuration.

Data analytics-specific settings extending the base configuration.
"""

from config.settings import Settings


class DataAnalyticsSettings(Settings):
    """Data analytics specific settings."""

    data_prefix: str = "samples/data_analytics"

    data_explorer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    statistical_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    insight_generator_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    significance_level: float = 0.05
    min_sample_size: int = 30
    correlation_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_data_analytics_settings() -> DataAnalyticsSettings:
    return DataAnalyticsSettings()
