"""Compliance Deadline Monitor Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class ComplianceDeadlineSettings(Settings):
    data_prefix: str = "samples/compliance_deadline_monitor"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def deadline_tracker_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def risk_assessor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    critical_threshold_days: int = 3
    warning_threshold_days: int = 7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_compliance_deadline_settings() -> ComplianceDeadlineSettings:
    return ComplianceDeadlineSettings()
