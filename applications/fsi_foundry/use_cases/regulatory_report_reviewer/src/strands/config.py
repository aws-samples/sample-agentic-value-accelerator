"""Regulatory Report Reviewer Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class RegulatoryReviewSettings(Settings):
    data_prefix: str = "samples/regulatory_report_reviewer"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def completeness_checker_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def language_reviewer_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def quality_assessor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    quality_pass_threshold: int = 80
    quality_fail_threshold: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_regulatory_review_settings() -> RegulatoryReviewSettings:
    return RegulatoryReviewSettings()
