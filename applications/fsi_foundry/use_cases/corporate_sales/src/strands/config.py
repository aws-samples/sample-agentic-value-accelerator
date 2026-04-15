"""
Corporate Sales Use Case Configuration (Strands Implementation).

Corporate-sales-specific settings extending the base configuration.
Includes data paths, agent model settings, and sales thresholds.
"""

from config.settings import Settings, get_regional_model_id


class CorporateSalesSettings(Settings):
    """Corporate sales specific settings extending base configuration."""

    data_prefix: str = "samples/corporate_sales"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def lead_scorer_model(self) -> str:
        """Get regional model ID for lead scorer."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def opportunity_analyst_model(self) -> str:
        """Get regional model ID for opportunity analyst."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def pitch_preparer_model(self) -> str:
        """Get regional model ID for pitch preparer."""
        return get_regional_model_id(self.aws_region, self._base_model)

    lead_score_hot_threshold: int = 80
    lead_score_warm_threshold: int = 50
    opportunity_confidence_threshold: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_corporate_sales_settings() -> CorporateSalesSettings:
    """Get corporate sales specific settings instance."""
    return CorporateSalesSettings()
