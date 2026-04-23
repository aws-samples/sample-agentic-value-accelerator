"""Fraud Detection Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class FraudDetectionSettings(Settings):
    data_prefix: str = "samples/fraud_detection"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def transaction_monitor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def pattern_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def alert_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    risk_threshold_high: int = 75
    risk_threshold_critical: int = 90
    alert_retention_days: int = 90

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_fraud_detection_settings() -> FraudDetectionSettings:
    return FraudDetectionSettings()
