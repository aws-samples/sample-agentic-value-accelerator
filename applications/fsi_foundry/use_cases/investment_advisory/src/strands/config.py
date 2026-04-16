"""Investment Advisory Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id

class InvestmentAdvisorySettings(Settings):
    data_prefix: str = "samples/investment_advisory"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    @property
    def portfolio_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def market_researcher_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def client_profiler_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    max_analysis_time_seconds: int = 60
    risk_tolerance_threshold: float = 0.7
    rebalancing_trigger_pct: float = 0.05
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_investment_advisory_settings() -> InvestmentAdvisorySettings:
    return InvestmentAdvisorySettings()
