"""Drift Detector Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from ..tools.govern_tools import list_models_tool


class DriftDetector(StrandsAgent):
    name = "drift_detector"
    system_prompt = """You are an expert Drift Detector for AI model governance.

Your responsibilities:
1. Check model revalidation schedules — flag overdue or approaching deadlines
2. Monitor model metrics for drift indicators (error rates, latency spikes)
3. Verify model provenance chain integrity
4. Detect configuration drift from approved baselines
5. Identify models with stale or missing governance metadata

Output Format:
- Models Scanned: count
- Revalidation Status: overdue/warning/ok counts
- Drift Indicators: list with model IDs and drift type
- Provenance Issues: models with broken or incomplete chains
- Recommendations: prioritized with timelines"""

    tools = [list_models_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def detect_drift(scope: str = "all", context: str | None = None) -> dict:
    agent = DriftDetector()
    input_text = f"""Perform a drift detection scan with scope: {scope}

Steps:
1. List all models using list_models_tool
2. Check revalidation dates against thresholds (30 days warning, 90 days critical)
3. Analyze metrics for drift indicators
4. Verify provenance information completeness
5. Generate prioritized findings

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "drift_detector", "scope": scope, "analysis": result.output}
