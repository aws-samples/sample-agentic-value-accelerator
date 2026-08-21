"""
Underwriting Submission Triage Configuration (Strands Implementation).

Use-case-specific settings extending the base configuration: the S3 data
prefix and per-agent model selection.

Note on thresholds: this use case is deliberately data-driven. The risk
appetite ruleset - prohibited classes, coastal distances, value limits,
concentration caps - lives in each submission's compliance record, not here,
so that rules can change without a code change and every finding can cite the
rule it came from. Configuration therefore carries only infrastructure
concerns (where data lives, which model to use), not underwriting thresholds.
"""

try:
    from config.settings import Settings, get_regional_model_id
except (ImportError, ModuleNotFoundError):
    from pydantic_settings import BaseSettings as Settings

    def get_regional_model_id(region: str, base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0") -> str:
        if region.startswith("us-"):
            return f"us.{base_model}"
        elif region.startswith("eu-"):
            return f"eu.{base_model}"
        return f"us.{base_model}"


class UnderwritingSubmissionSettings(Settings):
    """Underwriting submission triage settings extending base configuration."""

    data_prefix: str = "samples/underwriting_submission"

    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def appetite_screener_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def exposure_analyst_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def pricing_indicator_model(self) -> str:
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_underwriting_submission_settings() -> UnderwritingSubmissionSettings:
    return UnderwritingSubmissionSettings()
