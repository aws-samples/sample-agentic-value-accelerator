"""
Document Search Use Case Configuration (Strands Implementation).

Document search specific settings extending the base configuration.
Includes data paths, agent model settings, and search thresholds.
"""

from config.settings import Settings, get_regional_model_id


class DocumentSearchSettings(Settings):
    """Document search specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/document_search"

    # Agent configuration - use regional model IDs
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"

    @property
    def document_indexer_model(self) -> str:
        """Get regional model ID for document indexer."""
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def search_agent_model(self) -> str:
        """Get regional model ID for search agent."""
        return get_regional_model_id(self.aws_region, self._base_model)

    # Document IDs available in the corpus (add new IDs as data grows)
    document_ids: list[str] = ["DOC001"]

    # Use case specific thresholds
    relevance_threshold: float = 0.7
    max_results: int = 10
    index_refresh_interval_seconds: int = 3600

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_document_search_settings() -> DocumentSearchSettings:
    """Get document search specific settings instance."""
    return DocumentSearchSettings()
