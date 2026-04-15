"""Market Surveillance Configuration (Strands)."""
from config.settings import Settings, get_regional_model_id

class SurveillanceSettings(Settings):
    data_prefix: str = "samples/market_surveillance"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    @property
    def trade_pattern_analyst_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def communication_monitor_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def surveillance_alert_generator_model(self): return get_regional_model_id(self.aws_region, self._base_model)
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_surveillance_settings(): return SurveillanceSettings()
