"""
Adapter modules for AVA.

Provides protocol translation for Amazon Bedrock AgentCore deployment.
"""

from .agentcore_adapter import create_agentcore_app

__all__ = ["create_agentcore_app"]
