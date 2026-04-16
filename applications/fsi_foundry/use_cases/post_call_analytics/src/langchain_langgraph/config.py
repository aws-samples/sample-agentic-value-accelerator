"""Post Call Analytics Use Case Configuration."""
from config.settings import Settings


class PostCallAnalyticsSettings(Settings):
    data_prefix: str = "samples/post_call_analytics"
    transcription_processor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    sentiment_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    action_extractor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    transcription_confidence_threshold: float = 0.85
    sentiment_window_seconds: int = 30
    action_item_confidence_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_post_call_analytics_settings() -> PostCallAnalyticsSettings:
    return PostCallAnalyticsSettings()
