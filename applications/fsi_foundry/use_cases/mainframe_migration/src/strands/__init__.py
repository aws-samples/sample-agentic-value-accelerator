"""Mainframe Migration Use Case - Strands Implementation."""

from .orchestrator import MainframeMigrationOrchestrator, run_mainframe_migration
from .models import MainframeMigrationRequest, MainframeMigrationResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="mainframe_migration",
    config=RegisteredAgent(
        entry_point=run_mainframe_migration,
        request_model=MainframeMigrationRequest,
        response_model=MainframeMigrationResponse,
    )
)

__all__ = ["MainframeMigrationOrchestrator", "run_mainframe_migration", "MainframeMigrationRequest", "MainframeMigrationResponse"]
