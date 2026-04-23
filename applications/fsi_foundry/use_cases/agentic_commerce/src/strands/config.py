"""Agentic Commerce Configuration (Strands)."""
from config.settings import Settings, get_regional_model_id

class CommerceSettings(Settings):
    data_prefix: str = "samples/agentic_commerce"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    @property
    def offer_engine_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def fulfillment_agent_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def product_matcher_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_commerce_settings(): return CommerceSettings()
