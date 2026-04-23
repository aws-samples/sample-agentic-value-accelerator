"""Earnings Summarization Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id

class EarningsSummarizationSettings(Settings):
    data_prefix: str = "samples/earnings_summarization"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    @property
    def transcript_processor_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def metric_extractor_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def sentiment_analyst_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    max_transcript_length: int = 100000
    sentiment_confidence_threshold: float = 0.80
    metric_extraction_confidence: float = 0.85
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_earnings_summarization_settings(): return EarningsSummarizationSettings()
