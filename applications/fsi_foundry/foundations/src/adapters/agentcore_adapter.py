# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
"""
Amazon Bedrock AgentCore Adapter Module.

Creates generic Amazon Bedrock AgentCore applications for any registered agent.
This adapter handles AgentCore protocol translation and is designed
to work with any agent use case registered in the agent registry.
"""

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from base.registry import get_agent
from config.settings import settings
from utils.logging import get_logger

logger = get_logger(__name__)


def create_agentcore_app(agent_name: str) -> BedrockAgentCoreApp:
    """
    Create a generic AgentCore app for any registered agent.
    
    Creates a BedrockAgentCoreApp with an entrypoint that routes
    invocations to the registered agent. The app validates requests
    against the agent's request model and returns responses as dicts.
    
    Args:
        agent_name: Name of the registered agent to create app for
        
    Returns:
        Configured BedrockAgentCoreApp instance
        
    Raises:
        ValueError: If agent is not found in registry
        
    Usage:
        from adapters.agentcore_adapter import create_agentcore_app
        
        app = create_agentcore_app("kyc")
        # Deploy with AgentCore CLI
    """
    agent_config = get_agent(agent_name)
    
    app = BedrockAgentCoreApp()
    
    # Conditionally wrap entrypoint with Langfuse @observe for LangGraph tracing
    if settings.enable_tracing:
        try:
            from langfuse import observe

            @app.entrypoint
            @observe(name=f"agentcore-{agent_name}")
            async def agent_invocation(payload: dict, context) -> dict:
                try:
                    logger.info("agentcore_invoked", agent=agent_name)
                    request = agent_config.request_model(**payload)
                    response = await agent_config.entry_point(request)
                    logger.info("agentcore_completed", agent=agent_name)
                    return response.model_dump(mode="json")
                except Exception as e:
                    logger.error("agentcore_failed", agent=agent_name, error=str(e))
                    return {"error": str(e)}
        except ImportError:
            logger.debug("langfuse_observe_not_available")

            @app.entrypoint
            async def agent_invocation(payload: dict, context) -> dict:
                try:
                    logger.info("agentcore_invoked", agent=agent_name)
                    request = agent_config.request_model(**payload)
                    response = await agent_config.entry_point(request)
                    logger.info("agentcore_completed", agent=agent_name)
                    return response.model_dump(mode="json")
                except Exception as e:
                    logger.error("agentcore_failed", agent=agent_name, error=str(e))
                    return {"error": str(e)}
    else:
        @app.entrypoint
        async def agent_invocation(payload: dict, context) -> dict:
            try:
                logger.info("agentcore_invoked", agent=agent_name)
                request = agent_config.request_model(**payload)
                response = await agent_config.entry_point(request)
                logger.info("agentcore_completed", agent=agent_name)
                return response.model_dump(mode="json")
            except Exception as e:
                logger.error("agentcore_failed", agent=agent_name, error=str(e))
                return {"error": str(e)}

    return app
