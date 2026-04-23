"""
Call Center Analytics Configuration.

Call-center-analytics-specific settings extending the base configuration.
"""

from config.settings import Settings


class CallCenterAnalyticsSettings(Settings):
    """Call center analytics specific settings."""

    data_prefix: str = "samples/call_center_analytics"

    call_monitor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    agent_performance_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    operations_insight_generator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    quality_score_threshold: float = 0.8
    average_handle_time_target: int = 300
    first_call_resolution_target: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_call_center_analytics_settings() -> CallCenterAnalyticsSettings:
    return CallCenterAnalyticsSettings()
