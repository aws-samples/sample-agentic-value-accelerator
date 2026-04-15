"""
Research Credit Memo Use Case Configuration (Strands Implementation).

Research-credit-memo-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class ResearchCreditMemoSettings(Settings):
    """Research credit memo specific settings."""

    data_prefix: str = "samples/research_credit_memo"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def data_gatherer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def credit_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def memo_writer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    min_data_completeness_score: float = 0.8
    credit_confidence_threshold: float = 0.7
    max_memo_generation_time_seconds: int = 120

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_research_credit_memo_settings() -> ResearchCreditMemoSettings:
    return ResearchCreditMemoSettings()
