"""
Claims Management Use Case Configuration.

Claims-management-specific settings extending the base configuration.
Includes data paths, agent model settings, and claims thresholds.
"""

try:
    from config.settings import Settings
except (ImportError, ModuleNotFoundError):
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        """Fallback base settings for standalone import."""
        class Config:
            extra = "ignore"
            env_file = ".env"
            env_file_encoding = "utf-8"


class ClaimsManagementSettings(Settings):
    """Claims management specific settings extending base configuration."""

    data_prefix: str = "samples/claims_management"

    claims_intake_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    damage_assessor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    settlement_recommender_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    auto_approve_threshold: float = 0.85
    max_settlement_amount: float = 500000.0
    damage_confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_claims_management_settings() -> ClaimsManagementSettings:
    return ClaimsManagementSettings()
