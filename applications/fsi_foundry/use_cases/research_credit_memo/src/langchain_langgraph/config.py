"""
Research Credit Memo Use Case Configuration (LangGraph Implementation).

Research-credit-memo-specific settings extending the base configuration.
"""

from config.settings import Settings


class ResearchCreditMemoSettings(Settings):
    """Research credit memo specific settings."""

    data_prefix: str = "samples/research_credit_memo"

    data_gatherer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    credit_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    memo_writer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    min_data_completeness_score: float = 0.8
    credit_confidence_threshold: float = 0.7
    max_memo_generation_time_seconds: int = 120

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_research_credit_memo_settings() -> ResearchCreditMemoSettings:
    return ResearchCreditMemoSettings()
