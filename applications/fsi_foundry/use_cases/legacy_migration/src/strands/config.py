"""Legacy Migration Configuration (Strands)."""
from config.settings import Settings, get_regional_model_id

class LegacyMigrationSettings(Settings):
    data_prefix: str = "samples/legacy_migration"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    @property
    def code_analyzer_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def migration_planner_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def conversion_agent_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    max_analysis_time_seconds: int = 120
    complexity_threshold: float = 0.7
    conversion_confidence_target: float = 0.85
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_legacy_migration_settings() -> LegacyMigrationSettings:
    return LegacyMigrationSettings()
