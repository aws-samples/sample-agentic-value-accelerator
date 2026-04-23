"""
KYC Use Case Configuration (Strands Implementation).

KYC-specific settings extending the base configuration.
Includes data paths, agent model settings, and risk thresholds.
"""

from config.settings import Settings, get_regional_model_id


class KYCSettings(Settings):
    """KYC-specific settings extending base configuration."""
    
    # Data configuration
    data_prefix: str = "samples/kyc_banking"
    
    # Agent configuration - use regional model IDs
    # Note: These will be overridden by effective_bedrock_model_id in agents
    # that use the base class properly
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    
    @property
    def credit_analyst_model(self) -> str:
        """Get regional model ID for credit analyst."""
        return get_regional_model_id(self.aws_region, self._base_model)
    
    @property
    def compliance_officer_model(self) -> str:
        """Get regional model ID for compliance officer."""
        return get_regional_model_id(self.aws_region, self._base_model)
    
    # Use case specific thresholds
    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_kyc_settings() -> KYCSettings:
    """Get KYC-specific settings instance."""
    return KYCSettings()
