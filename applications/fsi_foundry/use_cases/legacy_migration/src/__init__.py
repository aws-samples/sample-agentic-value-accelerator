"""Legacy Migration Use Case."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_legacy_migration
    from strands.models import MigrationRequest, MigrationResponse
else:
    from langchain_langgraph.orchestrator import run_legacy_migration
    from langchain_langgraph.models import MigrationRequest, MigrationResponse
register_agent("legacy_migration", RegisteredAgent(entry_point=run_legacy_migration, request_model=MigrationRequest, response_model=MigrationResponse))
__all__ = ["run_legacy_migration", "MigrationRequest", "MigrationResponse"]
