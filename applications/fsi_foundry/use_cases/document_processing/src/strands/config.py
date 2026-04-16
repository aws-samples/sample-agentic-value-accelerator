"""Document Processing Configuration (Strands Implementation)."""
from config.settings import Settings, get_regional_model_id

class DocumentProcessingSettings(Settings):
    data_prefix: str = "samples/document_processing"
    _base_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"

    @property
    def document_classifier_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def data_extractor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)
    @property
    def validation_agent_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    classification_confidence_threshold: float = 0.85
    extraction_accuracy_threshold: float = 0.90
    max_document_size_mb: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

def get_document_processing_settings() -> DocumentProcessingSettings:
    return DocumentProcessingSettings()
