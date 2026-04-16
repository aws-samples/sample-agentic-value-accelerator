"""
Adverse Media Use Case Configuration (Strands Implementation).

Adverse media-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class AdverseMediaSettings(Settings):
    data_prefix: str = "samples/adverse_media"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def media_screener_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def sentiment_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def risk_signal_extractor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_screening_time_seconds: int = 60
    sentiment_negativity_threshold: float = 0.7
    risk_signal_confidence_target: float = 0.8

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_adverse_media_settings() -> AdverseMediaSettings:
    return AdverseMediaSettings()
