"""
Customer Chatbot Configuration (Strands Implementation).

Customer chatbot specific settings extending the base configuration.
Includes data paths, agent model settings, and chatbot thresholds.
"""

from config.settings import Settings, get_regional_model_id


class CustomerChatbotSettings(Settings):
    """Customer chatbot specific settings extending base configuration."""

    data_prefix: str = "samples/customer_chatbot"

    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def conversation_manager_model(self) -> str:
        """Get regional model ID for conversation manager."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def account_agent_model(self) -> str:
        """Get regional model ID for account agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def transaction_agent_model(self) -> str:
        """Get regional model ID for transaction agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    max_response_time_seconds: int = 15
    context_window_turns: int = 10
    escalation_confidence_threshold: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_customer_chatbot_settings() -> CustomerChatbotSettings:
    """Get customer chatbot specific settings instance."""
    return CustomerChatbotSettings()
