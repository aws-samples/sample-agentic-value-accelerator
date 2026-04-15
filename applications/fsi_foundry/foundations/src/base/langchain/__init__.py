"""
LangChain base classes for agent and orchestrator development.

Usage:
    from base.langchain import LangChainAgent, LangChainOrchestrator
"""

from base.langchain.agent import LangChainAgent
from base.langchain.orchestrator import LangChainOrchestrator

__all__ = ["LangChainAgent", "LangChainOrchestrator"]
