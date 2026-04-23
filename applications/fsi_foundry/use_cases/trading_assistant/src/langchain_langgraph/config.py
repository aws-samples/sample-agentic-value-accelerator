"""Trading Assistant Configuration."""

from config.settings import Settings


class TradingAssistantSettings(Settings):
    data_prefix: str = "samples/trading_assistant"
    market_analyst_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    trade_idea_generator_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    execution_planner_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    market_impact_threshold: float = 0.05
    min_confidence_score: float = 0.7
    max_execution_slippage: float = 0.02

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_trading_assistant_settings() -> TradingAssistantSettings:
    return TradingAssistantSettings()
