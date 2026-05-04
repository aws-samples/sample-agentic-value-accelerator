"""
Direct Bedrock chat Lambda — bypasses AgentCore.
Allows the UI to select a model per request and measure performance.

POST /api/bedrock-chat
{
  "message": "Investigate account A705",
  "model": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}]
}

Returns:
{
  "success": true,
  "response": "...",
  "metrics": { "model": "...", "inputTokens": 120, "outputTokens": 350, "latencyMs": 4500 }
}

Environment variables:
  TABLE_TXN_LOGS - DynamoDB table (default: txn_logs)
"""
import os
import json
import time
from datetime import datetime, timedelta
from decimal import Decimal
from collections import Counter

import boto3

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
TABLE_NAME = os.environ.get("TABLE_TXN_LOGS", "txn_logs")
DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0"

AVAILABLE_MODELS = {
    "Claude Sonnet 4": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "Claude Haiku 4": "us.anthropic.claude-haiku-4-20250514-v1:0",
    "Amazon Nova Pro": "us.amazon.nova-pro-v1:0",
    "Amazon Nova Lite": "us.amazon.nova-lite-v1:0",
    "Amazon Nova Micro": "us.amazon.nova-micro-v1:0",
}

ddb = boto3.resource("dynamodb", region_name=REGION)
table = ddb.Table(TABLE_NAME)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)

SYSTEM_PROMPT = """You are a SAR (Suspicious Activity Report) analyst assistant with FULL ACCESS to the transaction database.

The transaction data context provided below contains ALL transactions from the database. Use this data to answer ANY question about:
- Specific transactions (by ID, amount, source, destination, date)
- Account activity (how many transactions, total amounts, patterns)
- Decision counts (HOLD_AND_CASE, STEP_UP_REVIEW, APPROVE)
- Reason tags (SMURFING, HIGH_VELOCITY, FAN_IN_TO_DST, GEO_COUNTRY_CHANGE, etc.)
- Risk patterns and suspicious activity

IMPORTANT RULES:
- ALWAYS use the provided data to answer. Never say you don't have access.
- If the user asks about something not in the data, say "I checked the database and found no matching records for [X]."
- When asked "how many", count from the data and give exact numbers.
- When asked about a specific transaction or account, find it in the data and give full details.
- Be concise with specific numbers, amounts, and dates.
- Decision meanings: HOLD_AND_CASE = high risk (score >= 0.95 or flagged by rules), STEP_UP_REVIEW = medium risk, APPROVE = low risk
- Structuring threshold: $95-$100 (demo; real AML uses $9,500-$10,000)"""


def _decimal(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def _cors(body, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
        "body": json.dumps(body, default=_decimal),
    }


def get_account_context(prompt):
    """Fetch all transaction data and build context for the LLM."""
    try:
        items, kwargs = [], {"Limit": 500}
        while True:
            r = table.scan(**kwargs)
            items.extend(r.get("Items", []))
            if "LastEvaluatedKey" not in r or len(items) >= 500:
                break
            kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]

        if not items:
            return "No transactions found in database."

        # Build overall stats
        by_decision = {}
        by_src = {}
        all_tags = {}
        for item in items:
            dec = item.get("decision", "UNKNOWN")
            by_decision[dec] = by_decision.get(dec, 0) + 1
            src = item.get("src", "")
            if src not in by_src:
                by_src[src] = {"count": 0, "hold": 0, "review": 0, "total_amt": 0, "tags": set(), "dsts": set()}
            by_src[src]["count"] += 1
            by_src[src]["total_amt"] += float(item.get("amount", 0))
            if dec == "HOLD_AND_CASE": by_src[src]["hold"] += 1
            if dec == "STEP_UP_REVIEW": by_src[src]["review"] += 1
            by_src[src]["dsts"].add(item.get("dst", ""))
            for tag in (item.get("reason_tags") or []):
                by_src[src]["tags"].add(tag)
                all_tags[tag] = all_tags.get(tag, 0) + 1

        lines = []
        lines.append(f"TOTAL TRANSACTIONS: {len(items)}")
        lines.append(f"BY DECISION: {json.dumps(by_decision)}")
        lines.append(f"TOP REASON TAGS: {json.dumps(dict(sorted(all_tags.items(), key=lambda x: -x[1])[:10]))}")
        lines.append("")
        lines.append("ACCOUNT SUMMARIES (top 15 by risk):")
        for src, info in sorted(by_src.items(), key=lambda x: -(x[1]["hold"] + x[1]["review"]))[:15]:
            lines.append(f"  {src}: {info['count']} txns, ${info['total_amt']:.0f}, HOLD={info['hold']}, REVIEW={info['review']}, dsts={len(info['dsts'])}, tags=[{', '.join(info['tags']) or 'none'}]")

        # Specific transaction lookup
        prompt_upper = prompt.upper()
        matched = [i for i in items if i.get("txn_id", "").upper() in prompt_upper or
                   any(w.upper() in i.get("txn_id", "").upper() for w in prompt.split() if len(w) > 8)]
        if matched:
            lines.append(f"\nMATCHED TRANSACTIONS ({len(matched)}):")
            for item in matched:
                lines.append(json.dumps({"txn_id": item.get("txn_id"), "src": item.get("src"), "dst": item.get("dst"),
                    "amount": float(item.get("amount", 0)), "timestamp": item.get("timestamp"),
                    "decision": item.get("decision"), "fraud_score": float(item.get("fraud_score", 0)),
                    "reason_tags": item.get("reason_tags", []),
                    "geo": (item.get("request") or {}).get("geo"),
                    "device_id": (item.get("request") or {}).get("device_id")}, default=str))

        # Account-specific lookup
        for word in prompt.split():
            if len(word) < 3: continue
            acct_matches = [i for i in items if word.upper() == i.get("src", "").upper() or word.upper() == i.get("dst", "").upper()]
            if 0 < len(acct_matches) <= 30:
                lines.append(f"\nTRANSACTIONS FOR '{word}' ({len(acct_matches)}):")
                for item in acct_matches[:20]:
                    lines.append(json.dumps({"txn_id": item.get("txn_id"), "src": item.get("src"), "dst": item.get("dst"),
                        "amount": float(item.get("amount", 0)), "decision": item.get("decision"),
                        "reason_tags": item.get("reason_tags", [])}, default=str))
                break

        return "\n".join(lines)
    except Exception as e:
        return f"DATABASE ERROR: {e}"


def chat(prompt, model_id, history=None):
    """Call Bedrock Converse API directly with model selection."""
    # Build context from DynamoDB
    db_context = get_account_context(prompt)

    # Build messages
    messages = []
    if history:
        for msg in history[-20:]:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": [{"text": content[:2000]}]})

    # Add DB context to the user message
    user_msg = prompt
    if db_context:
        user_msg = f"Transaction data context:\n{db_context}\n\nUser question: {prompt}"
    messages.append({"role": "user", "content": [{"text": user_msg}]})

    t0 = time.time()
    resp = bedrock.converse(
        modelId=model_id,
        system=[{"text": SYSTEM_PROMPT}],
        messages=messages,
        inferenceConfig={"maxTokens": 2048, "temperature": 0.3},
    )
    elapsed_ms = int((time.time() - t0) * 1000)

    text = resp["output"]["message"]["content"][0]["text"]
    usage = resp.get("usage", {})

    return text, {
        "model": model_id,
        "inputTokens": usage.get("inputTokens", 0),
        "outputTokens": usage.get("outputTokens", 0),
        "latencyMs": elapsed_ms,
    }


def lambda_handler(event, context):
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("path") or event.get("rawPath", "")

    if method == "OPTIONS":
        return _cors({})

    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    # List available models
    if path.endswith("/bedrock-chat/models") and method == "GET":
        return _cors({"models": AVAILABLE_MODELS, "default": DEFAULT_MODEL})

    # Chat
    if path.endswith("/bedrock-chat") and method == "POST":
        prompt = body.get("message", "")
        model_id = body.get("model", DEFAULT_MODEL)
        history = body.get("history", [])
        if not prompt:
            return _cors({"success": False, "error": "Missing message"}, 400)
        try:
            response, metrics = chat(prompt, model_id, history)
            return _cors({"success": True, "response": response, "metrics": metrics})
        except Exception as e:
            return _cors({"success": False, "error": str(e)}, 500)

    return _cors({"error": "Not found"}, 404)
