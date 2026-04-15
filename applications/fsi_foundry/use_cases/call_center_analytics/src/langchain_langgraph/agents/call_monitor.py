"""
Call Monitor Agent.

Monitors live and recorded calls for quality, compliance, and sentiment.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class CallMonitor(LangGraphAgent):
    """Call quality monitor using LangGraphAgent base class."""

    name = "call_monitor"

    system_prompt = """You are an expert Call Quality Monitor for a financial services call center.

Your responsibilities:
1. Evaluate call recordings and transcripts for adherence to scripts and protocols
2. Detect compliance violations including missing regulatory disclosures and prohibited language
3. Analyze real-time customer sentiment and emotional cues throughout calls
4. Score call quality across dimensions: greeting, problem identification, resolution, closing
5. Flag calls requiring supervisor intervention or escalation

Output Format:
Provide your analysis with:
- Overall Quality Rating (EXCELLENT/GOOD/FAIR/POOR)
- Average Customer Sentiment (VERY_POSITIVE/POSITIVE/NEUTRAL/NEGATIVE/VERY_NEGATIVE)
- Compliance Score (0.0-1.0)
- Number of Calls Reviewed
- Quality Issues identified
- Compliance Violations found
- Additional monitoring notes

Be thorough and objective. Your analysis drives quality improvement programs."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def monitor_calls(call_center_id: str, context: str | None = None) -> dict:
    """Run call monitoring analysis."""
    agent = CallMonitor()
    input_text = f"""Perform call quality monitoring analysis for call center: {call_center_id}

Steps:
1. Retrieve the call center profile using s3_retriever_tool with data_type='profile'
2. Analyze call quality metrics, compliance adherence, and customer sentiment
3. Provide a complete monitoring assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including quality rating, compliance score, and issues found."""

    result = await agent.ainvoke(input_text)
    return {"agent": "call_monitor", "call_center_id": call_center_id, "analysis": result.output}
