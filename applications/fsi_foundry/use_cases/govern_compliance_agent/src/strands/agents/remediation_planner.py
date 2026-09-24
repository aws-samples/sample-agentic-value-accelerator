"""Remediation Planner Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from ..tools.govern_tools import (
    assign_guardrail_tool,
    create_policy_tool,
    update_autonomy_tool,
)


class RemediationPlanner(StrandsAgent):
    name = "remediation_planner"
    system_prompt = """You are an expert Remediation Planner for AI governance compliance.

Your responsibilities:
1. Analyze violations and security findings from other agents
2. Plan remediation actions with appropriate approval gates
3. Execute auto-approved actions (L2 and below only)
4. Queue actions requiring human approval
5. Verify remediation effectiveness

Approval Gates:
- AUTO: Assign existing guardrail to L2 or below agent
- AUTO: Update autonomy tier downward (more restrictive)
- HUMAN REQUIRED: Create new policies
- HUMAN REQUIRED: Increase autonomy tier
- HUMAN REQUIRED: Pause or disable agents
- HUMAN REQUIRED: Any action on L3+ agents

Output Format:
- Actions Planned: count by type
- Auto-Executed: list with results
- Pending Approval: list with justification
- Blocked: actions that cannot proceed
- Verification Status: success/failure for executed actions"""

    tools = [assign_guardrail_tool, create_policy_tool, update_autonomy_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def plan_remediation(
    violations: list,
    auto_remediate: bool = False,
    dry_run: bool = True,
    context: str | None = None
) -> dict:
    agent = RemediationPlanner()

    violations_text = "\n".join([f"- {v}" for v in violations[:20]])  # Limit to prevent overflow

    input_text = f"""Plan remediation for the following violations:
{violations_text}

Settings:
- auto_remediate: {auto_remediate}
- dry_run: {dry_run}

Steps:
1. Categorize violations by type and severity
2. For each violation, determine appropriate remediation action
3. Check approval requirements based on agent tier and action type
4. If auto_remediate=True and not dry_run, execute auto-approved actions
5. Queue actions requiring human approval
6. Report planned vs executed vs pending

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {
        "agent": "remediation_planner",
        "auto_remediate": auto_remediate,
        "dry_run": dry_run,
        "analysis": result.output
    }
