"""AgentCore tools — discover and inspect deployed agents.

Wraps GovernAgentCoreService for use as LangChain tools.
"""

import json
from langchain_core.tools import tool

from services.govern_agentcore_service import GovernAgentCoreService


def _get_service(region: str = "us-east-1") -> GovernAgentCoreService:
    return GovernAgentCoreService(region=region)


@tool
def list_agents_tool(region: str = "us-east-1") -> str:
    """List all deployed agents (Bedrock Agents and AgentCore runtimes).

    Returns a list of agents with their IDs, names, status, platform, and version.
    Use this to discover what agents are running in the AWS environment.

    Args:
        region: AWS region to query (default: us-east-1)

    Returns:
        JSON with agents list and summary counts
    """
    svc = _get_service(region)
    result = svc.get_agents()

    return json.dumps({
        "agents": [a.model_dump() for a in result.agents],
        "total": result.total,
        "bedrock_agents": result.bedrock_agents,
        "agentcore_runtimes": result.agentcore_runtimes,
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)


@tool
def get_agent_posture_tool(region: str = "us-east-1") -> str:
    """Get AgentCore infrastructure posture (gateways, memories, policy engines, etc).

    Returns the status of AgentCore control plane resources:
    - Gateways and gateway targets
    - Memory stores
    - Workload identities
    - Policy engines
    - Knowledge bases

    Args:
        region: AWS region to query (default: us-east-1)

    Returns:
        JSON with posture categories and resource counts
    """
    svc = _get_service(region)
    result = svc.get_posture()

    return json.dumps({
        "categories": [
            {
                "key": c.key,
                "label": c.label,
                "total": c.total,
                "ready": c.ready,
                "items": [i.model_dump() for i in (c.items or [])],
                "live": c.live,
                "note": c.note,
            }
            for c in result.categories
        ],
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)


@tool
def get_agent_metrics_tool(region: str = "us-east-1", days: int = 7) -> str:
    """Get runtime metrics for deployed agents (invocations, latency, errors).

    Fetches CloudWatch metrics for AgentCore runtimes. Only agents with actual
    traffic will appear (idle runtimes don't emit metrics).

    Args:
        region: AWS region to query (default: us-east-1)
        days: Number of days of metrics to retrieve (default: 7)

    Returns:
        JSON with per-agent metrics (invocations, latency, errors, sessions)
    """
    svc = _get_service(region)
    result = svc.get_agent_metrics(days=days)

    return json.dumps({
        "by_agent": [m.model_dump() for m in result.by_agent],
        "window_days": result.window_days,
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)
