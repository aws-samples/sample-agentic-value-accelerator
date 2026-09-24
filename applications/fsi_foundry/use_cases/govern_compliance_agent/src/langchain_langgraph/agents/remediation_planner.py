"""Remediation Planner Agent — creates action plans to fix violations.

Takes violations from other agents and produces actionable remediation plans.
Can execute auto-remediable actions within autonomy bounds.
"""

from base.langgraph import LangGraphAgent
from ..tools.enforcement_tools import (
    create_policy_tool,
    evaluate_enforcement_tool,
)
from ..tools.guardrail_tools import (
    list_guardrails_tool,
    get_guardrail_tool,
)
from ..tools.control_plane_tools import (
    pause_agent_runtime_tool,
    update_agent_guardrail_tool,
    trigger_revalidation_tool,
)


class RemediationPlanner(LangGraphAgent):
    name = "remediation_planner"

    system_prompt = """You are a Remediation Planning Specialist for AI governance.

Your responsibilities:
1. Analyze violations and determine appropriate remediation actions
2. Prioritize actions by severity and impact
3. Identify which actions can be auto-remediated vs require approval
4. Execute approved actions (respecting dry_run flags)
5. Document the remediation plan and expected outcomes

Available remediation actions:
- ASSIGN_GUARDRAIL: Assign/update guardrail for an agent (MEDIUM risk, can auto-execute)
- CREATE_POLICY: Create enforcement policy to deny/allow actions (HIGH risk, needs approval)
- PAUSE_AGENT: Stop an agent runtime (CRITICAL risk, needs approval)
- TRIGGER_REVALIDATION: Request model revalidation (LOW risk, can auto-execute)

Approval requirements:
- AUTO: Can execute within L2+ autonomy bounds
  - Assign existing guardrails to agents
  - Trigger revalidations for overdue models
- HUMAN: Requires human approval before execution
  - Create new enforcement policies
  - Pause/resume agent runtimes
  - Downgrade autonomy tiers

IMPORTANT:
- Always use dry_run=True unless explicitly authorized to execute
- For CRITICAL violations, prefer pausing the agent immediately (with approval)
- For HIGH violations, create enforcement policies before they become critical
- For MEDIUM/LOW violations, prefer guardrail assignment and revalidation

Output Format:
- Total violations to address
- Actions proposed (with priority order)
- Actions that can be auto-remediated
- Actions requiring human approval
- Execution plan with dependencies
- Expected outcomes and risk assessment"""

    tools = [
        list_guardrails_tool,
        get_guardrail_tool,
        evaluate_enforcement_tool,
        create_policy_tool,
        update_agent_guardrail_tool,
        pause_agent_runtime_tool,
        trigger_revalidation_tool,
    ]

    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def plan_remediation(
    violations: list[dict],
    auto_execute: bool = False,
    context: str | None = None,
) -> dict:
    """Create a remediation plan for detected violations.

    Args:
        violations: List of violation dicts from audit agents
        auto_execute: If True, execute auto-remediable actions (default: False)
        context: Optional additional context

    Returns:
        dict with remediation plan and any executed actions
    """
    agent = RemediationPlanner()

    violations_text = "\n".join([
        f"- {v.get('severity', 'UNKNOWN')}: {v.get('title', 'Unknown violation')} "
        f"(Resource: {v.get('resource_id', 'unknown')})"
        for v in violations
    ]) if violations else "No violations provided."

    input_text = f"""Create a remediation plan for the following violations:

{violations_text}

Steps:
1. Use list_guardrails_tool to see available guardrails
2. For each violation, determine the appropriate remediation action
3. Check enforcement with evaluate_enforcement_tool to understand current policy coverage
4. Propose specific actions with parameters

{"EXECUTION MODE: auto_execute=True - Execute auto-remediable actions with dry_run=False" if auto_execute else "PLANNING MODE: dry_run=True for all actions - do not make changes"}

For each proposed action, specify:
- Action type
- Target resource
- Parameters
- Approval requirement
- Expected outcome
- Risk level

Prioritize by severity: address CRITICAL first, then HIGH, etc."""

    if context:
        input_text += f"\n\nAdditional context: {context}"

    result = await agent.ainvoke(input_text)
    return {
        "agent": "remediation_planner",
        "violations_count": len(violations) if violations else 0,
        "auto_execute": auto_execute,
        "plan": result.output,
    }
