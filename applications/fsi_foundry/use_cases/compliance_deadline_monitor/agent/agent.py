import json
import logging
from datetime import datetime, timezone, date
import boto3
from strands import Agent, tool
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.models.bedrock import BedrockModel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = BedrockAgentCoreApp()
model = BedrockModel(model_id="amazon.nova-pro-v1:0")
s3 = boto3.client("s3")

# Sample filing calendar — in production this would come from a database or S3
SAMPLE_FILINGS = [
    {"filing_type": "sar", "entity": "Case #SAR-2024-0891", "due_date": "2024-03-18", "status": "in_progress"},
    {"filing_type": "sar", "entity": "Case #SAR-2024-0903", "due_date": "2024-03-20", "status": "not_started"},
    {"filing_type": "ctr", "entity": "Branch 042 — batch 2024-03-01", "due_date": "2024-03-16", "status": "under_review"},
    {"filing_type": "ctr", "entity": "Branch 007 — batch 2024-03-03", "due_date": "2024-03-18", "status": "submitted"},
    {"filing_type": "sec_10k", "entity": "FNB Holdings Inc.", "due_date": "2024-03-29", "status": "in_progress"},
    {"filing_type": "call_report", "entity": "First National Bank", "due_date": "2024-04-30", "status": "not_started"},
]


@tool
def get_filing_calendar(as_of_date: str = "") -> str:
    """Retrieve the regulatory filing calendar with current statuses. Returns JSON list of filings."""
    check_date = as_of_date or date.today().isoformat()
    filings = []
    for f in SAMPLE_FILINGS:
        due = datetime.strptime(f["due_date"], "%Y-%m-%d").date()
        ref = datetime.strptime(check_date, "%Y-%m-%d").date()
        days_remaining = (due - ref).days
        urgency = "on_track"
        if days_remaining < 0:
            urgency = "overdue"
        elif days_remaining <= 3:
            urgency = "critical"
        elif days_remaining <= 7:
            urgency = "warning"
        filings.append({**f, "days_remaining": days_remaining, "urgency": urgency})
    return json.dumps(filings, indent=2)


@tool
def get_current_date() -> str:
    """Return the current UTC date."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


agent = Agent(
    model=model,
    tools=[get_filing_calendar, get_current_date],
    system_prompt="""You are a Compliance Deadline Monitor for a financial institution.
Every time you are invoked, you must:
1. Get the current date using get_current_date
2. Retrieve the filing calendar using get_filing_calendar
3. Identify any filings that are OVERDUE, CRITICAL (≤3 days), or WARNING (≤7 days)
4. For at-risk filings, recommend specific actions and escalations

Provide a structured JSON response:
{
  "as_of_date": "YYYY-MM-DD",
  "total_deadlines": N,
  "at_risk": N,
  "deadlines": [{"filing_type": "", "entity": "", "due_date": "", "days_remaining": N, "urgency": "", "status": "", "recommended_action": ""}],
  "escalations": ["escalation recommendation strings"],
  "summary": "executive summary"
}""",
)


@app.entrypoint
def invoke(payload):
    prompt = payload.get("prompt", "Run the daily compliance deadline check. Identify all at-risk filings and provide escalation recommendations.")
    result = agent(prompt)
    logger.info(json.dumps({"agent_response": result.message, "prompt": prompt}))
    return {"message": result.message}


if __name__ == "__main__":
    app.run()
