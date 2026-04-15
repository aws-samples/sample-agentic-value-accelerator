"""
Customer Chatbot Configuration.

Customer chatbot specific settings extending the base configuration.
Includes data paths, agent model settings, and chatbot thresholds.
"""

from config.settings import Settings


class CustomerChatbotSettings(Settings):
    """Customer chatbot specific settings extending base configuration."""

    data_prefix: str = "samples/customer_chatbot"

    conversation_manager_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    account_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    transaction_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    max_response_time_seconds: int = 15
    context_window_turns: int = 10
    escalation_confidence_threshold: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_chatbot_settings() -> CustomerChatbotSettings:
    """Get customer chatbot specific settings instance."""
    return CustomerChatbotSettings()
