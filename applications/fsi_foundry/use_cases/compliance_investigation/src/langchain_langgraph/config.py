"""Compliance Investigation Use Case Configuration."""

from config.settings import Settings


class ComplianceInvestigationSettings(Settings):
    data_prefix: str = "samples/compliance_investigation"
    evidence_gatherer_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    pattern_matcher_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    regulatory_mapper_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_investigation_time_seconds: int = 60
    violation_confidence_threshold: float = 0.75
    evidence_completeness_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_compliance_investigation_settings() -> ComplianceInvestigationSettings:
    return ComplianceInvestigationSettings()
