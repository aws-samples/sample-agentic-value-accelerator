"""Payments-fraud agent server (Strands SDK) — AgentCore Runtime entrypoint.

Routes an incoming payload to the right specialist (or the supervisor), invokes the
agent, and validates the model's JSON output against the locked contracts in
``contracts.py``. Output enforcement is prompt-driven (each specialist is told to
return JSON matching its contract); this entrypoint parses and validates it, so
callers always get either a contract-shaped object or a structured error.

Request routing (payload "action" field, or inferred from payload shape):
    - "score"        -> Transaction Scorer   -> ScoreResult
    - "investigate"  -> Investigation Agent  -> InvestigationResult
    - "sar"          -> SAR Report Agent     -> SARReport
    - "chat"/absent  -> Supervisor (free-form NL, may delegate/chain)

Run locally:
    python -m src.agent.main        # (Docker copies src/strands -> src/agent)
    POST /invocations  with e.g. {"action": "investigate", "account_id": "A705",
                                  "prompt": "What is suspicious about this account?"}
"""

import json
import logging
import re

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from . import config
from .agents import (
    create_investigator,
    create_sar_reporter,
    create_scorer,
    create_supervisor,
)
from .contracts import InvestigationResult, SARReport, ScoreResult

config.configure_observability()
logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _result_text(result) -> str:
    """Extract assistant text from a Strands agent result.

    ``result.message`` is the documented field; it may be a plain string or a
    message dict with content blocks. Fall back to ``str(result)``.
    """
    msg = getattr(result, "message", result)
    if isinstance(msg, str):
        return msg
    if isinstance(msg, dict):
        content = msg.get("content", msg)
        if isinstance(content, list):
            return "".join(
                block.get("text", "") for block in content if isinstance(block, dict)
            ) or json.dumps(content)
        return str(content)
    return str(msg)


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response.

    Specialists are prompted to return only JSON, but models sometimes wrap it in
    a ```json fence or add a stray sentence. Try a strict parse first, then a
    fenced-block parse, then the first balanced {...} span.
    """
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return json.loads(fence.group(1))

    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start : i + 1])
    raise ValueError("no JSON object found in agent response")


def _validate(model_cls, text: str) -> dict:
    """Parse agent text and validate against a contract model.

    Returns the validated model as a dict. On failure, returns a structured error
    envelope that still carries the raw text, so the UI can show *something* and we
    can debug — we never crash the entrypoint on a malformed model response.
    """
    try:
        return model_cls.model_validate(_extract_json(text)).model_dump(mode="json")
    except Exception as e:  # noqa: BLE001 — surface parse/validation issues, don't raise
        logger.warning("%s validation failed: %s", model_cls.__name__, e)
        return {"error": "validation_failed", "detail": str(e), "raw": text}


def _prompt_for(action: str, payload: dict) -> str:
    """Build the user prompt for a specialist from the payload."""
    account = payload.get("account_id")
    case = payload.get("case_id")
    user_text = payload.get("prompt", "")
    parts = []
    if account:
        parts.append(f"account_id: {account}")
    if case:
        parts.append(f"case_id: {case}")
    if action == "score" and payload.get("transaction"):
        parts.append("transaction: " + json.dumps(payload["transaction"], default=str))
    if action == "sar" and payload.get("investigation"):
        parts.append("investigation findings: " + json.dumps(payload["investigation"], default=str))
    if user_text:
        parts.append(user_text)
    return "\n".join(parts) if parts else user_text


def _infer_action(payload: dict) -> str:
    if payload.get("action"):
        return payload["action"]
    if payload.get("transaction"):
        return "score"
    return "chat"


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations. Returns a contract-shaped dict (or error)."""
    action = _infer_action(payload)
    prompt = _prompt_for(action, payload)
    if not prompt:
        return {"error": "prompt is required"}

    logger.info("payments-fraud invocation: action=%s", action)

    if action == "score":
        result = create_scorer()(prompt)
        return {"action": action, "result": _validate(ScoreResult, _result_text(result))}

    if action == "investigate":
        result = create_investigator()(prompt)
        return {"action": action, "result": _validate(InvestigationResult, _result_text(result))}

    if action == "sar":
        result = create_sar_reporter()(prompt)
        return {"action": action, "result": _validate(SARReport, _result_text(result))}

    # default: free-form supervisor — may delegate/chain; returns NL text
    result = create_supervisor()(prompt)
    return {"action": "chat", "response": _result_text(result)}


if __name__ == "__main__":
    app.run()
