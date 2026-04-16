"""Post Call Analytics Use Case Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id


class PostCallAnalyticsSettings(Settings):
    data_prefix: str = "samples/post_call_analytics"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def transcription_processor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def sentiment_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def action_extractor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    transcription_confidence_threshold: float = 0.85
    sentiment_window_seconds: int = 30
    action_item_confidence_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_post_call_analytics_settings() -> PostCallAnalyticsSettings:
    return PostCallAnalyticsSettings()
