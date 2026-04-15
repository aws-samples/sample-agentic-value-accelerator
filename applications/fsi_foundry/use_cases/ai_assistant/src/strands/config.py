"""
AI Assistant Use Case Configuration (Strands Implementation).

AI-assistant-specific settings extending the base configuration.
"""

from config.settings import Settings, get_regional_model_id


class AiAssistantSettings(Settings):
    """AI assistant specific settings."""

    data_prefix: str = "samples/ai_assistant"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def task_router_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def data_lookup_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def report_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    max_response_time_seconds: int = 30
    max_report_pages: int = 50
    data_freshness_hours: int = 24

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_ai_assistant_settings() -> AiAssistantSettings:
    return AiAssistantSettings()
