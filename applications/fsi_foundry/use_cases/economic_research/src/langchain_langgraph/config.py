"""Economic Research Configuration."""
from config.settings import Settings

class EconomicResearchSettings(Settings):
    data_prefix: str = "samples/economic_research"
    data_aggregator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    trend_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    research_writer_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_data_sources: int = 50
    trend_confidence_threshold: float = 0.75
    report_max_length: int = 10000
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_economic_research_settings() -> EconomicResearchSettings:
    return EconomicResearchSettings()
