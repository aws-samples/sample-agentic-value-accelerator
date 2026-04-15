"""Legacy Migration - Strands."""
from .orchestrator import LegacyMigrationOrchestrator, run_legacy_migration
from .models import MigrationRequest, MigrationResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="legacy_migration", config=RegisteredAgent(entry_point=run_legacy_migration, request_model=MigrationRequest, response_model=MigrationResponse))
__all__ = ["LegacyMigrationOrchestrator", "run_legacy_migration", "MigrationRequest", "MigrationResponse"]
