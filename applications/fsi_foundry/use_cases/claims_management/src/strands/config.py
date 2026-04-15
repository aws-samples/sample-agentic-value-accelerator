"""
Claims Management Use Case Configuration (Strands Implementation).

Claims-management-specific settings extending the base configuration.
Includes data paths, agent model settings, and claims thresholds.
"""

try:
    from config.settings import Settings, get_regional_model_id
except (ImportError, ModuleNotFoundError):
    from pydantic_settings import BaseSettings as Settings

    def get_regional_model_id(region: str, base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0") -> str:
        if region.startswith("us-"):
            return f"us.{base_model}"
        elif region.startswith("eu-"):
            return f"eu.{base_model}"
        return f"us.{base_model}"


class ClaimsManagementSettings(Settings):
    """Claims management specific settings extending base configuration."""

    data_prefix: str = "samples/claims_management"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def claims_intake_agent_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def damage_assessor_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def settlement_recommender_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    auto_approve_threshold: float = 0.85
    max_settlement_amount: float = 500000.0
    damage_confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_claims_management_settings() -> ClaimsManagementSettings:
    return ClaimsManagementSettings()
