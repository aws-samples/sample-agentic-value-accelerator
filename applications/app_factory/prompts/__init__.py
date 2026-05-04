"""Prompt factories for the app factory's subagents.

Each subagent gets its own module. Every factory has the signature:

    def <name>(use_case_name: str, fsi_foundry_path: str) -> str

and returns the full system prompt for that subagent as a single string.
"""
from .agent_builder import _agent_builder_prompt
from .ui_builder import _ui_builder_prompt
from .infra_builder import _infra_builder_prompt
from .data_builder import _data_builder_prompt
from .docs_builder import _docs_builder_prompt
from .validator import _validator_prompt
from .orchestrator import build_orchestrator_prompt

__all__ = [
    "_agent_builder_prompt",
    "_ui_builder_prompt",
    "_infra_builder_prompt",
    "_data_builder_prompt",
    "_docs_builder_prompt",
    "_validator_prompt",
    "build_orchestrator_prompt",
]
