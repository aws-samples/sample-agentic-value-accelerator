"""Email Triage Use Case Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id

class EmailTriageSettings(Settings):
    data_prefix: str = "samples/email_triage"
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    @property
    def email_classifier_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def action_extractor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    urgency_threshold: float = 0.7
    max_actions_per_email: int = 10
    classification_confidence_threshold: float = 0.8
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_email_triage_settings() -> EmailTriageSettings:
    return EmailTriageSettings()
