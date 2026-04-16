"""
AVA Base Classes Module.

Provides framework-specific base classes for rapid agent and orchestrator development.
Supports LangGraph, LangChain, and Strands frameworks with consistent interfaces.

Usage:
    from base import LangGraphAgent, LangGraphOrchestrator
    from base import StrandsAgent, StrandsOrchestrator
    from base import AgentConfig, ExecutionResult
"""

from base.types import (
    AgentConfig,
    OrchestratorConfig,
    ExecutionResult,
    FrameworkType,
)
from base.patterns import (
    parallel_execution,
    sequential_pipeline,
    conditional_router,
)
from base.registry import (
    register_agent,
    get_agent,
    list_agents,
)

__all__ = [
    # Types
    "AgentConfig",
    "OrchestratorConfig", 
    "ExecutionResult",
    "FrameworkType",
    # Patterns
    "parallel_execution",
    "sequential_pipeline",
    "conditional_router",
    # Registry
    "register_agent",
    "get_agent",
    "list_agents",
]

# Lazy imports for framework-specific classes
def __getattr__(name: str):
    if name in ("LangGraphAgent",):
        from base.langgraph.agent import LangGraphAgent
        return LangGraphAgent
    if name in ("LangGraphOrchestrator",):
        from base.langgraph.orchestrator import LangGraphOrchestrator
        return LangGraphOrchestrator
    if name in ("LangChainAgent",):
        from base.langchain.agent import LangChainAgent
        return LangChainAgent
    if name in ("LangChainOrchestrator",):
        from base.langchain.orchestrator import LangChainOrchestrator
        return LangChainOrchestrator
    if name in ("StrandsAgent",):
        from base.strands.agent import StrandsAgent
        return StrandsAgent
    if name in ("StrandsOrchestrator",):
        from base.strands.orchestrator import StrandsOrchestrator
        return StrandsOrchestrator
    raise AttributeError(f"module 'base' has no attribute '{name}'")
