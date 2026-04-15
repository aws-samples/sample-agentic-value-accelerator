"""
Call Center Analytics Configuration (Strands Implementation).

Call-center-analytics-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class CallCenterAnalyticsSettings(Settings):
    """Call center analytics specific settings."""

    data_prefix: str = "samples/call_center_analytics"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def call_monitor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def agent_performance_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def operations_insight_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    quality_score_threshold: float = 0.8
    average_handle_time_target: int = 300
    first_call_resolution_target: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_call_center_analytics_settings() -> CallCenterAnalyticsSettings:
    return CallCenterAnalyticsSettings()
