"""Payment Operations Configuration (LangGraph)."""

from config.settings import Settings


class PaymentOpsSettings(Settings):
    data_prefix: str = "samples/payment_operations"
    exception_handler_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    settlement_agent_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_payment_ops_settings() -> PaymentOpsSettings:
    return PaymentOpsSettings()
