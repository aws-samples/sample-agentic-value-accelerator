"""Agentic Commerce Configuration (LangGraph)."""
from config.settings import Settings

class CommerceSettings(Settings):
    data_prefix: str = "samples/agentic_commerce"
    offer_engine_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    fulfillment_agent_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    product_matcher_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_commerce_settings(): return CommerceSettings()
