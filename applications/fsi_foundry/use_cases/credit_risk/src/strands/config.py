"""Credit Risk Configuration (Strands)."""

from config.settings import Settings, get_regional_model_id


class CreditRiskSettings(Settings):
    data_prefix: str = "samples/credit_risk"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def financial_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def risk_scorer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def portfolio_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    max_portfolio_concentration: float = 0.25

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_credit_risk_settings() -> CreditRiskSettings:
    return CreditRiskSettings()
