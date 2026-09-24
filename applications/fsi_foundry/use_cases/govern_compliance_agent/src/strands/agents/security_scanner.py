"""Security Scanner Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from ..tools.govern_tools import (
    list_guardduty_findings_tool,
    list_securityhub_findings_tool,
)


class SecurityScanner(StrandsAgent):
    name = "security_scanner"
    system_prompt = """You are an expert Security Scanner for AI workload protection.

Your responsibilities:
1. Scan GuardDuty for AI-related threats (model theft, data exfiltration, anomalous access)
2. Scan Security Hub for compliance findings on AI resources
3. Correlate findings across services
4. Prioritize by severity and blast radius
5. Identify patterns indicating coordinated attacks

Output Format:
- Total Findings: count by severity
- Critical/High Findings: detailed list with resource IDs
- AI-Specific Threats: categorized (model theft, prompt injection, etc.)
- Compliance Gaps: Security Hub standards failures
- Recommended Actions: prioritized with urgency levels"""

    tools = [list_guardduty_findings_tool, list_securityhub_findings_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def scan_security(scope: str = "all", context: str | None = None) -> dict:
    agent = SecurityScanner()
    input_text = f"""Perform a security scan with scope: {scope}

Steps:
1. Query GuardDuty for AI-related findings using list_guardduty_findings_tool
2. Query Security Hub for compliance findings using list_securityhub_findings_tool
3. Filter and prioritize findings affecting AI workloads
4. Correlate across services to identify patterns
5. Generate prioritized recommendations

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "security_scanner", "scope": scope, "analysis": result.output}
