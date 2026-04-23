"""Call Summarization Configuration."""
from config.settings import Settings

class CallSummarizationSettings(Settings):
    data_prefix: str = "samples/call_summarization"
    key_point_extractor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    summary_generator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_summary_length: int = 500
    key_point_confidence_threshold: float = 0.75
    min_key_points: int = 3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_call_summarization_settings() -> CallSummarizationSettings:
    return CallSummarizationSettings()
