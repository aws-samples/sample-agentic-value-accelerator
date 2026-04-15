"""Mainframe Migration Use Case.

AI-powered mainframe migration for financial services.
Supports LangGraph (default) and Strands frameworks.
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_mainframe_migration
    from strands.models import MainframeMigrationRequest, MainframeMigrationResponse

    register_agent("mainframe_migration", RegisteredAgent(
        entry_point=run_mainframe_migration,
        request_model=MainframeMigrationRequest,
        response_model=MainframeMigrationResponse,
    ))
else:
    from langchain_langgraph.orchestrator import run_mainframe_migration
    from langchain_langgraph.models import MainframeMigrationRequest, MainframeMigrationResponse

    register_agent("mainframe_migration", RegisteredAgent(
        entry_point=run_mainframe_migration,
        request_model=MainframeMigrationRequest,
        response_model=MainframeMigrationResponse,
    ))

__all__ = ["run_mainframe_migration", "MainframeMigrationRequest", "MainframeMigrationResponse"]
