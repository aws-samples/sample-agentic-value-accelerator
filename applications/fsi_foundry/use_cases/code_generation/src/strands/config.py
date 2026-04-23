"""Code Generation Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id


class CodeGenerationSettings(Settings):
    data_prefix: str = "samples/code_generation"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def requirement_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def code_scaffolder_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def test_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_generation_time_seconds: int = 90
    quality_threshold: float = 0.8
    test_coverage_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_code_generation_settings() -> CodeGenerationSettings:
    return CodeGenerationSettings()
