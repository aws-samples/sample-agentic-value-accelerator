"""Credit Risk Configuration."""

from config.settings import Settings


class CreditRiskSettings(Settings):
    data_prefix: str = "samples/credit_risk"
    financial_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    risk_scorer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    portfolio_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    max_portfolio_concentration: float = 0.25

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_credit_risk_settings() -> CreditRiskSettings:
    return CreditRiskSettings()
