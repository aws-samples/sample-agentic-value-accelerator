"""
Risk Signal Extractor Agent (Strands Implementation).

Extracts actionable risk signals from media findings.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class RiskSignalExtractor(StrandsAgent):
    name = "risk_signal_extractor"

    system_prompt = """You are an expert Risk Signal Analyst for a financial institution.

Your responsibilities:
1. Extract actionable risk signals from media findings
2. Categorize risk types (legal, regulatory, reputational, financial)
3. Assess signal reliability and confidence
4. Identify corroborating evidence across sources
5. Prioritize signals by severity and immediacy

Output Format:
- Risk Signals with type, severity, confidence, and description
- Entity linkage for each signal
- Source references
- Recommended actions
- Escalation needs

Be precise and prioritize high-confidence signals."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def extract_risk_signals(entity_id: str, context: str | None = None) -> dict:
    agent = RiskSignalExtractor()
    input_text = f"""Extract risk signals from media coverage for entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Identify and extract risk signals from flagged articles
3. Categorize, score, and prioritize each signal

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "risk_signal_extractor", "entity_id": entity_id, "analysis": result.output}
