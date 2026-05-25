import json
import logging
import os
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

NOTES_BUCKET = os.environ.get("NOTES_BUCKET", "compliance-deadline-monitor-notes")

# ─────────────────────────────────────────────────────────────────────────────
# DEMO DATA: This hardcoded calendar is for demonstration purposes only.
# In production, replace with a call to your compliance database, DynamoDB table,
# or internal filing management API (e.g., get_filing_calendar → REST/GraphQL).
# ─────────────────────────────────────────────────────────────────────────────
SAMPLE_FILINGS = [
    {"filing_type": "sar", "entity": "Case #SAR-2026-0891", "due_date": "2026-05-20", "status": "in_progress"},
    {"filing_type": "sar", "entity": "Case #SAR-2026-0903", "due_date": "2026-05-26", "status": "not_started"},
    {"filing_type": "ctr", "entity": "Branch 042 — batch 2026-05-01", "due_date": "2026-05-16", "status": "under_review"},
    {"filing_type": "ctr", "entity": "Branch 007 — batch 2026-05-03", "due_date": "2026-05-28", "status": "submitted"},
    {"filing_type": "sec_10k", "entity": "FNB Holdings Inc.", "due_date": "2026-06-15", "status": "in_progress"},
    {"filing_type": "call_report", "entity": "First National Bank", "due_date": "2026-06-30", "status": "not_started"},
]


@tool
def get_filing_calendar(as_of_date: str = "") -> str:
    """Retrieve the regulatory filing calendar with current statuses and days remaining."""
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


@tool
def read_analyst_notes(bucket: str = "", prefix: str = "analyst-notes/") -> str:
    """Read all analyst notes and updates from S3. These are freeform text files
    containing context about filing progress, blockers, staffing issues, and other
    information not captured in the structured filing calendar."""
    target_bucket = bucket or NOTES_BUCKET
    try:
        response = s3.list_objects_v2(Bucket=target_bucket, Prefix=prefix)
        if "Contents" not in response:
            return "No analyst notes found."
        notes = []
        for obj in response["Contents"]:
            if obj["Key"].endswith(".txt"):
                body = s3.get_object(Bucket=target_bucket, Key=obj["Key"])["Body"]
                content = body.read().decode("utf-8", errors="replace")
                notes.append(f"--- {obj['Key']} ---\n{content}")
        return "\n\n".join(notes) if notes else "No analyst notes found."
    except Exception as e:
        return f"Error reading analyst notes: {str(e)}"


agent = Agent(
    model=model,
    tools=[get_filing_calendar, get_current_date, read_analyst_notes],
    system_prompt="""You are a Compliance Deadline Monitor for a financial institution.

Your job is to cross-reference STRUCTURED data (the filing calendar) with UNSTRUCTURED context
(analyst notes, emails, updates) to make informed judgment calls about the true risk posture
of each filing — not just what the system says.

Every time you are invoked, you must:
1. Get the current date using get_current_date
2. Retrieve the filing calendar using get_filing_calendar
3. Read analyst notes using read_analyst_notes to get real-world context
4. Cross-reference the two: Does the analyst context contradict or add nuance to the system status?
   - A filing marked "in_progress" might actually be blocked
   - A filing marked "not_started" might have a valid reason (awaiting legal, extension filed)
   - An analyst on PTO means their filings need reassignment
5. Provide your assessment with REASONING for each at-risk filing

Provide a structured JSON response:
{
  "as_of_date": "YYYY-MM-DD",
  "total_deadlines": N,
  "at_risk": N,
  "deadlines": [
    {
      "filing_type": "",
      "entity": "",
      "due_date": "",
      "days_remaining": N,
      "urgency": "",
      "system_status": "",
      "actual_status": "your assessment based on analyst notes",
      "reasoning": "why you believe the actual status differs or confirms the system status",
      "recommended_action": "specific action considering the full context"
    }
  ],
  "escalations": ["escalation recommendation strings with reasoning"],
  "summary": "executive summary highlighting where analyst context changed your assessment"
}""",
)


@app.entrypoint
def invoke(payload):
    prompt = payload.get("prompt", "Run the daily compliance deadline check. Cross-reference the filing calendar with analyst notes to identify true risk posture and provide escalation recommendations.")
    result = agent(prompt)
    logger.info(json.dumps({"agent_response": result.message, "prompt": prompt}))
    return {"message": result.message}


if __name__ == "__main__":
    app.run()
