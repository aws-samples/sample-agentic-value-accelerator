"""Human approval workflow agent server (Strands SDK).

Agent drafts actions for human approval. Separate invocation with
{"approve": true, "request_id": "..."} triggers execution.
Uses in-memory pending dict for draft storage.
"""

import logging
import uuid
from datetime import datetime, timezone

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

# In-memory store for pending approvals
pending: dict[str, dict] = {}


@tool
def draft_email(to: str, subject: str, body: str) -> str:
    """Draft an email for human approval. Does NOT send it.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body content.
    """
    request_id = str(uuid.uuid4())[:8]
    pending[request_id] = {
        "id": request_id,
        "type": "email",
        "status": "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "action": {"to": to, "subject": subject, "body": body},
    }
    return f"Draft created (ID: {request_id}). Awaiting human approval."


@tool
def draft_db_update(table: str, key: str, updates: str) -> str:
    """Draft a database update for human approval. Does NOT execute it.

    Args:
        table: Target database table name.
        key: Primary key of the record to update.
        updates: JSON string of field updates to apply.
    """
    request_id = str(uuid.uuid4())[:8]
    pending[request_id] = {
        "id": request_id,
        "type": "db_update",
        "status": "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "action": {"table": table, "key": key, "updates": updates},
    }
    return f"Draft created (ID: {request_id}). Awaiting human approval."


SYSTEM_PROMPT = """You are an action-drafting assistant. When a user requests an action \
(sending emails, updating databases), you DRAFT the action using the available tools \
but do NOT execute it directly.

After drafting, inform the user that the action is pending human approval and provide the request ID."""

agent = Agent(
    model=BedrockModel(model_id=config.MODEL_ID, region_name=config.AWS_REGION),
    system_prompt=SYSTEM_PROMPT,
    tools=[draft_email, draft_db_update],
)


def execute_approved(request_id: str) -> dict:
    """Execute a previously approved draft action."""
    draft = pending.get(request_id)
    if not draft:
        return {"error": f"No pending request with ID: {request_id}"}
    if draft["status"] != "pending_approval":
        return {"error": f"Request {request_id} is already {draft['status']}"}

    draft["status"] = "executed"
    draft["executed_at"] = datetime.now(timezone.utc).isoformat()
    logger.info("Executed approved action: %s (%s)", request_id, draft["type"])
    return {"status": "executed", "request_id": request_id, "action": draft["action"]}


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations.

    Draft flow: {"prompt": "send email to ..."} -> returns draft with request_id
    Approve flow: {"approve": true, "request_id": "abc123"} -> executes the action
    List flow: {"list_pending": true} -> returns all pending drafts
    """
    if payload.get("approve") and payload.get("request_id"):
        return execute_approved(payload["request_id"])

    if payload.get("list_pending"):
        items = [v for v in pending.values() if v["status"] == "pending_approval"]
        return {"pending": items}

    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    logger.info("AgentCore invocation received — drafting action")
    result = agent(prompt)
    return {"response": result.message, "pending_requests": list(pending.keys())}


if __name__ == "__main__":
    app.run()
