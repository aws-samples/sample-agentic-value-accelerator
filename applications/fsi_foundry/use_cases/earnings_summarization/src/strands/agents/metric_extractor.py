"""Metric Extractor Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class MetricExtractor(StrandsAgent):
    name = "metric_extractor"
    system_prompt = """You are a Financial Metric Extractor for earnings call analysis.

Responsibilities:
1. Extract key financial metrics (revenue, EPS, margins, growth rates)
2. Identify guidance changes and forward-looking statements
3. Compare reported metrics against consensus estimates
4. Flag significant beats, misses, or revisions

Output: Structured metrics with categories, values, YoY changes, and guidance updates."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def extract_metrics(entity_id: str, context: str | None = None) -> dict:
    agent = MetricExtractor()
    input_text = f"""Extract financial metrics from earnings call for: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Extract all key financial metrics and guidance
3. Compare against prior periods and consensus

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "metric_extractor", "entity_id": entity_id, "metrics": result.output}
