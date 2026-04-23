"""
Document Search Use Case Configuration.

Document search specific settings extending the base configuration.
Includes data paths, agent model settings, and search thresholds.
"""

from config.settings import Settings


class DocumentSearchSettings(Settings):
    """Document search specific settings extending base configuration."""

    # Data configuration
    data_prefix: str = "samples/document_search"

    # Agent configuration
    document_indexer_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    search_agent_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

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
