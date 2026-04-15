"""Fraud Detection Configuration."""

from config.settings import Settings


class FraudDetectionSettings(Settings):
    data_prefix: str = "samples/fraud_detection"
    transaction_monitor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    pattern_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    alert_generator_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    alert_retention_days: int = 90

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_fraud_detection_settings() -> FraudDetectionSettings:
    return FraudDetectionSettings()
