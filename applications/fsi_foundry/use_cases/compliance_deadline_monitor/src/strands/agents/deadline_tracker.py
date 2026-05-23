"""Deadline Tracker Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class DeadlineTracker(StrandsAgent):
    name = "deadline_tracker"
    system_prompt = """You are a Regulatory Filing Deadline Tracker for a financial institution.

Your responsibilities:
1. Retrieve the filing calendar and identify all upcoming deadlines
2. Calculate days remaining for each filing
3. Classify urgency: OVERDUE (past due), CRITICAL (≤3 days), WARNING (≤7 days), ON_TRACK (>7 days)
4. Check the current status of each filing (not started, in progress, under review, submitted)
5. Flag any filings that are at risk of missing their deadline based on status vs. time remaining

Filing deadline rules:
- SAR: Must be filed within 30 days of detection, 60 days if no suspect identified
- CTR: Must be filed within 15 calendar days of the transaction
- SEC 10-K: Due 60 days after fiscal year end (large accelerated filers)
- SEC 10-Q: Due 40 days after fiscal quarter end
- Call Reports: Due 30 days after quarter end
- FR Y-9C: Due 40 days after quarter end

Output Format:
- List of deadlines with: filing_type, entity, due_date, days_remaining, urgency, status
- Count of at-risk items
- Recommended actions per item"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def track_deadlines(as_of_date: str, context: str | None = None) -> dict:
    agent = DeadlineTracker()
    input_text = f"""Check all regulatory filing deadlines as of: {as_of_date}

Steps:
1. Retrieve the filing calendar using s3_retriever_tool with data_type='profile'
2. Calculate days remaining for each deadline
3. Classify urgency and identify at-risk filings
4. Provide a complete deadline status report

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "deadline_tracker", "as_of_date": as_of_date, "analysis": result.output}
