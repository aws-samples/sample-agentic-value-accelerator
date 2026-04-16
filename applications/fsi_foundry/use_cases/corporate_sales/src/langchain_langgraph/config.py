"""
Corporate Sales Use Case Configuration.

Corporate-sales-specific settings extending the base configuration.
Includes data paths, agent model settings, and sales thresholds.
"""

from config.settings import Settings


class CorporateSalesSettings(Settings):
    """Corporate sales specific settings extending base configuration."""

    data_prefix: str = "samples/corporate_sales"

    lead_scorer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    opportunity_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    pitch_preparer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    lead_score_hot_threshold: int = 80
    lead_score_warm_threshold: int = 50
    opportunity_confidence_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_corporate_sales_settings() -> CorporateSalesSettings:
    """Get corporate sales specific settings instance."""
    return CorporateSalesSettings()
