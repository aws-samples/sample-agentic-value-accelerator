"""Mainframe Migration Configuration (Strands)."""

try:
    from config.settings import Settings, get_regional_model_id
except (ImportError, ModuleNotFoundError):
    from pydantic_settings import BaseSettings as Settings
    def get_regional_model_id(region, base_model="anthropic.claude-haiku-4-5-20251001-v1:0"):
        return f"us.{base_model}" if region.startswith("us-") else f"eu.{base_model}" if region.startswith("eu-") else f"us.{base_model}"


class MainframeMigrationSettings(Settings):
    data_prefix: str = "samples/mainframe_migration"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def mainframe_analyzer_model(self):
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def business_rule_extractor_model(self):
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    @property
    def cloud_code_generator_model(self):
        return get_regional_model_id(getattr(self, 'aws_region', 'us-east-1'), self._base_model)

    max_analysis_time_seconds: int = 180
    extraction_confidence_threshold: float = 0.8
    code_generation_quality_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_mainframe_migration_settings():
    return MainframeMigrationSettings()
