"""
Adverse Media Use Case Configuration.

Adverse media-specific settings extending the base configuration.
"""

from config.settings import Settings


class AdverseMediaSettings(Settings):
    data_prefix: str = "samples/adverse_media"

    media_screener_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    sentiment_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    risk_signal_extractor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    max_screening_time_seconds: int = 60
    sentiment_negativity_threshold: float = 0.7
    risk_signal_confidence_target: float = 0.8

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_adverse_media_settings() -> AdverseMediaSettings:
    return AdverseMediaSettings()
