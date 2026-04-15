"""Legacy Migration Configuration."""
from config.settings import Settings

class LegacyMigrationSettings(Settings):
    data_prefix: str = "samples/legacy_migration"
    code_analyzer_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    migration_planner_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    conversion_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    max_analysis_time_seconds: int = 120
    complexity_threshold: float = 0.7
    conversion_confidence_target: float = 0.85
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_legacy_migration_settings() -> LegacyMigrationSettings:
    return LegacyMigrationSettings()
