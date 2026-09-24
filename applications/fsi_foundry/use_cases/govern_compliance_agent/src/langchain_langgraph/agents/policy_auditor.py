"""Policy Auditor Agent — checks agent configurations against governance policies.

Audits:
- Guardrail assignments (agents should have guardrails)
- Autonomy tier appropriateness
- Enforcement policy coverage
- A2A trust configurations
"""

from base.langgraph import LangGraphAgent
from ..tools.agentcore_tools import (
    list_agents_tool,
    get_agent_posture_tool,
)
from ..tools.guardrail_tools import (
    list_guardrails_tool,
)
from ..tools.enforcement_tools import (
    list_policies_tool,
    evaluate_enforcement_tool,
)


class PolicyAuditor(LangGraphAgent):
    name = "policy_auditor"

    system_prompt = """You are an AI Governance Policy Auditor specializing in agent compliance.

Your responsibilities:
1. Discover all deployed agents (Bedrock Agents and AgentCore runtimes)
2. Check each agent's guardrail assignment - ALL agents should have a guardrail
3. Verify enforcement policies exist and are appropriate
4. Assess autonomy tier assignments against agent risk profiles
5. Identify policy gaps and violations

When auditing agents:
- An agent WITHOUT a guardrail is a CRITICAL violation
- An agent at autonomy L3+ without explicit approval is a HIGH violation
- Missing enforcement policies for high-risk agents is a MEDIUM violation
- Inconsistent A2A trust configurations is a MEDIUM violation

Output Format:
- Total agents discovered
- Agents missing guardrails (CRITICAL)
- Autonomy tier concerns (specify agent and issue)
- Policy gaps identified
- Specific violations with severity
- Summary with counts by severity

Be thorough but concise. Flag specific agent IDs that need attention."""

    tools = [
        list_agents_tool,
        get_agent_posture_tool,
        list_guardrails_tool,
        list_policies_tool,
        evaluate_enforcement_tool,
    ]

    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def audit_policies(context: str | None = None) -> dict:
    """Run a policy audit across all deployed agents.

    Args:
        context: Optional additional context for the audit

    Returns:
        dict with audit results
    """
    agent = PolicyAuditor()

    input_text = """Perform a comprehensive policy audit:

1. Use list_agents_tool to discover all deployed agents
2. Use list_guardrails_tool to see available guardrails
3. For each agent, check if it has a guardrail assigned
4. Use list_policies_tool to review enforcement policies
5. Use evaluate_enforcement_tool (dry_run=True) to test policy coverage for a sample action

Flag any agents without guardrails as CRITICAL violations.
Identify any policy gaps or autonomy concerns.

Provide a structured report with specific agent IDs and recommended actions."""

    if context:
        input_text += f"\n\nAdditional context: {context}"

    result = await agent.ainvoke(input_text)
    return {"agent": "policy_auditor", "analysis": result.output}
