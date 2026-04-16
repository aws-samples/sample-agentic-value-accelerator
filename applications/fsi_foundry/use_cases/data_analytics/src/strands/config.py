"""
Data Analytics Use Case Configuration (Strands Implementation).

Data analytics-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class DataAnalyticsSettings(Settings):
    """Data analytics specific settings."""

    data_prefix: str = "samples/data_analytics"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def data_explorer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def statistical_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def insight_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    significance_level: float = 0.05
    min_sample_size: int = 30
    correlation_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_data_analytics_settings() -> DataAnalyticsSettings:
    return DataAnalyticsSettings()
