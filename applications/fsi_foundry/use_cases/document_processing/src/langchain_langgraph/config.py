"""Document Processing Configuration."""
from config.settings import Settings

class DocumentProcessingSettings(Settings):
    data_prefix: str = "samples/document_processing"
    document_classifier_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    data_extractor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    validation_agent_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    classification_confidence_threshold: float = 0.85
    extraction_accuracy_threshold: float = 0.90
    max_document_size_mb: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_document_processing_settings() -> DocumentProcessingSettings:
    return DocumentProcessingSettings()
