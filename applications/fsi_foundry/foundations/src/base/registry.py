# SPDX-License-Identifier: Apache-2.0
"""
Agent Registry Module.

Provides a centralized registry for registering and discovering agents.
Each agent registers with a name, entry point function, and request/response models.
"""

from typing import Dict, Callable, Type
from pydantic import BaseModel
from dataclasses import dataclass


@dataclass
class RegisteredAgent:
    """Configuration for a registered agent.
    
    Attributes:
        entry_point: Async function to call when invoking the agent
        request_model: Pydantic model for request validation
        response_model: Pydantic model for response validation
    """
    entry_point: Callable
    request_model: Type[BaseModel]
    response_model: Type[BaseModel]


_REGISTRY: Dict[str, RegisteredAgent] = {}


def register_agent(name: str, config: RegisteredAgent) -> None:
    """Register an agent in the global registry.
    
    Args:
        name: Unique name for the agent
        config: RegisteredAgent containing entry point and models
        
    Raises:
        ValueError: If an agent with the same name is already registered
    """
    if name in _REGISTRY:
        raise ValueError(f"Agent '{name}' is already registered")
    _REGISTRY[name] = config


def get_agent(name: str) -> RegisteredAgent:
    """Get agent configuration by name.
    
    Args:
        name: Name of the registered agent
        
    Returns:
        RegisteredAgent for the requested agent
        
    Raises:
        ValueError: If agent is not found in registry
    """
    if name not in _REGISTRY:
        available = list(_REGISTRY.keys())
        raise ValueError(f"Agent '{name}' not found. Available: {available}")
    return _REGISTRY[name]


def list_agents() -> list[str]:
    """List all registered agent names.
    
    Returns:
        List of registered agent names
    """
    return list(_REGISTRY.keys())
