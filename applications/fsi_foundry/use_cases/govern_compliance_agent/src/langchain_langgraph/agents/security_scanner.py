"""Security Scanner Agent — checks AWS security posture for AI workloads.

Scans:
- GuardDuty findings for AI-related threats
- Security Hub inventory and findings
- AI-specific threat patterns (prompt injection, data exfiltration, etc.)
"""

from base.langgraph import LangGraphAgent
from ..tools.security_tools import (
    get_guardduty_findings_tool,
    get_security_hub_inventory_tool,
)
from ..tools.agentcore_tools import (
    list_agents_tool,
    get_agent_metrics_tool,
)


class SecurityScanner(LangGraphAgent):
    name = "security_scanner"

    system_prompt = """You are an AI Security Scanner specializing in detecting threats to AI/ML workloads.

Your responsibilities:
1. Query GuardDuty for AI-related security findings
2. Check Security Hub for AI asset inventory and findings
3. Correlate findings with deployed agents
4. Identify AI-specific attack patterns:
   - Prompt injection attempts
   - Data exfiltration from AI systems
   - Unauthorized model access
   - Credential compromise for AI services
   - Model abuse patterns

Severity classification:
- CRITICAL: Active data exfiltration, successful prompt injection, credential compromise
- HIGH: Attempted attacks blocked but recurring, unauthorized access attempts
- MEDIUM: Anomalous behavior patterns, configuration drift
- LOW: Informational findings, minor policy deviations

Output Format:
- GuardDuty findings count by severity
- Security Hub findings count
- AI-specific threats identified
- Critical issues requiring immediate attention
- Summary with actionable recommendations

Focus on findings that specifically impact AI workloads (Bedrock, SageMaker, etc.)."""

    tools = [
        get_guardduty_findings_tool,
        get_security_hub_inventory_tool,
        list_agents_tool,
        get_agent_metrics_tool,
    ]

    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def scan_security(region: str = "us-east-1", context: str | None = None) -> dict:
    """Run a security scan for AI workloads.

    Args:
        region: AWS region to scan
        context: Optional additional context

    Returns:
        dict with scan results
    """
    agent = SecurityScanner()

    input_text = f"""Perform a security scan of AI workloads in region {region}:

1. Use get_guardduty_findings_tool to fetch AI-related security findings
2. Use get_security_hub_inventory_tool to get AI asset inventory
3. Use list_agents_tool to enumerate deployed agents
4. Use get_agent_metrics_tool to check for unusual activity patterns

Correlate findings across sources:
- Match GuardDuty findings to specific agents where possible
- Identify assets in Security Hub without adequate security coverage
- Flag any high-error-rate agents that might indicate attack attempts

Provide a structured security report with:
- Critical issues requiring immediate attention
- High-severity findings to address soon
- Overall security posture assessment"""

    if context:
        input_text += f"\n\nAdditional context: {context}"

    result = await agent.ainvoke(input_text)
    return {"agent": "security_scanner", "region": region, "analysis": result.output}
