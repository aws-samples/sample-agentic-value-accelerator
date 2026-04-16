"""Market Surveillance Configuration (LangGraph)."""
from config.settings import Settings

class SurveillanceSettings(Settings):
    data_prefix: str = "samples/market_surveillance"
    trade_pattern_analyst_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    communication_monitor_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    surveillance_alert_generator_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_surveillance_settings(): return SurveillanceSettings()
