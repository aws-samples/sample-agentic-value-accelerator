"""
KYC Use Case Configuration.

KYC-specific settings extending the base configuration.
Includes data paths, agent model settings, and risk thresholds.
"""

from config.settings import Settings


class KYCSettings(Settings):
    """KYC-specific settings extending base configuration."""
    
    # Data configuration
    data_prefix: str = "samples/kyc_banking"
    
    # Agent configuration
    credit_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    compliance_officer_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    
    # Use case specific thresholds
    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_kyc_settings() -> KYCSettings:
    """Get KYC-specific settings instance."""
    return KYCSettings()
