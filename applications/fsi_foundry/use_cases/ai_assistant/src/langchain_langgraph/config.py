"""
AI Assistant Use Case Configuration.

AI-assistant-specific settings extending the base configuration.
"""

from config.settings import Settings


class AiAssistantSettings(Settings):
    """AI assistant specific settings."""

    data_prefix: str = "samples/ai_assistant"

    task_router_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    data_lookup_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    report_generator_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    max_response_time_seconds: int = 30
    max_report_pages: int = 50
    data_freshness_hours: int = 24

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_ai_assistant_settings() -> AiAssistantSettings:
    return AiAssistantSettings()
