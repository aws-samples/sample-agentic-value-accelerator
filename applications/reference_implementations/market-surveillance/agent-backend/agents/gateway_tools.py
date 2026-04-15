"""
Gateway tools for calling backend Lambda APIs via AgentCore Gateway

AgentCore Gateway uses AWS IAM SigV4 authentication. This module provides
MCP client access to gateway tools for investigation summary management.
"""

import re
import logging
from typing import Optional
from strands.tools.mcp import MCPClient
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client

# Configure logger
logger = logging.getLogger(__name__)

# Global configuration
_gateway_url: Optional[str] = None
_aws_region: Optional[str] = None


def init_gateway_client(gateway_url: str, aws_region: str):
    """
    Initialize the global gateway configuration.
    
    Args:
        gateway_url: Gateway endpoint URL (e.g., https://{gateway_id}.gateway.bedrock-agentcore.{region}.amazonaws.com)
        aws_region: AWS region for IAM authentication
    """
    global _gateway_url, _aws_region
    _gateway_url = gateway_url
    _aws_region = aws_region
    logger.info(f"[Gateway Client] Initialized with URL: {gateway_url}, Region: {aws_region}")


def get_gateway_client(tool_filter_pattern: Optional[str] = None, prefix: str = "gateway") -> MCPClient:
    """
    Get MCP client for AgentCore Gateway with optional tool filtering.
    
    The MCP client automatically discovers and exposes all tools from the gateway
    based on the OpenAPI specification.
    
    Authentication Flow:
    - Agent Runtime → Gateway: AWS IAM SigV4 (using runtime's IAM role)
    - Gateway → Backend Lambda: Direct invocation (same AWS account)
    
    Available Tools (from Lambda targets):
    - gateway_get_latest_summary: Retrieve the latest investigation summary for an alert
    - gateway_save_summary: Save a new investigation summary for an alert
    
    Args:
        tool_filter_pattern: Optional regex pattern to filter tools (e.g., "^gateway_get")
        prefix: Prefix for tool names (default: "gateway")
        
    Returns:
        MCPClient instance with gateway tools
    """
    if not _gateway_url or not _aws_region:
        raise Exception("Gateway not initialized. Call init_gateway_client() first.")
    
    logger.info(f"[Gateway Client] Creating MCP client for URL: {_gateway_url}")
    logger.info(f"[Gateway Client] AWS Region: {_aws_region}")
    logger.info(f"[Gateway Client] Prefix: {prefix}")
    
    # Create tool filters if pattern provided
    tool_filters = None
    if tool_filter_pattern:
        tool_filters = {"allowed": [re.compile(tool_filter_pattern)]}
        logger.info(f"[Gateway Client] Tool filter pattern: {tool_filter_pattern}")
    else:
        logger.info(f"[Gateway Client] No tool filter (all tools will be available)")
    
    try:
        # Create MCP client with AWS IAM authentication
        # Uses the runtime's IAM role for SigV4 signing
        logger.info("[Gateway Client] Creating aws_iam_streamablehttp_client...")
        
        client = MCPClient(
            lambda: aws_iam_streamablehttp_client(
                endpoint=_gateway_url,
                aws_region=_aws_region,
                aws_service="bedrock-agentcore"
            ),
            prefix=prefix,
            tool_filters=tool_filters
        )
        
        logger.info(f"[Gateway Client] MCP client created successfully")
        return client
        
    except Exception as e:
        logger.error(f"[Gateway Client] Failed to create MCP client: {type(e).__name__}: {str(e)}", exc_info=True)
        raise
