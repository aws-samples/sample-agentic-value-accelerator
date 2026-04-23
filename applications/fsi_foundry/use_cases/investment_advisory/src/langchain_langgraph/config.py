"""Investment Advisory Configuration."""
from config.settings import Settings

class InvestmentAdvisorySettings(Settings):
    data_prefix: str = "samples/investment_advisory"
    portfolio_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    market_researcher_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    client_profiler_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_analysis_time_seconds: int = 60
    risk_tolerance_threshold: float = 0.7
    rebalancing_trigger_pct: float = 0.05
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_investment_advisory_settings() -> InvestmentAdvisorySettings:
    return InvestmentAdvisorySettings()
