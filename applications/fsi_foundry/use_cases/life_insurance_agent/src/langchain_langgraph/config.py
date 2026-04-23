"""
Life Insurance Agent Configuration (LangGraph Implementation).

Life insurance agent specific settings extending the base configuration.
"""

from config.settings import Settings


class LifeInsuranceAgentSettings(Settings):
    """Life insurance agent specific settings."""

    data_prefix: str = "samples/life_insurance_agent"

    needs_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    product_matcher_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    underwriting_assistant_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    min_coverage_ratio: float = 0.8
    max_premium_to_income_ratio: float = 0.1
    underwriting_confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_life_insurance_agent_settings() -> LifeInsuranceAgentSettings:
    return LifeInsuranceAgentSettings()
