"""Code Generation Configuration."""
from config.settings import Settings


class CodeGenerationSettings(Settings):
    data_prefix: str = "samples/code_generation"
    requirement_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    code_scaffolder_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    test_generator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_generation_time_seconds: int = 90
    quality_threshold: float = 0.8
    test_coverage_target: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_code_generation_settings() -> CodeGenerationSettings:
    return CodeGenerationSettings()
