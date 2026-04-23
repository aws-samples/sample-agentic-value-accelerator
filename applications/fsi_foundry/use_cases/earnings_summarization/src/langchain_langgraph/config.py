"""Earnings Summarization Configuration."""
from config.settings import Settings

class EarningsSummarizationSettings(Settings):
    data_prefix: str = "samples/earnings_summarization"
    transcript_processor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    metric_extractor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    sentiment_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_transcript_length: int = 100000
    sentiment_confidence_threshold: float = 0.80
    metric_extraction_confidence: float = 0.85
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_earnings_summarization_settings(): return EarningsSummarizationSettings()
