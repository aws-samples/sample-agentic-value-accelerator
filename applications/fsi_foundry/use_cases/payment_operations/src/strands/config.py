"""Payment Operations Configuration (Strands)."""

from config.settings import Settings, get_regional_model_id


class PaymentOpsSettings(Settings):
    data_prefix: str = "samples/payment_operations"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def exception_handler_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def settlement_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_payment_ops_settings() -> PaymentOpsSettings:
    return PaymentOpsSettings()
