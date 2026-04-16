"""Economic Research Configuration (Strands)."""
from config.settings import Settings, get_regional_model_id

class EconomicResearchSettings(Settings):
    data_prefix: str = "samples/economic_research"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    @property
    def data_aggregator_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def trend_analyst_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def research_writer_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    max_data_sources: int = 50
    trend_confidence_threshold: float = 0.75
    report_max_length: int = 10000
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_economic_research_settings() -> EconomicResearchSettings:
    return EconomicResearchSettings()
