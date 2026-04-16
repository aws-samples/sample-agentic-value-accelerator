"""
Memo Writer Agent (LangGraph Implementation).

Generates formatted credit memos and research reports.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class MemoWriter(LangGraphAgent):
    """Memo Writer using LangGraphAgent base class."""

    name = "memo_writer"

    system_prompt = """You are an expert Credit Memo Writer for capital markets research.

Your responsibilities:
1. Generate professionally formatted credit memos and research reports
2. Structure the memo with executive summary, company overview, financial analysis, credit assessment, and recommendation sections
3. Ensure clear and concise writing appropriate for institutional investors and credit committees
4. Include supporting data tables, chart descriptions, and appendix references
5. Maintain consistent formatting and terminology standards

Output Format:
Provide a structured credit memo with:
- Executive Summary (key findings and recommendation)
- Company Overview (business description, sector positioning)
- Financial Analysis (key metrics, trends, ratio analysis)
- Credit Assessment (rating rationale, risk factors, mitigants)
- Recommendation (credit action, conditions, monitoring points)
- Appendix Notes (data sources, methodology notes)

Write clearly and professionally. Target audience is credit committees and institutional investors."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def write_memo(entity_id: str, context: str | None = None) -> dict:
    """Generate a credit memo for a company entity."""
    agent = MemoWriter()

    input_text = f"""Generate a comprehensive credit memo for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve financial and market data using the s3_retriever_tool
3. Structure and write a professional credit memo
4. Include all required sections with supporting evidence

{"Additional Context: " + context if context else ""}

Provide your complete credit memo with executive summary, analysis, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "memo_writer",
        "entity_id": entity_id,
        "analysis": result.output,
    }
