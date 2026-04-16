"""Call Summarization Configuration (Strands)."""
from config.settings import Settings, get_regional_model_id

class CallSummarizationSettings(Settings):
    data_prefix: str = "samples/call_summarization"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def key_point_extractor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def summary_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_summary_length: int = 500
    key_point_confidence_threshold: float = 0.75
    min_key_points: int = 3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_call_summarization_settings() -> CallSummarizationSettings:
    return CallSummarizationSettings()
