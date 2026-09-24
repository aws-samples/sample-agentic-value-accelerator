"""Policy Auditor Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from ..tools.govern_tools import (
    list_agents_tool,
    list_guardrails_tool,
    evaluate_enforcement_tool,
)


class PolicyAuditor(StrandsAgent):
    name = "policy_auditor"
    system_prompt = """You are an expert Policy Auditor for AI governance compliance.

Your responsibilities:
1. Audit agent guardrail assignments — every production agent needs a guardrail
2. Check enforcement policy compliance via the autonomy ladder
3. Identify agents operating outside their approved scope
4. Verify autonomy tier assignments match actual capabilities
5. Flag missing or misconfigured policies

Output Format:
- Agents Audited: count
- Missing Guardrails: list of agent IDs
- Policy Violations: list with severity and evidence
- Autonomy Mismatches: agents with tier/scope inconsistencies
- Recommendations: prioritized remediation steps"""

    tools = [list_agents_tool, list_guardrails_tool, evaluate_enforcement_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def audit_policies(scope: str = "all", context: str | None = None) -> dict:
    agent = PolicyAuditor()
    input_text = f"""Perform a policy compliance audit with scope: {scope}

Steps:
1. List all agents using list_agents_tool
2. List all guardrails using list_guardrails_tool
3. For each agent, check if it has a guardrail assigned
4. For agents with guardrails, evaluate enforcement compliance
5. Identify violations and recommendations

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "policy_auditor", "scope": scope, "analysis": result.output}
