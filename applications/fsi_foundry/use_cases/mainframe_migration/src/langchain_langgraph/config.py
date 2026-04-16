"""Mainframe Migration Configuration (LangGraph)."""

from config.settings import Settings


class MainframeMigrationSettings(Settings):
    data_prefix: str = "samples/mainframe_migration"
    mainframe_analyzer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    business_rule_extractor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    cloud_code_generator_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    max_analysis_time_seconds: int = 180
    extraction_confidence_threshold: float = 0.8
    code_generation_quality_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_mainframe_migration_settings():
    return MainframeMigrationSettings()
