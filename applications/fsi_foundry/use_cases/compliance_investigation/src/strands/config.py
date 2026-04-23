"""Compliance Investigation Use Case Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class ComplianceInvestigationSettings(Settings):
    data_prefix: str = "samples/compliance_investigation"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def evidence_gatherer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def pattern_matcher_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def regulatory_mapper_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_investigation_time_seconds: int = 60
    violation_confidence_threshold: float = 0.75
    evidence_completeness_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_compliance_investigation_settings() -> ComplianceInvestigationSettings:
    return ComplianceInvestigationSettings()
