"""Email Triage Use Case Configuration."""
from config.settings import Settings

class EmailTriageSettings(Settings):
    data_prefix: str = "samples/email_triage"
    email_classifier_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    action_extractor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    urgency_threshold: float = 0.7
    max_actions_per_email: int = 10
    classification_confidence_threshold: float = 0.8
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_email_triage_settings() -> EmailTriageSettings:
    return EmailTriageSettings()
