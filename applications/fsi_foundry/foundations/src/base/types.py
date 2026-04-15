# SPDX-License-Identifier: Apache-2.0
"""
Shared type definitions for AVA base classes.

Provides common dataclasses and enums used across all framework implementations.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from enum import Enum


class FrameworkType(Enum):
    """Supported agent frameworks."""
    LANGGRAPH = "langgraph"
    LANGCHAIN = "langchain"
    STRANDS = "strands"


@dataclass
class AgentConfig:
    """
    Configuration for creating an agent.
    
    Attributes:
        name: Unique identifier for the agent
        system_prompt: System prompt defining agent behavior
        tools: List of tools available to the agent
        model_id: Bedrock model ID (uses settings default if None)
        model_kwargs: Model configuration (temperature, max_tokens, etc.)
        verbose: Enable verbose logging
        max_iterations: Maximum tool-calling iterations
    """
    name: str
    system_prompt: str
    tools: List[Any] = field(default_factory=list)
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = field(default_factory=lambda: {
        "temperature": 0.1,
        "max_tokens": 4096
    })
    verbose: bool = True
    max_iterations: int = 5


@dataclass
class OrchestratorConfig:
    """
    Configuration for creating an orchestrator.
    
    Attributes:
        name: Unique identifier for the orchestrator
        agents: Dictionary of registered agent instances
        model_id: Bedrock model ID for synthesis/routing
        model_kwargs: Model configuration for synthesis LLM
    """
    name: str
    agents: Dict[str, Any] = field(default_factory=dict)
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = field(default_factory=lambda: {
        "temperature": 0.2,
        "max_tokens": 4096
    })


@dataclass
class ExecutionResult:
    """
    Standardized result from agent or orchestrator execution.
    
    Attributes:
        agent_name: Name of the agent that produced this result
        output: Primary output string
        raw_output: Raw output from underlying framework
        metadata: Additional metadata about the execution
    """
    agent_name: str
    output: str
    raw_output: Any = None
    metadata: Dict[str, Any] = field(default_factory=dict)
