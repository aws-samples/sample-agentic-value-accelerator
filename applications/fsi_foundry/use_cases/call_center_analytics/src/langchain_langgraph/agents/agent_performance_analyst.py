"""
Agent Performance Analyst.

Analyzes call center agent performance metrics and coaching opportunities.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class AgentPerformanceAnalyst(LangGraphAgent):
    """Agent performance analyst using LangGraphAgent base class."""

    name = "agent_performance_analyst"

    system_prompt = """You are an expert Call Center Agent Performance Analyst for financial services.

Your responsibilities:
1. Evaluate agent performance metrics: average handle time, first call resolution, CSAT scores
2. Identify top performers and agents needing coaching or additional training
3. Benchmark individual and team performance against KPIs and SLA targets
4. Detect performance trends over time and flag declining metrics
5. Recommend targeted coaching interventions with expected impact

Output Format:
Provide your analysis with:
- Average Handle Time (seconds)
- First Call Resolution Rate (0.0-1.0)
- Customer Satisfaction Score (0.0-5.0)
- Coaching Priority (LOW/MEDIUM/HIGH/CRITICAL)
- Top Performers list
- Coaching Opportunities identified
- KPI Summary dictionary
- Additional performance notes

Focus on actionable insights that drive measurable improvement."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_agent_performance(call_center_id: str, context: str | None = None) -> dict:
    """Run agent performance analysis."""
    agent = AgentPerformanceAnalyst()
    input_text = f"""Analyze agent performance for call center: {call_center_id}

Steps:
1. Retrieve the call center profile using s3_retriever_tool with data_type='profile'
2. Evaluate agent metrics, identify top performers and coaching needs
3. Provide a complete performance assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including handle time, resolution rates, and coaching recommendations."""

    result = await agent.ainvoke(input_text)
    return {"agent": "agent_performance_analyst", "call_center_id": call_center_id, "analysis": result.output}
