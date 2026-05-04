"""
Lambda backend for Amplify-hosted UI.
Replaces the local proxy server with two API Gateway endpoints:

  POST /api/sars-report  → DynamoDB direct SAR report (~1s)
  POST /api/chat         → AgentCore SAR Agent invocation (~15s)

Environment variables:
  TABLE_TXN_LOGS     - DynamoDB table name (default: txn_logs)
  AGENTCORE_RUNTIME_ID - AgentCore runtime ID
  AWS_REGION         - Region (default: us-east-2)
"""
import os
import json
from datetime import datetime, timedelta
from decimal import Decimal
from collections import Counter

import boto3

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
TABLE_NAME = os.environ.get("TABLE_TXN_LOGS", "txn_logs")
RUNTIME_ID = os.environ.get("AGENTCORE_RUNTIME_ID", "")

ddb = boto3.resource("dynamodb", region_name=REGION)
table = ddb.Table(TABLE_NAME)
agentcore = boto3.client("bedrock-agentcore", region_name=REGION)
_account_id = boto3.client("sts").get_caller_identity()["Account"]

TAG_TO_SAR = {
    "SMURFING": "Structuring / Smurfing",
    "NEAR_REPORTING_THRESHOLD": "Structuring / Smurfing",
    "HIGH_VELOCITY": "Unusual transaction volume",
    "NEW_BENEFICIARY": "New / unknown counterparty",
    "LARGE_AMOUNT": "Inconsistent with expected activity",
    "FAN_IN_TO_DST": "Funnel account / Money mule",
    "MULE_DESTINATION": "Funnel account / Money mule",
    "TIME_ANOMALY": "Unusual time-of-day activity",
    "WEEKEND_ACTIVITY": "Unusual time-of-day activity",
    "GEO_COUNTRY_CHANGE": "Geographic anomaly",
    "GEO_REGION_CHANGE": "Geographic anomaly",
    "GEO_SUDDEN_HOP": "Impossible travel",
    "DEVICE_CHANGE": "Device anomaly",
    "RAPID_DEVICE_CHANGE": "Rapid device switching",
}
TAG_TO_CODE = {"SMURFING": "h", "NEAR_REPORTING_THRESHOLD": "h"}


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


# ── SAR Report (DynamoDB direct, fast) ──────────────────────────

def generate_sar_report(src):
    cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat() + "Z"
    items, kwargs = [], {
        "FilterExpression": "#s = :s",
        "ExpressionAttributeNames": {"#s": "src"},
        "ExpressionAttributeValues": {":s": src},
        "Limit": 200,
    }
    while True:
        r = table.scan(**kwargs)
        items.extend(r.get("Items", []))
        if "LastEvaluatedKey" not in r or len(items) >= 200:
            break
        kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]

    txns = sorted(
        [i for i in items if i.get("timestamp", "") >= cutoff],
        key=lambda x: x.get("timestamp", ""), reverse=True,
    )
    if not txns:
        return f"No transactions found for account {src}."

    total = sum(float(t.get("amount", 0)) for t in txns)
    dsts = sorted(set(t.get("dst", "") for t in txns if t.get("dst")))
    ts_list = sorted(t.get("timestamp", "") for t in txns if t.get("timestamp"))
    decs = Counter(t.get("decision", "UNKNOWN") for t in txns)
    tags = Counter()
    geos, devs = set(), set()
    for t in txns:
        resp = t.get("response", {})
        for tag in (resp.get("reason_tags", []) if isinstance(resp, dict) else t.get("reason_tags", [])):
            tags[tag] += 1
        req = t.get("request", {})
        if isinstance(req, dict):
            if req.get("geo"): geos.add(req["geo"])
            if req.get("device_id"): devs.add(req["device_id"])

    hold = sum(1 for t in txns if t.get("decision") == "HOLD_AND_CASE")
    review = sum(1 for t in txns if t.get("decision") == "STEP_UP_REVIEW")
    cats = sorted(set(TAG_TO_SAR[t] for t in tags if t in TAG_TO_SAR))
    codes = sorted(set(TAG_TO_CODE.get(t, "z") for t in tags if t in TAG_TO_SAR))
    near = sum(1 for t in txns if 95 <= float(t.get("amount", 0)) < 100)

    L = []
    a = L.append
    a(f"# SAR Filing Report — Account: {src}\n")
    a(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  ")
    a(f"**Activity Period:** {ts_list[0]} to {ts_list[-1]}\n\n---\n")
    a("## PART I — FILING INFORMATION")
    a("- **Type of Filing:** Initial")
    a("- **Filing Institution Type:** Money Services Business\n")
    a("## PART II — SUBJECT INFORMATION")
    a(f"- **Subject Account:** {src}")
    a("- **Subject Role:** Account holder — sender")
    a("- **Relationship:** Customer\n")
    a("## PART III — SUSPICIOUS ACTIVITY")
    a(f"- **Date Range:** {ts_list[0]} to {ts_list[-1]}")
    a(f"- **Total Amount:** ${total:,.2f}")
    a(f"- **Transactions:** {len(txns)}")
    a(f"- **FinCEN Codes:** {', '.join('Code ' + c.upper() for c in codes)}")
    a(f"- **Categories:** {', '.join(cats)}")
    a("- **Product Type:** Funds transfer\n")
    a("## PART IV — FINANCIAL INSTITUTION")
    a("*To be populated with institution details*\n")
    a("## PART V — NARRATIVE\n")
    a("### Introduction")
    a(f"This SAR is filed for account {src}. {len(txns)} transactions totaling ${total:,.2f} were flagged.\n")
    a("### Suspicious Activity")
    if tags.get("SMURFING", 0) >= 1:
        a(f"- **⚠️ STRUCTURING:** {tags['SMURFING']} instances below threshold. {near} at $95-$99.99.")
    if tags.get("HIGH_VELOCITY", 0) >= 1:
        a(f"- **High Velocity:** {tags['HIGH_VELOCITY']} burst(s).")
    if tags.get("GEO_SUDDEN_HOP", 0) >= 1:
        a(f"- **Impossible Travel:** {tags['GEO_SUDDEN_HOP']} hops across {len(geos)} locations.")
    if tags.get("RAPID_DEVICE_CHANGE", 0) >= 1:
        a(f"- **Device Anomaly:** {tags['RAPID_DEVICE_CHANGE']} switches across {len(devs)} devices.")
    a(f"\n### Transaction Summary")
    a(f"Of {len(txns)} flagged: **{hold} held**, **{review} escalated**. {len(dsts)} destinations.\n")
    a("### Risk Indicators")
    if hold >= 3: a(f"- {hold} HOLD_AND_CASE decisions")
    if tags.get("SMURFING", 0) >= 2: a(f"- Repeated structuring ({tags['SMURFING']}x)")
    if tags.get("GEO_SUDDEN_HOP", 0) >= 1: a("- Impossible travel detected")
    if near >= 3: a(f"- {near} transactions below $100 — structuring")
    a("\n---\n⚠️ **DRAFT** — Requires compliance officer review before FinCEN submission.")
    return "\n".join(L)


# ── Chat with AgentCore ─────────────────────────────────────────

def chat_with_agent(prompt, session_id="", history=None):
    """Invoke the AgentCore SAR Agent runtime with session context."""
    runtime_arn = f"arn:aws:bedrock-agentcore:{REGION}:{_account_id}:runtime/{RUNTIME_ID}"

    # Build a prompt that includes recent conversation history
    full_prompt = prompt
    if history:
        # Include last 10 exchanges for context
        recent = history[-20:]  # 10 user + 10 assistant messages
        context_lines = []
        for msg in recent:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role and content:
                context_lines.append(f"{role}: {content}")
        if context_lines:
            full_prompt = (
                "Previous conversation:\n"
                + "\n".join(context_lines)
                + f"\n\nuser: {prompt}"
            )

    invoke_kwargs = {
        "agentRuntimeArn": runtime_arn,
        "contentType": "application/json",
        "accept": "application/json",
        "payload": json.dumps({"prompt": full_prompt}).encode("utf-8"),
    }
    if session_id:
        # AgentCore requires session IDs between 33-256 chars
        if len(session_id) < 33:
            session_id = session_id + "-" + "0" * (33 - len(session_id) - 1)
        invoke_kwargs["runtimeSessionId"] = session_id

    resp = agentcore.invoke_agent_runtime(**invoke_kwargs)

    raw = resp["response"].read().decode("utf-8")
    text = ""
    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            chunk = line[6:]
            try:
                text += json.loads(chunk)
            except (json.JSONDecodeError, TypeError):
                text += chunk
    return text


# ── Lambda Handler ──────────────────────────────────────────────

def lambda_handler(event, context):
    import traceback
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("path") or event.get("rawPath", "")

    # CORS preflight
    if method == "OPTIONS":
        return _cors({})

    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    # SAR Report
    if path.endswith("/sars-report") and method == "POST":
        src = body.get("src") or (body.get("transaction", {}) or {}).get("accountId", "")
        if not src:
            return _cors({"success": False, "error": "Missing src/accountId"}, 400)
        try:
            report = generate_sar_report(src)
            return _cors({"success": True, "report": report})
        except Exception as e:
            return _cors({"success": False, "error": str(e)}, 500)

    # Chat
    if path.endswith("/chat") and method == "POST":
        prompt = body.get("message", "")
        session_id = body.get("sessionId", "")
        history = body.get("history", [])
        if not prompt:
            return _cors({"success": False, "error": "Missing message"}, 400)
        try:
            response = chat_with_agent(prompt, session_id, history)
            return _cors({"success": True, "response": response})
        except Exception as e:
            return _cors({"success": False, "error": str(e)}, 500)

    # Transactions (scan txn_logs, return all — replaces CORS-blocked getTxns API)
    if path.endswith("/transactions") and method == "GET":
        try:
            items, kwargs = [], {"Limit": 500}
            while True:
                r = table.scan(**kwargs)
                items.extend(r.get("Items", []))
                if "LastEvaluatedKey" not in r or len(items) >= 500:
                    break
                kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]
            return _cors(items)
        except Exception as e:
            print(f"TRANSACTIONS ERROR: {traceback.format_exc()}")
            return _cors({"error": str(e)}, 500)

    return _cors({"error": "Not found"}, 404)
