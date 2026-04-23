"""
Life Insurance Agent Configuration (Strands Implementation).

Life insurance agent specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class LifeInsuranceAgentSettings(Settings):
    """Life insurance agent specific settings."""

    data_prefix: str = "samples/life_insurance_agent"

    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def needs_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def product_matcher_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def underwriting_assistant_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    min_coverage_ratio: float = 0.8
    max_premium_to_income_ratio: float = 0.1
    underwriting_confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_life_insurance_agent_settings() -> LifeInsuranceAgentSettings:
    return LifeInsuranceAgentSettings()
