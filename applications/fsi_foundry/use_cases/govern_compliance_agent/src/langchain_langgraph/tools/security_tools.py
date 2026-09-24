"""Security tools — GuardDuty and Security Hub integration.

Wraps GovernGuardDutyAIService and GovernSecurityHubAIService for use as LangChain tools.
"""

import json
from langchain_core.tools import tool

from services.govern_guardduty_ai_service import GovernGuardDutyAIService
from services.govern_security_hub_ai_service import GovernSecurityHubAIService


@tool
def get_guardduty_findings_tool(region: str = "us-east-1", limit: int = 50) -> str:
    """Get AI-related security findings from GuardDuty.

    Fetches active GuardDuty findings filtered for AI/ML services (Bedrock, SageMaker, etc).
    Findings are categorized by severity and AI-specific threat type.

    Categories include:
    - unauthorized_access: Unauthorized API calls or access attempts
    - data_exfiltration: Potential data theft from AI systems
    - credential_access: Compromised credentials used with AI services
    - model_abuse: Suspicious model invocation patterns
    - prompt_injection: Potential prompt injection attacks
    - anomalous_behavior: Unusual activity patterns

    Args:
        region: AWS region to query (default: us-east-1)
        limit: Maximum findings to return (default: 50)

    Returns:
        JSON with findings, severity counts, and category breakdown
    """
    svc = GovernGuardDutyAIService(region=region)
    result = svc.get_findings(limit=limit)

    return json.dumps({
        "findings": [f.model_dump() for f in result.findings],
        "total": result.total,
        "by_severity": [s.model_dump() for s in result.by_severity],
        "by_category": [c.model_dump() for c in result.by_category],
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)


@tool
def get_security_hub_inventory_tool(region: str = "us-east-1") -> str:
    """Get AI asset inventory from Security Hub.

    Discovers AI workloads in the AWS account:
    - Bedrock models, agents, guardrails, knowledge bases
    - SageMaker endpoints and models

    Also reports how many assets have security findings.

    Args:
        region: AWS region to query (default: us-east-1)

    Returns:
        JSON with asset counts and findings summary
    """
    svc = GovernSecurityHubAIService(region=region)
    result = svc.get_ai_inventory()

    return json.dumps({
        "total": result.total,
        "bedrock_models": result.bedrock_models,
        "bedrock_agents": result.bedrock_agents,
        "bedrock_guardrails": result.bedrock_guardrails,
        "bedrock_knowledge_bases": result.bedrock_knowledge_bases,
        "sagemaker_endpoints": result.sagemaker_endpoints,
        "sagemaker_models": result.sagemaker_models,
        "with_findings": result.with_findings,
        "critical_high": result.critical_high,
        "live": result.live,
        "source": result.source,
        "note": result.note,
    }, indent=2)
