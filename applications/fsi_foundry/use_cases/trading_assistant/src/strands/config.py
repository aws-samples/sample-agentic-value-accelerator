"""Trading Assistant Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class TradingAssistantSettings(Settings):
    data_prefix: str = "samples/trading_assistant"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def market_analyst_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def trade_idea_generator_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def execution_planner_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    market_impact_threshold: float = 0.05
    min_confidence_score: float = 0.7
    max_execution_slippage: float = 0.02

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_trading_assistant_settings() -> TradingAssistantSettings:
    return TradingAssistantSettings()
