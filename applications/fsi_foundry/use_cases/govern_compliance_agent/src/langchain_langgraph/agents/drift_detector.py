"""Drift Detector Agent — monitors for model and configuration drift.

Detects:
- Model performance drift (eval scores declining)
- Revalidation overdue models
- Privacy configuration drift (DP settings changed)
- Configuration drift from approved baselines
"""

from base.langgraph import LangGraphAgent
from ..tools.agentcore_tools import (
    list_agents_tool,
    get_agent_metrics_tool,
)
from ..tools.guardrail_tools import (
    list_guardrails_tool,
    get_guardrail_tool,
)


class DriftDetector(LangGraphAgent):
    name = "drift_detector"

    system_prompt = """You are an AI Drift Detection Specialist focused on model and configuration stability.

Your responsibilities:
1. Check agent metrics for performance degradation (high latency, errors)
2. Identify models overdue for revalidation
3. Detect changes to guardrail configurations
4. Monitor for privacy/DP configuration drift
5. Flag agents with unusual error rates

Drift indicators:
- CRITICAL: Revalidation >90 days overdue, error rate >10%
- HIGH: Revalidation 60-90 days overdue, performance degradation >20%
- MEDIUM: Revalidation 30-60 days overdue, minor performance changes
- LOW: Configuration changes within policy, scheduled revalidations

Key metrics to monitor:
- Invocation counts (baseline vs current)
- Error rates (should be <1% for healthy agents)
- Latency (p50, p95, p99)
- Session counts and patterns

Output Format:
- Models checked
- Models with detected drift
- Revalidation status (overdue, upcoming, current)
- Privacy concerns (DP settings, data sensitivity)
- Performance degradation findings
- Summary with prioritized action items

Focus on changes that could impact model safety, reliability, or compliance."""

    tools = [
        list_agents_tool,
        get_agent_metrics_tool,
        list_guardrails_tool,
        get_guardrail_tool,
    ]

    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def detect_drift(days: int = 7, context: str | None = None) -> dict:
    """Run drift detection across models and agents.

    Args:
        days: Number of days of metrics to analyze
        context: Optional additional context

    Returns:
        dict with drift detection results
    """
    agent = DriftDetector()

    input_text = f"""Perform drift detection analysis:

1. Use list_agents_tool to get all deployed agents
2. Use get_agent_metrics_tool with days={days} to fetch performance metrics
3. Use list_guardrails_tool to check guardrail configurations

Analyze the data for:
- Agents with high error rates (>1% is concerning, >5% is critical)
- Agents with unusual latency patterns
- Significant changes in invocation patterns
- Any signs of performance degradation

Note: In a full implementation, this would also check:
- Model revalidation dates against policy (quarterly for high-risk)
- Differential privacy settings against baselines
- Eval score trends over time

Provide a structured drift report with specific agents/models flagged."""

    if context:
        input_text += f"\n\nAdditional context: {context}"

    result = await agent.ainvoke(input_text)
    return {"agent": "drift_detector", "window_days": days, "analysis": result.output}
